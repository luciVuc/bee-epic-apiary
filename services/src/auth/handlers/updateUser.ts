/**
 * PUT /users/:email — OWNER-only.
 *
 * Patch a single field or fields on an existing user record: `role`, `status`,
 * and/or `displayName`. Returns the updated user in public shape (passwordHash
 * stripped). Used by the admin Users tab for role changes, display-name edits,
 * and the enable/disable toggle.
 *
 * Design notes:
 *   - Guard order (matters — first-match wins):
 *       1) target-not-found → 404 USER_NOT_FOUND
 *       2) last-OWNER role-demotion → 400 CANNOT_DEMOTE_LAST_OWNER
 *       3) last-OWNER disable      → 400 CANNOT_DEMOTE_LAST_OWNER (same code:
 *          both scenarios describe "the system is about to lose its last
 *          OWNER"; the error identifies the invariant, not the mechanism)
 *       4) self-disable            → 400 CANNOT_DISABLE_SELF
 *     System-preserving guards (steps 2-3) run BEFORE the self-disable guard:
 *     if a lone OWNER tries to disable herself, both would fire, and we prefer
 *     the invariant-scoped error over the personal-scoped one so the admin UI
 *     surfaces "add a second owner first" rather than "you can't disable
 *     yourself" (which is only accidentally true — she can, once there's a
 *     co-owner).
 *   - Self-demotion IS allowed when co-owners exist: a two-OWNER team can
 *     have OWNER-A step down to MANAGER without help, as long as OWNER-B
 *     remains ACTIVE. `countByRole` excludes DISABLED users so the check is
 *     honest about who can still log in.
 *   - Disable-side effects: when the patch sets `status: DISABLED` we
 *     invalidate outstanding auth artifacts for the target email:
 *       * `deleteAllForEmail(refresh)` — kills every active session (the
 *         cookie's refresh token can no longer round-trip through /refresh).
 *       * `invalidateForEmail(invites)` — kills any outstanding INVITED
 *         handshake so a disabled INVITED account can't be activated.
 *     Both are best-effort: a KV failure here does NOT roll back the user
 *     update. The user is DISABLED in KV and the login flow's DISABLED check
 *     is authoritative — stale families would fail at the /refresh trust
 *     boundary anyway. We log and continue.
 *   - Reset tokens are deliberately NOT invalidated on disable. A disabled
 *     user with an outstanding /request-reset token still can't log in
 *     (login rejects DISABLED before checking the password), so the token
 *     is harmless. Sweeping it would add another KV round-trip to disable
 *     for no security gain.
 *   - Role-change stale-cache: the cached role embedded in an outstanding
 *     `bea_at` access cookie can be stale for up to 1 hour after a role
 *     patch — the cookie only rotates on /refresh. This is the accepted
 *     trade-off documented in the Phase 8 spec; Phase 9's trust-chain swap
 *     narrows it further but does not eliminate it.
 */
import { z } from 'zod';
import { EStaffRole, EUserStatus, StaffRoleSchema, toUserPublic, UserStatusSchema } from '@bee-epic/shared';
import { jsonErr, jsonOk, withAuthHandler } from '../../utils';
import type { ICaller } from '../../utils/resolveCaller';
import { invalidateForEmail as invalidateInvitesForEmail } from '../repo/inviteRepo';
import { deleteAllForEmail as deleteRefreshFamiliesForEmail } from '../repo/refreshFamilyRepo';
import { countByRole, getUser, updateUser } from '../repo/userRepo';
import { extractEmailFromUsersPath } from '../utils/parsePath';

const UpdateUserBodySchema = z
	.object({
		role: StaffRoleSchema.optional(),
		status: UserStatusSchema.optional(),
		displayName: z.string().min(1).max(120).optional(),
	})
	.refine((data) => data.role !== undefined || data.status !== undefined || data.displayName !== undefined, {
		message: 'At least one of role, status, displayName must be provided',
	});

/**
 * Extract the `:email` path parameter from `/users/:email`. Shared with
 * `deleteUser` and `reinviteUser` via `auth/utils/parsePath` — see that
 * module for the trailing-slash / URL-decode / lowercase contract.
 */
