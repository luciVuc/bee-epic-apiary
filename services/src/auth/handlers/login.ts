/**
 * POST /auth/login — email + password → session cookies.
 *
 * Design notes:
 *   - `public: true` on withAuthHandler: login is the ONE write endpoint that
 *     must be reachable without an existing session. Origin + rate-limit still
 *     apply through the wrapper's public rate-limit path (we ALSO run a
 *     per-(ip,email) limiter below with a stricter budget than the generic
 *     write-rate-limit — five attempts / 15 min throttles credential-stuffing
 *     while leaving typo-fingering room for legitimate users).
 *   - Dummy-hash timing defense: when the user is missing OR has no password
 *     hash yet (INVITED), we still `await verifyPassword(...)` against a
 *     constant dummy hash so the response latency does not leak the account's
 *     existence / status. Without this, an attacker can enumerate valid emails
 *     by measuring the difference between "no-hash short-circuit" (fast) and
 *     "real verify" (~50-100ms of PBKDF2). The dummy hash is lazily computed
 *     ONCE per worker instance and cached; the first login pays the cost, all
 *     subsequent enumerations verify against the cached value.
 *   - Fire-and-forget `lastLogin` update: the KV write to record
 *     `lastLoginAt` / `lastLoginIp` must NOT block the login response. KV is
 *     eventually-consistent (100-300ms worst case in the same region, seconds
 *     across regions) and blocking on it would slow every login and hand a
 *     new failure mode to the critical path. The write is best-effort — a
 *     transient failure logs and moves on, and the next successful login
 *     overwrites the stale timestamp.
 *   - IP truncation: we store /24 for IPv4 and /64 for IPv6, never the full
 *     address. This is the minimum-retention posture required by GDPR Art. 5
 *     (data minimisation) — we only need "which network" for
 *     abuse-investigation, not "which subscriber". A /24 preserves ISP-level
 *     attribution; a /64 preserves single-user attribution on typical
 *     residential IPv6 assignments. Anything narrower is
 *     personally-identifiable and requires stronger justification / retention
 *     controls we haven't put in place for this codebase.
 */
import { z } from 'zod';
import { ACCESS_TTL_MS, EUserStatus, REFRESH_TTL_MS, type IRefreshFamily } from '@bee-epic/shared';
import { getClientIp, jsonErr, jsonOk, RateLimiter, withAuthHandler } from '../../utils';
import { setSessionCookies } from '../cookies';
import { hashPassword, verifyPassword } from '../crypto/passwordHash';
import { signJwt } from '../crypto/jwt';
import { generateUrlSafeToken } from '../crypto/tokens';
import { truncateIp } from '../policy/truncateIp';
import { getUser, updateUser } from '../repo/userRepo';
import { createFamily } from '../repo/refreshFamilyRepo';

const LoginBodySchema = z.object({
	email: z.email().transform((s) => s.toLowerCase()),
	password: z.string().min(1),
});

/**
 * Lazy dummy hash used to burn constant-time PBKDF2 for unknown/INVITED users.
 * Module-scoped so it's computed at most once per worker instance — first
 * login pays ~50-100ms, subsequent enumerations resolve instantly.
 */
let dummyHashPromise: Promise<string> | null = null;
function getDummyHash(): Promise<string> {
	if (!dummyHashPromise) dummyHashPromise = hashPassword('timing-attack-defense-value');
	return dummyHashPromise;
}

async function handleLogin(request: Request, env: Env, origin: string | null): Promise<Response> {
	// 1) Body validation
	let raw: unknown;
	try {
		raw = await request.json();
	} catch {
		return jsonErr({ code: 'VALIDATION_FAILED', fields: { body: 'Invalid JSON' } }, origin, env);
	}
	const parsed = LoginBodySchema.safeParse(raw);
	if (!parsed.success) {
		const flat = parsed.error.flatten().fieldErrors as Record<string, string[] | undefined>;
		const fields: Record<string, string> = {};
		for (const [k, v] of Object.entries(flat)) {
			if (v && v.length > 0) fields[k] = v[0];
		}
		return jsonErr({ code: 'VALIDATION_FAILED', fields }, origin, env);
	}
	const { email, password } = parsed.data;

	// Resolve the caller IP once — used by rate-limit key AND family record.
	const ip = getClientIp(request);

	// 2) Per-(ip,email) rate limit — stricter than the generic wrapper limit so
	// credential-stuffing hits the wall before it can iterate the password list.
	if (env.RATE_LIMITER) {
		const limiter = new RateLimiter(env.RATE_LIMITER, { maxRequests: 5, windowSeconds: 900 });
		const result = await limiter.check(`auth:login:${ip}:${email}`);
		if (!result.allowed) {
			return jsonErr({ code: 'RATE_LIMITED', retryAfter: result.resetTime }, origin, env);
		}
	}

	// 3) Fetch user; if absent OR no hash (INVITED), burn constant-time verify
	// against the dummy hash and return INVALID_CREDENTIALS. See module header
	// for the timing-attack rationale.
	const user = await getUser(env, email);
	if (!user || !user.passwordHash) {
		await verifyPassword(password, await getDummyHash());
		return jsonErr({ code: 'INVALID_CREDENTIALS' }, origin, env);
	}

	// 4) Status check. INVITED already handled above (passwordHash === null),
	// so only DISABLED remains as a distinct rejection code. ACTIVE falls
	// through to the password verify.
	if (user.status === EUserStatus.DISABLED) {
		return jsonErr({ code: 'ACCOUNT_DISABLED' }, origin, env);
	}

	// 5) Verify password
	if (!(await verifyPassword(password, user.passwordHash))) {
		return jsonErr({ code: 'INVALID_CREDENTIALS' }, origin, env);
	}

	// 6) Mint refresh family
	const familyId = generateUrlSafeToken(16);
	const jti = generateUrlSafeToken(16);
	const now = Date.now();
	const truncated = truncateIp(ip);
	const family: IRefreshFamily = {
		schemaVersion: 1,
		familyId,
		email: user.email,
		currentJti: jti,
		createdAt: now,
		lastRefreshedAt: now,
		expiresAt: now + REFRESH_TTL_MS,
		userAgent: request.headers.get('User-Agent') ?? null,
		ip: truncated,
	};
	await createFamily(env, family);

	// 7) Sign tokens
	const accessToken = await signJwt(
		{ sub: user.email, type: 'access', role: user.role },
		env.JWT_SIGNING_SECRET,
		Math.floor(ACCESS_TTL_MS / 1000),
	);
	const refreshToken = await signJwt(
		{ sub: user.email, type: 'refresh', fid: familyId, jti },
		env.JWT_SIGNING_SECRET,
		Math.floor(REFRESH_TTL_MS / 1000),
	);

	// 8) Fire-and-forget lastLogin update. Deliberately NOT awaited — see
	// module header for the "must not block response" rationale.
	void updateUser(env, user.email, { lastLoginAt: now, lastLoginIp: truncated, updatedAt: now }).catch((err) =>
		console.warn('login: lastLogin update failed', err),
	);

	// 9) Response + cookies
	const response = jsonOk({ caller: { email: user.email, role: user.role, displayName: user.displayName } }, origin, env);
	return setSessionCookies(response, { accessToken, refreshToken }, env);
}

export default {
	fetch: withAuthHandler('POST', handleLogin, { public: true }),
} satisfies ExportedHandler<Env>;
