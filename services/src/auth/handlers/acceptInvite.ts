/**
 * POST /auth/accept-invite — consume an invite token + set password →
 * activate the user and issue session cookies.
 *
 * Design notes:
 *   - `public: true` on withAuthHandler: like login, this write endpoint has
 *     to be reachable without an existing session. Origin + generic write
 *     rate-limit still apply through the wrapper. There is no per-token
 *     bucket here — a valid invite token is single-use and unguessable, so
 *     the rate ceiling comes from "the attacker doesn't have the token", not
 *     from an application-level limiter.
 *   - Validate-then-consume ordering: the handler `getInvite` (read-only peek)
 *     BEFORE it runs policy fetch, password validation, and password hashing;
 *     `consumeInvite` (the delete) only runs AFTER those local/pure checks
 *     succeed. Rationale: a transient KV blip or WebCrypto failure in
 *     policy-fetch/validate/hash would otherwise permanently burn the invite
 *     and force the OWNER to re-invite. Moving those steps ahead of consume
 *     does NOT introduce replay-with-different-password risk — an attacker
 *     retrying the endpoint only receives repeated WEAK_PASSWORD echoes,
 *     bounded by the invite's TTL, with zero state change. Post-consume
 *     writes (updateUser/createUser, createFamily, signJwt, cookies) are
 *     accepted as best-effort — a KV failure there is rare and re-inviting
 *     is the acceptable recovery; we log but do not try to restore the
 *     invite.
 *   - Invite role always wins (drift resolution on the update path): when
 *     an existing INVITED user record is present, the invite's `role` is
 *     copied onto the activated user record even if it differs from the
 *     existing row. A re-invite with a changed role is almost always the
 *     OWNER's explicit intent (e.g. "invited them as EMPLOYEE, expired,
 *     now invite as MANAGER"); silently dropping the fresh role would
 *     hide that intent. Rejecting drift with a distinct error would force
 *     the OWNER to `deleteUser` first, which is friction for the common
 *     case. Invite is the source of truth.
 *   - Expired-vs-missing collapse: `inviteRepo.getInvite` returns null for
 *     both "token unknown" and "token existed but expiresAt <= now" — it
 *     does not distinguish. We surface both as INVALID_TOKEN rather than
 *     fabricating an EXPIRED_TOKEN distinction the repo cannot support.
 *     `consumeInvite`, when reached, is expected to return the same invite
 *     `getInvite` already produced; we ignore its return value because we
 *     have already validated the invite via the peek. If the concurrent
 *     racer beat us to the delete, our follow-up user write is idempotent
 *     against the status check.
 *   - Idempotency edge (`consumeInvite` has no CAS): two concurrent callers
 *     can both see the same invite before either deletes it. That is why
 *     the follow-up user write path handles both `existing` and `!existing`
 *     — a duplicate `createUser` for the same email is intercepted at the
 *     status check and returns USER_ALREADY_ACTIVE on the loser of the race.
 *   - Inlined lastLoginAt: unlike login.ts (which fires-and-forgets a second
 *     KV write to record lastLogin), acceptInvite folds `lastLoginAt` /
 *     `lastLoginIp` directly into the single ACTIVE-flip write. There is no
 *     race to avoid and no second round-trip to save on — we already own
 *     the user record write in this handler.
 *   - IP truncation identical to login.ts — /24 for IPv4, /64 for IPv6.
 *     See login.ts module header for the GDPR / data-minimisation rationale.
 */
import { z } from 'zod';
import { ACCESS_TTL_MS, EUserStatus, REFRESH_TTL_MS, type IRefreshFamily, type IUser } from '@bee-epic/shared';
import { getClientIp, jsonErr, jsonOk, withAuthHandler } from '../../utils';
import { setSessionCookies } from '../cookies';
import { hashPassword } from '../crypto/passwordHash';
import { signJwt } from '../crypto/jwt';
import { generateUrlSafeToken } from '../crypto/tokens';
import { truncateIp } from '../policy/truncateIp';
import { validatePassword } from '../policy/validatePassword';
import { consumeInvite, getInvite } from '../repo/inviteRepo';
import { getPolicy } from '../repo/policyRepo';
import { createFamily } from '../repo/refreshFamilyRepo';
import { createUser, getUser, updateUser } from '../repo/userRepo';

const AcceptInviteBodySchema = z.object({
	token: z.string().min(1),
	password: z.string().min(1),
	displayName: z.string().min(1).max(200).optional(),
});

