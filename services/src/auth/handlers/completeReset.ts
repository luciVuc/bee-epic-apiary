/**
 * POST /auth/complete-reset — consume a password-reset token + set a new
 * password → rotate the credential, kill every prior session, and issue
 * fresh session cookies.
 *
 * Design notes:
 *   - `public: true` on withAuthHandler: like login/acceptInvite, this is a
 *     write endpoint reachable without an existing session. Origin + the
 *     wrapper's generic write rate-limit still apply. No per-token bucket
 *     here — a valid reset token is single-use and unguessable, so the rate
 *     ceiling comes from "the attacker doesn't have the token", not from an
 *     application-level limiter. The paired /auth/request-reset is the enum-
 *     protected gate that governs how tokens get created in the first place.
 *   - Validate-then-consume ordering (mirrors acceptInvite): peek the reset
 *     via `getReset` first, then run policy fetch, password validation, and
 *     password hashing BEFORE `consumeReset` deletes the record. Rationale:
 *     a transient KV blip or WebCrypto failure in policy/validate/hash would
 *     otherwise permanently burn the token and force the user to request a
 *     fresh reset. Moving those steps ahead of consume does NOT introduce
 *     replay-with-different-password risk — an attacker retrying the
 *     endpoint only receives repeated WEAK_PASSWORD echoes, bounded by the
 *     token's TTL, with zero state change. Post-consume writes
 *     (updateUser, deleteAllForEmail, createFamily, signJwt, cookies) are
 *     accepted as best-effort — a KV failure there is rare and requesting
 *     another reset is the acceptable recovery.
 *   - Status collapse: DISABLED and INVITED users both surface as
 *     INVALID_TOKEN, NOT a distinct error code. DISABLED needs an OWNER
 *     re-enable, INVITED must accept-invite first — the reset flow is not
 *     a recovery path for either state and surfacing distinct codes would
 *     leak account state. This matches the /auth/request-reset side of the
 *     pair, which also refuses to mint a token for non-ACTIVE users.
 *   - KV-throw hardening for `getUser`: wrapped in try/catch. If the KV
 *     read throws (transient platform blip), degrade to the same
 *     INVALID_TOKEN branch as "no user found". Bubbling the throw would
 *     surface as a 500 — a distinguishable response — which an attacker
 *     could use to enumerate accounts by comparing 500 rates. Silent-200
 *     is the no-user protocol on the request side; INVALID_TOKEN is the
 *     equivalent on this side (we already have a valid token, so the
 *     "user missing" and "user throw" outcomes must be indistinguishable).
 *   - Kill-all-sessions on password change: `deleteAllForEmail` runs
 *     unconditionally on success. Every existing refresh family for this
 *     email is destroyed. The user MUST log in fresh on every device.
 *     This is the whole point of a reset — a compromised account with an
 *     active session on the attacker's device must be evicted the instant
 *     the legitimate owner rotates their password.
 *   - Notification email is fire-and-forget: gated by
 *     `policy.notifyOnPasswordChange`, wrapped in `.catch` so a mail
 *     failure never rolls back the password change. The password rotation
 *     is the source of truth; the email is a courtesy signal.
 *   - IP truncation matches login.ts — /24 for IPv4, /64 for IPv6.
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
import { sendPasswordChanged } from '../emails/sendPasswordChanged';
import { getPolicy } from '../repo/policyRepo';
import { createFamily, deleteAllForEmail } from '../repo/refreshFamilyRepo';
import { consumeReset, getReset } from '../repo/resetRepo';
import { getUser, updateUser } from '../repo/userRepo';

const CompleteResetBodySchema = z.object({
	token: z.string().min(1),
	password: z.string().min(1),
});

async function handleCompleteReset(request: Request, env: Env, origin: string | null): Promise<Response> {
	// 1) Body validation
	let raw: unknown;
	try {
		raw = await request.json();
	} catch {
		return jsonErr({ code: 'VALIDATION_FAILED', fields: { body: 'Invalid JSON' } }, origin, env);
	}
	const parsed = CompleteResetBodySchema.safeParse(raw);
	if (!parsed.success) {
		const flat = parsed.error.flatten().fieldErrors as Record<string, string[] | undefined>;
		const fields: Record<string, string> = {};
		for (const [k, v] of Object.entries(flat)) {
			if (v && v.length > 0) fields[k] = v[0];
		}
		return jsonErr({ code: 'VALIDATION_FAILED', fields }, origin, env);
	}
	const { token, password } = parsed.data;

	// 2) Peek the reset (read-only). Missing/expired/corrupt collapse to
	// INVALID_TOKEN — the repo already normalizes these. Do NOT consume yet:
	// policy fetch, password validation, and hashing all run first so a
	// transient failure in any of those steps preserves the token for retry.
	const reset = await getReset(env, token);
	if (!reset) {
		return jsonErr({ code: 'INVALID_TOKEN' }, origin, env);
	}

	// 3) Look up the user, with KV-throw hardening. A KV throw here must
	// degrade to the same INVALID_TOKEN branch as "no user", not surface as
	// a distinguishable 500 — see module header.
	let user: IUser | null;
	try {
		user = await getUser(env, reset.email);
	} catch (err) {
		console.warn('[completeReset] getUser threw', err);
		return jsonErr({ code: 'INVALID_TOKEN' }, origin, env);
	}
	if (!user || user.status !== EUserStatus.ACTIVE) {
		// DISABLED/INVITED collapse to INVALID_TOKEN — see module header. Do
		// NOT surface a distinct error; that would leak account state.
		return jsonErr({ code: 'INVALID_TOKEN' }, origin, env);
	}

	// 4) Validate the password against the current policy. Runs BEFORE
	// consume so a WEAK_PASSWORD response preserves the reset for retry.
	const policy = await getPolicy(env);
	const result = await validatePassword(password, policy);
	if (!result.ok) {
		return jsonErr({ code: 'WEAK_PASSWORD', reasons: result.reasons }, origin, env);
	}

	// 5) Hash the password BEFORE consume. Hashing is the most CPU-heavy
	// step and can (rarely) throw from WebCrypto; keeping it ahead of the
	// consume means a hashing failure preserves the token for retry.
	const passwordHash = await hashPassword(password);

	// 6) Consume the reset. From this point on the token is gone, and any
	// downstream failure (updateUser, deleteAllForEmail, createFamily,
	// signJwt, setSessionCookies) is not compensated — those are rare
	// KV/write failures and requesting another reset is the accepted
	// recovery. We ignore consumeReset's return value because we already
	// saw the reset via getReset above; a concurrent racer that deleted the
	// row first is fine — the update below is idempotent.
	await consumeReset(env, token);

	// Resolve IP once — used by the family record AND the inlined lastLogin
	// fields on the user write.
	const ip = getClientIp(request);
	const truncated = truncateIp(ip);
	const now = Date.now();

	// 7) Rotate the credential. lastLoginAt / lastLoginIp are inlined into
	// this write — successful reset counts as a fresh session grant, same as
	// login/acceptInvite.
	await updateUser(env, reset.email, {
		passwordHash,
		updatedAt: now,
		lastLoginAt: now,
		lastLoginIp: truncated,
	});
	const rotatedUser: IUser = {
		...user,
		passwordHash,
		updatedAt: now,
		lastLoginAt: now,
		lastLoginIp: truncated,
	};

	// 8) Kill every prior refresh family for this email. The user must log
	// in fresh on every OTHER device; this handler's response provides the
	// new session for THIS device.
	await deleteAllForEmail(env, reset.email);

	// 9) Mint the new refresh family — identical shape to login/acceptInvite.
	const familyId = generateUrlSafeToken(16);
	const jti = generateUrlSafeToken(16);
	const family: IRefreshFamily = {
		schemaVersion: 1,
		familyId,
		email: rotatedUser.email,
		currentJti: jti,
		createdAt: now,
		lastRefreshedAt: now,
		expiresAt: now + REFRESH_TTL_MS,
		userAgent: request.headers.get('User-Agent') ?? null,
		ip: truncated,
	};
	await createFamily(env, family);

	// 10) Sign access + refresh tokens.
	const accessToken = await signJwt(
		{ sub: rotatedUser.email, type: 'access', role: rotatedUser.role },
		env.JWT_SIGNING_SECRET,
		Math.floor(ACCESS_TTL_MS / 1000),
	);
	const refreshToken = await signJwt(
		{ sub: rotatedUser.email, type: 'refresh', fid: familyId, jti },
		env.JWT_SIGNING_SECRET,
		Math.floor(REFRESH_TTL_MS / 1000),
	);

	// 11) Fire-and-forget the notification email. Gated by policy. Errors
	// are logged but never bubble — the password rotation has already
	// committed and the mail is a courtesy signal.
	if (policy.notifyOnPasswordChange) {
		void sendPasswordChanged(env, rotatedUser).catch((err) => {
			console.warn('[completeReset] notification failed', err);
		});
	}

	// 12) Response + cookies.
	const response = jsonOk(
		{
			caller: {
				email: rotatedUser.email,
				role: rotatedUser.role,
				displayName: rotatedUser.displayName,
			},
		},
		origin,
		env,
	);
	return setSessionCookies(response, { accessToken, refreshToken }, env);
}

export default {
	fetch: withAuthHandler('POST', handleCompleteReset, { public: true }),
} satisfies ExportedHandler<Env>;
