/**
 * POST /auth/refresh — rotate refresh token, mint new access token.
 *
 * Design notes:
 *   - `public: true`: refresh is the ONE non-login write endpoint that must
 *     be reachable without an existing access token. By definition, the
 *     caller's access token has expired (or is about to) — the trust anchor
 *     for this request is the `bea_rt` refresh cookie's signature + the
 *     matching KV family record, not the wrapper's `resolveCaller` check.
 *   - Replay-destroys-family: the single most security-sensitive branch of
 *     the auth surface. If the `jti` in the presented refresh JWT does not
 *     match the family's `currentJti`, someone has replayed a stale refresh
 *     token — either an attacker who stole the raw cookie value before we
 *     rotated it, or (rarely) a benign race where two tabs raced a refresh.
 *     Either way, the safe response is to burn the entire family. Yes, this
 *     signs out the legitimate user too when it was a false alarm — that's
 *     the price of not letting an attacker's stolen credential continue to
 *     work. Rotating the individual token isn't enough because attacker and
 *     victim both hold the same pre-rotation JWT, so a JTI-check on one
 *     leaves the other still weaponizable.
 *   - NO_REFRESH vs INVALID_REFRESH: the spec distinguishes "browser sent no
 *     cookie" (401 NO_REFRESH, no clears — nothing to clear) from "browser
 *     sent a cookie we cannot honor" (401 INVALID_REFRESH + clears — the
 *     browser has a bad cookie in its jar, force fresh login). This is a
 *     UX signal for the SPA: NO_REFRESH means "you were never signed in";
 *     INVALID_REFRESH means "your session died, go log in again".
 *   - Clear cookies on EVERY failure branch except NO_REFRESH. If the
 *     browser presented a refresh cookie that we cannot honor (bad
 *     signature, expired, wrong type, missing family, replay, disabled
 *     account), we want the client's next request to NOT retry with the
 *     dead cookie — clearing forces the SPA to reload the login page.
 *   - `deleteAllForEmail` on DISABLED / deleted user: any refresh from a
 *     killed account nukes ALL that account's families. If the account was
 *     just disabled minutes ago, the attacker (or the confused user) with
 *     any of the still-valid refresh JWTs across other devices gets exactly
 *     one refresh attempt to trigger the sweep, and then they're all gone.
 *   - Rate limit at 60/min per IP: legitimate SPAs refresh at most once per
 *     ACCESS_TTL_MS (~1 hour), so 60/min is a comfortable ceiling even
 *     across ~50 concurrent tabs. Attackers running a jti-fuzzing loop hit
 *     the wall in 1 second.
 *   - Concurrent-refresh race (accepted): KV is eventually consistent, so
 *     two tabs racing a refresh for the same family can produce a benign
 *     replay signal — tab A rotates first (jti X → X'), tab B reads AFTER
 *     the propagation and sees currentJti=X', mismatches its still-held
 *     jti=X, and destroys the family. The legitimate user is signed out.
 *     This is the correct behavior for a replay-defense system that cannot
 *     distinguish "legit race" from "attacker with a captured token" — burn
 *     the family and force fresh login. Clients must serialize refresh
 *     requests (share one in-flight refresh promise across tabs / retries);
 *     the admin SPA does this in its Phase 10 interceptor.
 */
import { ACCESS_TTL_MS, EUserStatus, REFRESH_TTL_MS } from '@bee-epic/shared';
import { getClientIp, jsonErr, jsonOk, RateLimiter, withAuthHandler } from '../../utils';
import { REFRESH_COOKIE, clearSessionCookies, readCookie, setSessionCookies } from '../cookies';
import { signJwt } from '../crypto/jwt';
import { generateUrlSafeToken } from '../crypto/tokens';
import { readVerifiedRefreshPayload } from '../readVerifiedRefreshPayload';
import { getUser } from '../repo/userRepo';
import { deleteAllForEmail, deleteFamily, getFamily, rotateFamily } from '../repo/refreshFamilyRepo';

