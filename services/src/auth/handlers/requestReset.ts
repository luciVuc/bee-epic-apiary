/**
 * POST /auth/request-reset — always 200 no-enumeration entry point.
 *
 * Design notes:
 *   - `public: true` on withAuthHandler: like login, this is a write endpoint
 *     that must be reachable without a session. Origin + generic write
 *     rate-limit still apply through the wrapper. Two additional
 *     endpoint-specific buckets run inline below (see step 1).
 *   - The always-200 contract is the whole point. Whether the email exists,
 *     whether that user is ACTIVE/INVITED/DISABLED, whether the email is
 *     even syntactically valid — from the outside every non-rate-limited
 *     call returns `200 {ok:true, data:{}}`. Only rate-limit failures
 *     (429) and truly-malformed bodies (400 VALIDATION_FAILED) are visible,
 *     because both are attacker-controlled and cannot be used to enumerate
 *     account state.
 *   - Rate-limit ordering: per-IP bucket (20/hr) runs FIRST, BEFORE body
 *     parse. That closes the "burn budget with malformed probes" bypass —
 *     an attacker sending garbage bodies to a target IP still pays their
 *     20/hr ceiling. Per-IP-per-email bucket (3/hr) runs AFTER body parse
 *     because it needs the (normalized) email in the key. Either bucket
 *     denying is enough for a 429. Both buckets are skipped when
 *     `env.RATE_LIMITER` is absent (test path).
 *   - Body schema is `z.string().min(1)` — deliberately NOT `z.email()`. A
 *     format-invalid email must NOT be distinguishable from an unknown
 *     email; both fall through to the always-200 empty envelope. Only a
 *     missing-or-empty email field returns 400, and that's a
 *     structural-body problem, not an enumeration signal.
 *   - Email send failure is caught and swallowed (logged only). A reset
 *     record that lands in KV but fails to email is recoverable — the user
 *     can request another reset. Bubbling the error would surface as a 500
 *     and leak the fact that a reset was actually created (i.e. that the
 *     email exists), defeating the no-enumeration contract.
 *   - `invalidateForEmail` runs before `createReset` so any previously-issued
 *     reset for this email becomes dead the instant a fresh one is minted.
 *     Each request produces exactly one live token per email.
 */
import { z } from 'zod';
import { EUserStatus, RESET_TTL_MS, type IPasswordReset } from '@bee-epic/shared';
import { getClientIp, jsonErr, jsonOk, RateLimiter, withAuthHandler } from '../../utils';
import { generateUrlSafeToken } from '../crypto/tokens';
import { sendReset } from '../emails/sendReset';
import { createReset, invalidateForEmail } from '../repo/resetRepo';
import { getUser } from '../repo/userRepo';

const RequestResetBodySchema = z.object({
	email: z
		.string()
		.min(1)
		.transform((s) => s.toLowerCase().trim()),
});

/** Buckets: per-IP 20/hr, per-(IP,email) 3/hr. Both windows are 3600s. */
const PER_IP_MAX = 20;
const PER_IP_EMAIL_MAX = 3;
const WINDOW_SECONDS = 60 * 60;

async function handleRequestReset(request: Request, env: Env, origin: string | null): Promise<Response> {
	// Resolve the caller IP once — used by BOTH rate-limit buckets. This is
	// intentionally the raw IP for the bucket key (not the /24-truncated
	// version stored on session records); ratelimit keys aren't persisted
	// records subject to data-minimization and finer granularity throttles
	// individual abusers rather than whole /24 blocks.
	const ip = getClientIp(request);

	// 1a) Per-IP rate limit — runs BEFORE body parse so an attacker cannot
	// burn ratelimit-budget with malformed bodies. See module header.
	if (env.RATE_LIMITER) {
		const limiter = new RateLimiter(env.RATE_LIMITER, {
			maxRequests: PER_IP_MAX,
			windowSeconds: WINDOW_SECONDS,
		});
		const result = await limiter.check(`auth:request-reset:${ip}`);
		if (!result.allowed) {
			return jsonErr({ code: 'RATE_LIMITED', retryAfter: result.resetTime }, origin, env);
		}
	}

	// 1b) Body parse. Only after the per-IP bucket has been debited.
	let raw: unknown;
	try {
		raw = await request.json();
	} catch {
		return jsonErr({ code: 'VALIDATION_FAILED', fields: { body: 'Invalid JSON' } }, origin, env);
	}
	const parsed = RequestResetBodySchema.safeParse(raw);
	if (!parsed.success) {
		const flat = parsed.error.flatten().fieldErrors as Record<string, string[] | undefined>;
		const fields: Record<string, string> = {};
		for (const [k, v] of Object.entries(flat)) {
			if (v && v.length > 0) fields[k] = v[0];
		}
		return jsonErr({ code: 'VALIDATION_FAILED', fields }, origin, env);
	}
	const { email } = parsed.data;

	// 1c) Per-(IP,email) rate limit — runs AFTER body parse because it
	// needs the normalized email in the key.
	if (env.RATE_LIMITER) {
		const limiter = new RateLimiter(env.RATE_LIMITER, {
			maxRequests: PER_IP_EMAIL_MAX,
			windowSeconds: WINDOW_SECONDS,
		});
		const result = await limiter.check(`auth:request-reset:${ip}:${email}`);
		if (!result.allowed) {
			return jsonErr({ code: 'RATE_LIMITED', retryAfter: result.resetTime }, origin, env);
		}
	}

	// 2) Look up the user. Missing, INVITED, or DISABLED users all short-
	// circuit to the same always-200 empty envelope — no KV writes, no
	// email. This is where the no-enumeration contract is enforced.
	//
	// KV-throw hardening: wrapped in try/catch so a transient KV blow-up
	// degrades to the SAME always-200 empty envelope as "no user". Bubbling
	// the error would surface as a 500 — a distinguishable response an
	// attacker could use to enumerate accounts by comparing 500 rates across
	// probes. Silent-200 preserves the no-enumeration contract.
	let user: Awaited<ReturnType<typeof getUser>>;
	try {
		user = await getUser(env, email);
	} catch (err) {
		console.warn('[requestReset] getUser threw', err);
		return jsonOk({}, origin, env);
	}
	if (!user || user.status !== EUserStatus.ACTIVE) {
		return jsonOk({}, origin, env);
	}

	// 3) Invalidate any prior resets for this email so a fresh request
	// always leaves exactly one live token in KV. Runs BEFORE createReset
	// so a rapid-fire retry pattern converges to a single valid record.
	await invalidateForEmail(env, email);

	// 4) Mint the fresh reset record.
	const token = generateUrlSafeToken(32);
	const now = Date.now();
	const reset: IPasswordReset = {
		schemaVersion: 1,
		token,
		email,
		createdAt: now,
		expiresAt: now + RESET_TTL_MS,
	};
	await createReset(env, reset);

	// 5) Send the reset email. Wrapped in try/catch — a failure here does
	// NOT change the response. Reset record stays in KV so a re-attempt
	// (via a fresh request-reset call, once the user's per-(ip,email)
	// budget replenishes, OR a retry on the email queue) can still land
	// the message. See module header for why we must swallow.
	try {
		await sendReset(env, reset);
	} catch (err) {
		console.error('[requestReset] sendReset failed', err);
	}

	// 6) Always-200 empty envelope.
	return jsonOk({}, origin, env);
}

export default {
	fetch: withAuthHandler('POST', handleRequestReset, { public: true }),
} satisfies ExportedHandler<Env>;