async function handleUpdateUser(request: Request, env: Env, origin: string | null, caller?: ICaller): Promise<Response> {
	// Belt-and-braces: the wrapper's requiredRole:OWNER path already 401s
	// anonymous callers, but a static guard keeps the handler safe if the
	// wrapper is ever refactored.
	if (!caller) return jsonErr({ code: 'UNAUTHORIZED' }, origin, env);

	const url = new URL(request.url);
	const targetEmail = extractEmailFromUsersPath(url.pathname);
	if (!targetEmail) {
		return jsonErr({ code: 'NOT_FOUND', resource: url.pathname }, origin, env);
	}

	// Body parse.
	let raw: unknown;
	try {
		raw = await request.json();
	} catch {
		return jsonErr({ code: 'VALIDATION_FAILED', fields: { body: 'Invalid JSON' } }, origin, env);
	}
	const parsed = UpdateUserBodySchema.safeParse(raw);
	if (!parsed.success) {
		const flat = parsed.error.flatten();
		const fields: Record<string, string> = {};
		for (const [k, v] of Object.entries(flat.fieldErrors as Record<string, string[] | undefined>)) {
			if (v && v.length > 0) fields[k] = v[0];
		}
		if (Object.keys(fields).length === 0 && flat.formErrors.length > 0) {
			// The `.refine` failure lives in `formErrors` — surface as `body`.
			fields.body = flat.formErrors[0];
		}
		return jsonErr({ code: 'VALIDATION_FAILED', fields }, origin, env);
	}
	const patch = parsed.data;

	// Target lookup.
	const target = await getUser(env, targetEmail);
	if (!target) {
		return jsonErr({ code: 'USER_NOT_FOUND' }, origin, env);
	}

	// Guards — order matters (see module header).
	const rolePatchIsDemotion = patch.role !== undefined && target.role === EStaffRole.OWNER && patch.role !== EStaffRole.OWNER;
	const statusPatchIsDisable = patch.status === EUserStatus.DISABLED;
	// Short-circuit the KV LIST: the last-OWNER count is only load-bearing when
	// the patch could actually trip that guard — i.e. the target is an OWNER
	// AND the patch either demotes them or disables them. Plain displayName
	// edits (or any patch on a non-OWNER target) skip the LIST entirely, which
	// keeps `PUT /users/:email` O(1) instead of O(user_count).
	const targetIsOwner = target.role === EStaffRole.OWNER;
	const needsOwnerCount = targetIsOwner && (rolePatchIsDemotion || statusPatchIsDisable);
	const targetIsLastOwner = needsOwnerCount && (await countByRole(env, EStaffRole.OWNER)) === 1;

	if (rolePatchIsDemotion && targetIsLastOwner) {
		return jsonErr({ code: 'CANNOT_DEMOTE_LAST_OWNER' }, origin, env);
	}
	if (statusPatchIsDisable && targetIsLastOwner) {
		return jsonErr({ code: 'CANNOT_DEMOTE_LAST_OWNER' }, origin, env);
	}

	const isSelf = caller.email.toLowerCase() === target.email;
	if (statusPatchIsDisable && isSelf) {
		return jsonErr({ code: 'CANNOT_DISABLE_SELF' }, origin, env);
	}

	// Persist. `updateUser` bumps `updatedAt` and re-validates the merged
	// record via `UserSchema.parse`.
	const updated = await updateUser(env, target.email, patch);

	// Disable side-effects — best-effort, do not roll back.
	if (statusPatchIsDisable) {
		try {
			await deleteRefreshFamiliesForEmail(env, target.email);
		} catch (err) {
			console.error('[updateUser] deleteAllForEmail(refresh) failed', err);
		}
		try {
			await invalidateInvitesForEmail(env, target.email);
		} catch (err) {
			console.error('[updateUser] invalidateForEmail(invites) failed', err);
		}
	}

	return jsonOk({ user: toUserPublic(updated) }, origin, env);
}

export default {
	fetch: withAuthHandler('PUT', handleUpdateUser, { requiredRole: EStaffRole.OWNER }),
} satisfies ExportedHandler<Env>;
