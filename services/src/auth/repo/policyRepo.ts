import { AUTH_POLICY_MIN_LENGTH_FLOOR, AuthPolicySchema, DEFAULT_AUTH_POLICY, type IAuthPolicy } from '@bee-epic/shared';

/**
 * Repository for the singleton `IAuthPolicy` record. Only this module is
 * allowed to read/write `env.CONTENT_KV` for the auth policy, so the storage
 * layout can be swapped without rippling through handlers.
 *
 * KV key convention:
 *   - `auth-policy` → JSON IAuthPolicy (singleton — no ID suffix)
 *
 * Hot-path caching: `validatePassword` calls `getPolicy` on every login and
 * every password change. To avoid a KV read per request, results are memoized
 * for `CACHE_TTL_MS` (30s) in an isolate-scoped module variable. The cache
 * also stores fail-open defaults so a corrupt or missing record does not
 * cause a KV lookup on every request.
 *
 * Because the cache is a module-scoped `let`, tests MUST reset it between
 * cases via `_clearCacheForTests`.
 */

const POLICY_KEY = 'auth-policy';
const CACHE_TTL_MS = 30_000;

let cache: { value: IAuthPolicy; fetchedAt: number } | null = null;

/**
 * Cached read of the auth policy. Returns the cached value if it was fetched
 * within `CACHE_TTL_MS`. On cache miss or expiry, reads KV; if the record is
 * missing, has corrupt JSON, or fails schema validation, returns
 * `DEFAULT_AUTH_POLICY` (fail-open) and caches that default so the hot path
 * does not hammer KV.
 */
export async function getPolicy(env: Env): Promise<IAuthPolicy> {
	const now = Date.now();
	if (cache && now - cache.fetchedAt < CACHE_TTL_MS) {
		return cache.value;
	}
	const raw = await env.CONTENT_KV.get(POLICY_KEY);
	if (!raw) {
		cache = { value: DEFAULT_AUTH_POLICY, fetchedAt: now };
		return DEFAULT_AUTH_POLICY;
	}
	try {
		const parsed = AuthPolicySchema.safeParse(JSON.parse(raw));
		if (!parsed.success) {
			console.warn(`[policyRepo] schema-invalid record at ${POLICY_KEY} — using default`);
			cache = { value: DEFAULT_AUTH_POLICY, fetchedAt: now };
			return DEFAULT_AUTH_POLICY;
		}
		cache = { value: parsed.data, fetchedAt: now };
		return parsed.data;
	} catch {
		console.warn(`[policyRepo] failed to JSON.parse ${POLICY_KEY} — using default`);
		cache = { value: DEFAULT_AUTH_POLICY, fetchedAt: now };
		return DEFAULT_AUTH_POLICY;
	}
}

/**
 * Persist the auth policy. Clamps `minLength` up to
 * `AUTH_POLICY_MIN_LENGTH_FLOOR` if the caller provided a lower value
 * (defense-in-depth — the schema also enforces the floor, but the repo
 * re-applies it so we never persist a weaker policy even if the schema
 * changes). Stamps `updatedAt = Date.now()`, discarding any caller-supplied
 * value. Validates with `AuthPolicySchema.parse()` — throws on bad shape.
 * Populates the module cache with the freshly-written value so subsequent
 * `getPolicy` calls see it immediately.
 */
export async function putPolicy(env: Env, policy: IAuthPolicy): Promise<IAuthPolicy> {
	// Guard against non-object inputs so the spread below cannot explode; the
	// subsequent schema parse gives the caller a clean validation error.
	if (policy === null || typeof policy !== 'object') {
		return AuthPolicySchema.parse(policy);
	}
	const rawMin = (policy as IAuthPolicy).minLength;
	const clampedMin = typeof rawMin === 'number' && rawMin < AUTH_POLICY_MIN_LENGTH_FLOOR ? AUTH_POLICY_MIN_LENGTH_FLOOR : rawMin;
	const stamped: IAuthPolicy = {
		...(policy as IAuthPolicy),
		minLength: clampedMin,
		updatedAt: Date.now(),
	};
	const parsed = AuthPolicySchema.parse(stamped);
	await env.CONTENT_KV.put(POLICY_KEY, JSON.stringify(parsed));
	cache = { value: parsed, fetchedAt: Date.now() };
	return parsed;
}

/**
 * @internal Test-only helper. Resets the module-scoped cache so specs run in
 * isolation. Do not call from production code.
 */
export function _clearCacheForTests(): void {
	cache = null;
}