async function handleRefresh(request: Request, env: Env, origin: string | null): Promise<Response> {
	// 1) Distinguish missing-cookie from bad-cookie. The shared helper
	// collapses both into null, so we peek for the raw cookie first.
	const rawCookie = readCookie(request, REFRESH_COOKIE);
	if (!rawCookie) {
		return jsonErr({ code: 'NO_REFRESH' }, origin, env);
	}

	// 2) Verify signature + required claims. Any failure = INVALID_REFRESH
	// and a cookie clear (browser has a bad cookie — force fresh login).
	const payload = await readVerifiedRefreshPayload(request, env);
	if (!payload) {
		const response = jsonErr({ code: 'INVALID_REFRESH' }, origin, env);
		return clearSessionCookies(response, env);
	}

	// After the null-guard above we know sub/fid/jti are all present strings.
	// `payload.fid` is used only for the KV lookup below; once the family is
	// loaded we prefer `family.familyId` as the invariant source so the
	// "we mint the fid we just rotated" property is a local read.
	const email = payload.sub;
	const presentedJti = payload.jti!;

	// 3) Per-IP rate limit — bucket separately from the login limiter so a
	// user cycling refreshes doesn't burn their login budget. `unknown` is
	// the safe fallback for local dev and any request that somehow arrives
	// without a CF header.
	const ip = getClientIp(request);
	if (env.RATE_LIMITER) {
		const limiter = new RateLimiter(env.RATE_LIMITER, { maxRequests: 60, windowSeconds: 60 });
		const result = await limiter.check(`auth:refresh:${ip}`);
		if (!result.allowed) {
			return jsonErr({ code: 'RATE_LIMITED', retryAfter: result.resetTime }, origin, env);
		}
	}

	// 4) Load the family. Missing / expired / corrupt → INVALID_REFRESH +
	// clear cookies (repo already GC'd the record if it was expired).
	const family = await getFamily(env, email, payload.fid!);
	if (!family) {
		const response = jsonErr({ code: 'INVALID_REFRESH' }, origin, env);
		return clearSessionCookies(response, env);
	}
	// From here on `family.familyId` is the source of truth for the fid we
	// operate on — same string as `payload.fid` (verified by the KV lookup)
	// but sourced from the record we just loaded rather than the presented
	// JWT, so subsequent rotate/delete/mint calls read a proven invariant.
	const familyId = family.familyId;

	// 5) Replay detection — see module header. jti mismatch is the loudest
	// possible signal we have that a refresh JWT has been leaked; the only
	// correct response is to burn the family.
	if (presentedJti !== family.currentJti) {
		await deleteFamily(env, email, familyId).catch((err) => console.warn('refresh: family delete failed', err));
		const response = jsonErr({ code: 'REUSED_REFRESH' }, origin, env);
		return clearSessionCookies(response, env);
	}

	// 6) Fetch the user + status check. If the account has been disabled or
	// deleted since login, no fresh access token — and we nuke every family
	// for the account so any concurrent sessions (browser tabs, other
	// devices) also lose their refresh capability on their next attempt.
	const user = await getUser(env, email);
	if (!user || user.status === EUserStatus.DISABLED) {
		await deleteAllForEmail(env, email).catch((err) => console.warn('refresh: deleteAllForEmail failed', err));
		const response = jsonErr({ code: 'ACCOUNT_DISABLED' }, origin, env);
		return clearSessionCookies(response, env);
	}

	// 7) Rotate. `rotateFamily` preserves `expiresAt` — only login extends
	// the 30-day window. A null return is a rare race (family expired
	// between the get and rotate) — treat as INVALID_REFRESH.
	const newJti = generateUrlSafeToken(16);
	const rotated = await rotateFamily(env, email, familyId, newJti, Date.now());
	if (!rotated) {
		const response = jsonErr({ code: 'INVALID_REFRESH' }, origin, env);
		return clearSessionCookies(response, env);
	}

	// 8) Sign fresh access + refresh tokens. Access carries the CURRENT
	// role (so a mid-session role change propagates on the next refresh);
	// refresh carries the new jti so the next refresh will match.
	const accessToken = await signJwt(
		{ sub: user.email, type: 'access', role: user.role },
		env.JWT_SIGNING_SECRET,
		Math.floor(ACCESS_TTL_MS / 1000),
	);
	const refreshToken = await signJwt(
		{ sub: user.email, type: 'refresh', fid: familyId, jti: newJti },
		env.JWT_SIGNING_SECRET,
		Math.floor(REFRESH_TTL_MS / 1000),
	);

	// 9) Response + rotated cookies.
	const response = jsonOk({ caller: { email: user.email, role: user.role, displayName: user.displayName } }, origin, env);
	return setSessionCookies(response, { accessToken, refreshToken }, env);
}

export default {
	fetch: withAuthHandler('POST', handleRefresh, { public: true }),
} satisfies ExportedHandler<Env>;
