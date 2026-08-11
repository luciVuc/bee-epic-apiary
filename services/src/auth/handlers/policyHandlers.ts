/**
 * GET|PUT /settings/auth-policy — password-policy read/write.
 *
 * Two handlers share this file because they slot onto the SAME router path
 * (`/settings/auth-policy`) and each one covers a single HTTP method. Router
 * (Task 8.8) imports both named exports and dispatches by verb.
 *
 * Design notes:
 *   - GET is AUTHENTICATED (not public). The policy record reveals security
 *     posture — is breach-corpus checking on? what's the min length? — which
 *     we don't want visible to unauthenticated callers. Any staff role
 *     (VENDOR through OWNER) can read it because the admin UI uses it to
 *     render live password-strength hints on invite-accept / change-password
 *     forms, and VENDORs need those hints too when they land on the "set
 *     your password" screen.
 *   - Why `requiredRole: VENDOR` (the lowest rank) on GET rather than leaving
 *     `requiredRole` unset? `withAuthHandler` only fires the "caller must
 *     exist" check when `requiredRole` is set OR the method is a mutation.
 *     GET isn't a mutation, so without `requiredRole` an anonymous caller
 *     would get 200 — not what we want. Setting the lowest rank forces the
 *     wrapper to resolve a caller AND check role, but the role check is a
 *     no-op (every role satisfies VENDOR).
 *   - PUT is OWNER-only via `requiredRole: EStaffRole.OWNER`. The write-
 *     method floor (EMPLOYEE) is redundant here — OWNER already exceeds it —
 *     but the wrapper enforces `max(requiredRole, floor)` so the effective
 *     minimum is OWNER, which is what we want.
 *   - Server-stamped fields on PUT (`schemaVersion`, `updatedAt`,
 *     `updatedBy`): the client cannot forge these. The handler builds
 *     `toPersist` from ONLY the three whitelisted fields in
 *     `PolicyInputSchema` plus caller.email as `updatedBy` and `Date.now()`
 *     as `updatedAt`. `policyRepo.putPolicy` re-stamps `updatedAt` a second
 *     time (defence-in-depth) and re-clamps `minLength` to the shared floor.
 *   - Error mapping: 400 INVALID_POLICY covers three cases — (1) body isn't
 *     JSON, (2) body fails PolicyInputSchema, (3) putPolicy throws (which
 *     currently only happens on downstream KV failure or the repo's own
 *     `AuthPolicySchema.parse` throwing — the latter shouldn't fire since
 *     PolicyInputSchema already enforces the same constraints). Case (3)
 *     as INVALID_POLICY is a mild lie about the root cause of a KV outage,
 *     but the alternative (500 INTERNAL) would leak infrastructure signal
 *     and the endpoint has no other 5xx path, so we keep the taxonomy
 *     small.
 */
import { AuthPolicySchema, EStaffRole, type IAuthPolicy } from '@bee-epic/shared';
import { jsonErr, jsonOk, withAuthHandler } from '../../utils';
import type { ICaller } from '../../utils/resolveCaller';
import { getPolicy, putPolicy } from '../repo/policyRepo';

/**
 * Client-facing input for PUT: schemaVersion / updatedAt / updatedBy are
 * server-stamped, so we omit them from what the client is allowed to send.
 * Derived from AuthPolicySchema so a future field addition can't drift.
 */
const PolicyInputSchema = AuthPolicySchema.omit({
	schemaVersion: true,
	updatedAt: true,
	updatedBy: true,
});

async function handleGetPolicy(_request: Request, env: Env, origin: string | null): Promise<Response> {
	// policyRepo.getPolicy returns DEFAULT_AUTH_POLICY when nothing is
	// persisted — no handler-side fallback needed.
	const policy = await getPolicy(env);
	return jsonOk(policy, origin, env);
}

async function handlePutPolicy(request: Request, env: Env, origin: string | null, caller?: ICaller): Promise<Response> {
	// The wrapper's `requiredRole: OWNER` check has already rejected anon +
	// non-OWNER callers, so `caller` is always defined here in practice. The
	// guard is belt-and-braces for the type system + future refactors.
	if (!caller) {
		return jsonErr({ code: 'UNAUTHORIZED' }, origin, env);
	}

	let raw: unknown;
	try {
		raw = await request.json();
	} catch {
		return jsonErr({ code: 'INVALID_POLICY' }, origin, env);
	}
	const parsed = PolicyInputSchema.safeParse(raw);
	if (!parsed.success) {
		return jsonErr({ code: 'INVALID_POLICY' }, origin, env);
	}

	const toPersist: IAuthPolicy = {
		schemaVersion: 1,
		minLength: parsed.data.minLength,
		checkBreachCorpus: parsed.data.checkBreachCorpus,
		notifyOnPasswordChange: parsed.data.notifyOnPasswordChange,
		updatedAt: Date.now(),
		updatedBy: caller.email.toLowerCase(),
	};

	try {
		const persisted = await putPolicy(env, toPersist);
		return jsonOk(persisted, origin, env);
	} catch (err) {
		console.error('[policyHandlers] putPolicy failed', err);
		return jsonErr({ code: 'INVALID_POLICY' }, origin, env);
	}
}

export const getPolicyHandler = {
	fetch: withAuthHandler('GET', handleGetPolicy, { requiredRole: EStaffRole.VENDOR }),
} satisfies ExportedHandler<Env>;

export const putPolicyHandler = {
	fetch: withAuthHandler('PUT', handlePutPolicy, { requiredRole: EStaffRole.OWNER }),
} satisfies ExportedHandler<Env>;
