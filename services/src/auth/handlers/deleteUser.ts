/**
 * DELETE /users/:email — OWNER-only.
 *
 * Terminal removal of a user account. Distinct from `PUT /users/:email` with
 * `status: DISABLED` (soft deactivate that keeps the record for history and
 * audit): DELETE erases the `user:<email>` record and its index entry along
 * with every server-side auth artifact tied to that email. There is no undo —
 * the admin UI should confirm before calling this.
 *
 * Design notes:
 *   - Guard order (matters — first-match wins):
 *       1) target-not-found     → 404 USER_NOT_FOUND
 *       2) self-delete          → 400 CANNOT_DELETE_SELF
 *       3) last-OWNER delete    → 400 CANNOT_DELETE_LAST_OWNER
 *     The order flips relative to `updateUser`'s disable-vs-self order for a
 *     specific reason: on DELETE, "you can't delete yourself" is a more
 *     actionable message than "you can't delete the last OWNER" (the caller
 *     may not realise they ARE the last OWNER; hearing about themselves first
 *     is the clearer next step: "demote yourself in role isn't a delete,
 *     invite another OWNER first"). The last-OWNER guard is retained as
 *     belt-and-braces for the Phase-8-era `staff`-vs-`user:*` decoupling:
 *     `resolveCaller` reads the `staff` KV list, so an OWNER present in that
 *     list can still be DISABLED (or absent) in `user:*`. That contrived seed
 *     lets a non-self, sole-ACTIVE-OWNER delete reach guard 3. Phase 9 will
 *     unify the lookups; the guard stays for correctness under both.
 *   - Short-circuit the KV LIST for `countByRole`: same optimization as the
 *     revised `updateUser`. The last-OWNER count is only load-bearing when
 *     the target is an OWNER. Deleting a MANAGER/EMPLOYEE/VENDOR skips the
 *     LIST entirely, keeping the common path O(1).
 *   - Side-effect order — sessions → invites → resets → THEN user record.
 *     All three artifact cleanups are best-effort try/catch; the user record
 *     is about to disappear anyway, so a KV blip on the invite index is
 *     better logged than surfaced as a 500. Reset tokens ARE swept here
 *     (unlike `updateUser`'s disable path): on hard-delete the account is
 *     gone, so leaving a reset token that could be used to "reactivate" a
 *     tombstoned email would be a foot-gun (`completeReset` requires the
 *     user record to exist, but defense-in-depth is cheap).
 *   - The FINAL `deleteUser` call is deliberately NOT try/catched. A failure
 *     to persist the delete means the caller MUST see an error (not a false
 *     204 that promises the account is gone). `withAuthHandler`'s outer
 *     try/catch will map an unhandled throw to `500 INTERNAL`.
 */
import { EStaffRole } from '@bee-epic/shared';
import { jsonErr, jsonResponse, withAuthHandler } from '../../utils';
import type { ICaller } from '../../utils/resolveCaller';
import { invalidateForEmail as invalidateInvitesForEmail } from '../repo/inviteRepo';
import { deleteAllForEmail as deleteRefreshFamiliesForEmail } from '../repo/refreshFamilyRepo';
import { invalidateForEmail as invalidateResetsForEmail } from '../repo/resetRepo';
import { countByRole, deleteUser as deleteUserRecord, getUser } from '../repo/userRepo';
import { extractEmailFromUsersPath } from '../utils/parsePath';

/**
 * Extract the `:email` path parameter from `/users/:email`. Shared with
 * `updateUser` and `reinviteUser` via `auth/utils/parsePath` — see that
 * module for the trailing-slash / URL-decode / lowercase contract.
 */
async function handleDeleteUser(request: Request, env: Env, origin: string | null, caller?: ICaller): Promise<Response> {
	// Belt-and-braces: withAuthHandler({requiredRole:OWNER}) already 401s
	// anonymous callers, but keep the static guard so this handler is safe if
	// the wrapper is ever refactored.
	if (!caller) return jsonErr({ code: 'UNAUTHORIZED' }, origin, env);

	const url = new URL(request.url);
	const targetEmail = extractEmailFromUsersPath(url.pathname);
	if (!targetEmail) {
		return jsonErr({ code: 'NOT_FOUND', resource: url.pathname }, origin, env);
	}

	const target = await getUser(env, targetEmail);
	if (!target) {
		return jsonErr({ code: 'USER_NOT_FOUND' }, origin, env);
	}

	// Guard 2: self-delete. Runs before last-OWNER on purpose (see header).
	if (caller.email.toLowerCase() === target.email) {
		return jsonErr({ code: 'CANNOT_DELETE_SELF' }, origin, env);
	}

	// Guard 3: last-OWNER — only meaningful when the target is an OWNER.
	// Skipping the LIST for non-OWNER targets keeps the common path O(1).
	if (target.role === EStaffRole.OWNER) {
		const ownerCount = await countByRole(env, EStaffRole.OWNER);
		if (ownerCount === 1) {
			return jsonErr({ code: 'CANNOT_DELETE_LAST_OWNER' }, origin, env);
		}
	}

	// Best-effort auth-artifact cleanup — if any of these fail, we log and
	// continue; the user record is about to disappear anyway, and any stale
	// refresh/invite/reset without a backing user record will fail at the
	// trust boundaries (login, /refresh, /accept-invite, /complete-reset).
	try {
		await deleteRefreshFamiliesForEmail(env, target.email);
	} catch (err) {
		console.error('[deleteUser] deleteAllForEmail(refresh) failed', err);
	}
	try {
		await invalidateInvitesForEmail(env, target.email);
	} catch (err) {
		console.error('[deleteUser] invalidateForEmail(invites) failed', err);
	}
	try {
		await invalidateResetsForEmail(env, target.email);
	} catch (err) {
		console.error('[deleteUser] invalidateForEmail(resets) failed', err);
	}

	// Terminal — record + index. Deliberately NOT try/catched: a failure here
	// means the account is NOT actually gone, and the caller must see an
	// error rather than a false 204. The wrapper maps unhandled throws to
	// 500 INTERNAL.
	await deleteUserRecord(env, target.email);

	return jsonResponse({ ok: true, data: null }, 204, origin, env);
}

export default {
	fetch: withAuthHandler('DELETE', handleDeleteUser, { requiredRole: EStaffRole.OWNER }),
} satisfies ExportedHandler<Env>;
