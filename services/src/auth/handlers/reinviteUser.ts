/**
 * POST /users/:email/reinvite — OWNER-only. Resend the invitation email for
 * an INVITED user with a fresh single-use token, killing any prior invites
 * for the same address so exactly one live invite exists after the call.
 *
 * Design notes:
 *   - Only INVITED users are re-invitable. An ACTIVE user has already
 *     accepted (nothing to do; sending another invite is at best noise, at
 *     worst a phishing vector aimed at a real logged-in user). A DISABLED
 *     user was intentionally deactivated by an OWNER; letting a reinvite
 *     hand them a fresh acceptance token would circumvent that deactivation
 *     — an OWNER who wants to bring them back should re-enable via
 *     `PUT /users/:email` with `status: ACTIVE`, not push a new invite.
 *   - `USER_ALREADY_ACTIVE` is used for BOTH the ACTIVE and DISABLED cases:
 *     it's the closest existing code to "user is not in an invitable
 *     state". A dedicated `USER_NOT_INVITED` would need a shared/api.ts
 *     change (new error code + admin SPA i18n string), which is out of
 *     Phase-8 scope. Phase 9's trust-chain swap or the Users-tab UI polish
 *     work is the right moment to split them if the widened semantics
 *     confuse admins in practice.
 *   - Invalidate-then-mint order matches inviteUser's ordering intent:
 *     even if the pre-existing invites live under different tokens, the
 *     invalidate pass ensures we don't leak "orphan" invites the OWNER can
 *     no longer see (only the newest link travels via email). If
 *     `invalidateForEmail` fails, we log and continue: the user's status
 *     is INVITED so a new invite is still safe and useful, and the stale
 *     records will fall out via KV TTL. Best-effort matches
 *     `updateUser` / `deleteUser`.
 *   - Fire-and-forget `sendInvite` mirrors `inviteUser`: the invite record
 *     is already committed to KV, so an SMTP blip is recoverable by
 *     re-calling this same endpoint. `inviteSent: true` reports "we
 *     attempted to send" (attempt-report semantics), not "the invitee
 *     received it" — the same convention as `inviteUser`.
 *   - Body is ignored: this endpoint is a pure command, no payload
 *     required. Callers may send `{}` or an empty body; both are accepted
 *     (we never call `request.json()` so a missing content-type is fine).
 *   - 200 (not 201) because no new user resource is being created — the
 *     user was already INVITED before the call and remains INVITED after.
 *     Only the invite token is rotated.
 */
import { EStaffRole, EUserStatus, INVITE_TTL_MS, type IInvite } from '@bee-epic/shared';
import { jsonErr, jsonOk, withAuthHandler } from '../../utils';
import type { ICaller } from '../../utils/resolveCaller';
import { generateUrlSafeToken } from '../crypto/tokens';
import { sendInvite } from '../emails/sendInvite';
import { createInvite, invalidateForEmail } from '../repo/inviteRepo';
import { getUser } from '../repo/userRepo';
import { extractEmailFromUsersPath } from '../utils/parsePath';

async function handleReinviteUser(request: Request, env: Env, origin: string | null, caller?: ICaller): Promise<Response> {
	// Belt-and-braces — the wrapper's requiredRole:OWNER path already 401s
	// anonymous callers, but a static guard keeps the handler safe if the
	// wrapper is ever refactored.
	if (!caller) return jsonErr({ code: 'UNAUTHORIZED' }, origin, env);

	const url = new URL(request.url);
	const targetEmail = extractEmailFromUsersPath(url.pathname, '/reinvite');
	if (!targetEmail) {
		return jsonErr({ code: 'NOT_FOUND', resource: url.pathname }, origin, env);
	}

	const target = await getUser(env, targetEmail);
	if (!target) {
		return jsonErr({ code: 'USER_NOT_FOUND' }, origin, env);
	}

	if (target.status !== EUserStatus.INVITED) {
		// Widened semantics: ACTIVE and DISABLED both surface as
		// USER_ALREADY_ACTIVE. See module header for the rationale and the
		// future USER_NOT_INVITED split.
		return jsonErr({ code: 'USER_ALREADY_ACTIVE' }, origin, env);
	}

	// Best-effort invalidate — a KV blip here does NOT block the reinvite.
	// The stale records will fall out via KV TTL, and the new invite is
	// still useful on its own.
	try {
		await invalidateForEmail(env, target.email);
	} catch (err) {
		console.error('[reinviteUser] invalidateForEmail failed', err);
	}

	const now = Date.now();
	const invite: IInvite = {
		schemaVersion: 1,
		token: generateUrlSafeToken(32),
		email: target.email,
		role: target.role,
		displayName: target.displayName,
		invitedBy: caller.email,
		createdAt: now,
		expiresAt: now + INVITE_TTL_MS,
	};
	await createInvite(env, invite);

	// Fire-and-forget the email. `env.EMAIL` may be unbound in test envs;
	// skip the send call entirely rather than crashing on a missing
	// binding.
	try {
		if (env.EMAIL) await sendInvite(env, invite);
	} catch (err) {
		console.error('[reinviteUser] sendInvite failed', err);
	}

	return jsonOk({ inviteSent: true }, origin, env);
}

export default {
	fetch: withAuthHandler('POST', handleReinviteUser, { requiredRole: EStaffRole.OWNER }),
} satisfies ExportedHandler<Env>;