async function handleAcceptInvite(request: Request, env: Env, origin: string | null): Promise<Response> {
	// 1) Body validation
	let raw: unknown;
	try {
		raw = await request.json();
	} catch {
		return jsonErr({ code: 'VALIDATION_FAILED', fields: { body: 'Invalid JSON' } }, origin, env);
	}
	const parsed = AcceptInviteBodySchema.safeParse(raw);
	if (!parsed.success) {
		const flat = parsed.error.flatten().fieldErrors as Record<string, string[] | undefined>;
		const fields: Record<string, string> = {};
		for (const [k, v] of Object.entries(flat)) {
			if (v && v.length > 0) fields[k] = v[0];
		}
		return jsonErr({ code: 'VALIDATION_FAILED', fields }, origin, env);
	}
	const { token, password, displayName: bodyDisplayName } = parsed.data;

	// 2) Peek the invite (read-only). Missing/expired collapse to
	// INVALID_TOKEN — see module header for the design tradeoff. We do NOT
	// consume yet: policy fetch, password validation, and hashing all run
	// first so a transient failure in any of those steps preserves the
	// invite for retry.
	const invite = await getInvite(env, token);
	if (!invite) {
		return jsonErr({ code: 'INVALID_TOKEN' }, origin, env);
	}

	// 3) Look up any existing user record for the invite email.
	const existing = await getUser(env, invite.email);
	if (existing && existing.status === EUserStatus.ACTIVE) {
		return jsonErr({ code: 'USER_ALREADY_ACTIVE' }, origin, env);
	}
	if (existing && existing.status === EUserStatus.DISABLED) {
		// Invite belongs to a disabled account — refuse to activate. Invite
		// has not been consumed yet; leaving it in place is harmless because
		// the DISABLED status check is deterministic — the invite will
		// eventually expire via KV TTL. An OWNER re-enabling the account
		// followed by a fresh invite is the intended recovery path.
		return jsonErr({ code: 'INVALID_TOKEN' }, origin, env);
	}

	// 4) Validate the password against the current policy. Runs BEFORE
	// consume so a WEAK_PASSWORD response preserves the invite and allows
	// the user to retry with a stronger password (see module header).
	const policy = await getPolicy(env);
	const result = await validatePassword(password, policy);
	if (!result.ok) {
		return jsonErr({ code: 'WEAK_PASSWORD', reasons: result.reasons }, origin, env);
	}

	// 5) Hash the password BEFORE consume. Hashing is the most CPU-heavy
	// step and can (rarely) throw from WebCrypto; keeping it ahead of the
	// consume means a hashing failure preserves the invite for retry.
	const passwordHash = await hashPassword(password);

	// 6) Consume the invite. From this point on the invite is gone, and
	// any downstream failure (updateUser/createUser, createFamily,
	// signJwt, setSessionCookies) is not compensated — those are rare
	// KV/write failures and re-inviting is the accepted recovery. We
	// ignore consumeInvite's return value because we already saw the
	// invite via getInvite above; a concurrent racer that deleted the
	// row first is handled downstream by the idempotent user write path.
	await consumeInvite(env, token);

	// Resolve IP once — used by the family record AND the inlined lastLogin
	// fields on the user write.
	const ip = getClientIp(request);
	const truncated = truncateIp(ip);
	const now = Date.now();

	// 7) Flip the user to ACTIVE (or create the record fresh if the invite
	// wasn't paired with an INVITED user row — rare but plausible). The
	// displayName precedence is body > invite > existing > 'User'. Role is
	// always sourced from the invite on the update path — see the
	// "invite role always wins" note in the module header. lastLoginAt
	// and lastLoginIp are inlined into this write — no second KV round-trip.
	let activeUser: IUser;
	if (existing) {
		const resolvedDisplayName = bodyDisplayName ?? invite.displayName ?? existing.displayName;
		activeUser = {
			...existing,
			role: invite.role,
			status: EUserStatus.ACTIVE,
			passwordHash,
			displayName: resolvedDisplayName,
			updatedAt: now,
			lastLoginAt: now,
			lastLoginIp: truncated,
		};
		await updateUser(env, invite.email, {
			role: invite.role,
			status: EUserStatus.ACTIVE,
			passwordHash,
			displayName: resolvedDisplayName,
			updatedAt: now,
			lastLoginAt: now,
			lastLoginIp: truncated,
		});
	} else {
		const resolvedDisplayName = bodyDisplayName ?? invite.displayName ?? 'User';
		activeUser = {
			schemaVersion: 1,
			email: invite.email,
			displayName: resolvedDisplayName,
			role: invite.role,
			status: EUserStatus.ACTIVE,
			passwordHash,
			createdAt: now,
			updatedAt: now,
			lastLoginAt: now,
			lastLoginIp: truncated,
		};
		await createUser(env, activeUser);
	}

	// 8) Mint refresh family — identical to login.ts.
	const familyId = generateUrlSafeToken(16);
	const jti = generateUrlSafeToken(16);
	const family: IRefreshFamily = {
		schemaVersion: 1,
		familyId,
		email: activeUser.email,
		currentJti: jti,
		createdAt: now,
		lastRefreshedAt: now,
		expiresAt: now + REFRESH_TTL_MS,
		userAgent: request.headers.get('User-Agent') ?? null,
		ip: truncated,
	};
	await createFamily(env, family);

	// 9) Sign access + refresh tokens.
	const accessToken = await signJwt(
		{ sub: activeUser.email, type: 'access', role: activeUser.role },
		env.JWT_SIGNING_SECRET,
		Math.floor(ACCESS_TTL_MS / 1000),
	);
	const refreshToken = await signJwt(
		{ sub: activeUser.email, type: 'refresh', fid: familyId, jti },
		env.JWT_SIGNING_SECRET,
		Math.floor(REFRESH_TTL_MS / 1000),
	);

	// 10) Response + cookies.
	const response = jsonOk(
		{
			caller: {
				email: activeUser.email,
				role: activeUser.role,
				displayName: activeUser.displayName,
			},
		},
		origin,
		env,
	);
	return setSessionCookies(response, { accessToken, refreshToken }, env);
}

export default {
	fetch: withAuthHandler('POST', handleAcceptInvite, { public: true }),
} satisfies ExportedHandler<Env>;
