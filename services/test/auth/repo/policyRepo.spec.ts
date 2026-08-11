import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { _clearCacheForTests, getPolicy, putPolicy } from '../../../src/auth/repo/policyRepo';
import { AUTH_POLICY_MIN_LENGTH_FLOOR, DEFAULT_AUTH_POLICY, type IAuthPolicy } from '@bee-epic/shared';

/**
 * Minimal KV mock — policy repo only needs get/put (singleton record, no list).
 */
function makeKv() {
	const store = new Map<string, string>();
	return {
		store,
		kv: {
			get: vi.fn(async (key: string) => store.get(key) ?? null),
			put: vi.fn(async (key: string, value: string) => {
				store.set(key, value);
			}),
		} as unknown as KVNamespace,
	};
}

type TestEnv = { CONTENT_KV: KVNamespace };

function makeEnv() {
	const { kv, store } = makeKv();
	const env: TestEnv = { CONTENT_KV: kv };
	return { env: env as unknown as Env, kv, store };
}

function buildPolicy(overrides: Partial<IAuthPolicy> = {}): IAuthPolicy {
	return {
		schemaVersion: 1,
		minLength: 12,
		checkBreachCorpus: true,
		notifyOnPasswordChange: true,
		updatedAt: 1_700_000_000_000,
		updatedBy: 'owner@example.com',
		...overrides,
	};
}

describe('policyRepo', () => {
	let warnSpy: ReturnType<typeof vi.spyOn>;

	beforeEach(() => {
		_clearCacheForTests();
		warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
	});

	afterEach(() => {
		warnSpy.mockRestore();
		vi.useRealTimers();
	});

	describe('getPolicy', () => {
		it('returns DEFAULT_AUTH_POLICY when KV key is missing', async () => {
			const { env } = makeEnv();
			const result = await getPolicy(env);
			expect(result).toEqual(DEFAULT_AUTH_POLICY);
		});

		it('returns parsed policy when KV has a valid record', async () => {
			const { env, store } = makeEnv();
			const policy = buildPolicy();
			store.set('auth-policy', JSON.stringify(policy));
			const result = await getPolicy(env);
			expect(result).toEqual(policy);
		});

		it('returns DEFAULT_AUTH_POLICY and warns when KV has corrupt JSON', async () => {
			const { env, store } = makeEnv();
			store.set('auth-policy', '{not-json');
			const result = await getPolicy(env);
			expect(result).toEqual(DEFAULT_AUTH_POLICY);
			expect(warnSpy).toHaveBeenCalled();
		});

		it('returns DEFAULT_AUTH_POLICY and warns when KV has valid JSON but wrong shape', async () => {
			const { env, store } = makeEnv();
			store.set('auth-policy', JSON.stringify({ foo: 'bar' }));
			const result = await getPolicy(env);
			expect(result).toEqual(DEFAULT_AUTH_POLICY);
			expect(warnSpy).toHaveBeenCalled();
		});

		it('caches result — second call within 30s does NOT re-hit KV', async () => {
			const { env, kv, store } = makeEnv();
			store.set('auth-policy', JSON.stringify(buildPolicy()));
			await getPolicy(env);
			await getPolicy(env);
			expect(kv.get).toHaveBeenCalledTimes(1);
		});

		it('cache expires after 30s — second call re-hits KV', async () => {
			vi.useFakeTimers();
			vi.setSystemTime(new Date(1_700_000_000_000));
			const { env, kv, store } = makeEnv();
			store.set('auth-policy', JSON.stringify(buildPolicy()));
			await getPolicy(env);
			expect(kv.get).toHaveBeenCalledTimes(1);
			// Advance beyond 30s TTL
			vi.setSystemTime(new Date(1_700_000_000_000 + 30_001));
			await getPolicy(env);
			expect(kv.get).toHaveBeenCalledTimes(2);
		});

		it('caches the missing/default response so fail-open does not hammer KV', async () => {
			const { env, kv } = makeEnv();
			await getPolicy(env);
			await getPolicy(env);
			expect(kv.get).toHaveBeenCalledTimes(1);
		});

		it('caches the corrupt/default response so fail-open does not hammer KV', async () => {
			const { env, kv, store } = makeEnv();
			store.set('auth-policy', '{not-json');
			await getPolicy(env);
			await getPolicy(env);
			expect(kv.get).toHaveBeenCalledTimes(1);
		});
	});

	describe('putPolicy', () => {
		it('throws when AuthPolicySchema.parse() rejects invalid input', async () => {
			const { env } = makeEnv();
			await expect(putPolicy(env, { foo: 'bar' } as unknown as IAuthPolicy)).rejects.toThrow();
		});

		it('enforces the minLength floor — clamps values below AUTH_POLICY_MIN_LENGTH_FLOOR', async () => {
			const { env, store } = makeEnv();
			const policy = buildPolicy({ minLength: 4 });
			const returned = await putPolicy(env, policy);
			expect(returned.minLength).toBe(AUTH_POLICY_MIN_LENGTH_FLOOR);
			const persisted = JSON.parse(store.get('auth-policy')!) as IAuthPolicy;
			expect(persisted.minLength).toBe(AUTH_POLICY_MIN_LENGTH_FLOOR);
		});

		it('passes minLength through when at or above floor', async () => {
			const { env, store } = makeEnv();
			const policy = buildPolicy({ minLength: 12 });
			const returned = await putPolicy(env, policy);
			expect(returned.minLength).toBe(12);
			const persisted = JSON.parse(store.get('auth-policy')!) as IAuthPolicy;
			expect(persisted.minLength).toBe(12);
		});

		it('stamps updatedAt = Date.now(), ignoring caller value', async () => {
			vi.useFakeTimers();
			vi.setSystemTime(new Date(1_700_000_000_000));
			const { env, store } = makeEnv();
			const policy = buildPolicy({ updatedAt: 0 });
			const returned = await putPolicy(env, policy);
			expect(returned.updatedAt).toBe(1_700_000_000_000);
			const persisted = JSON.parse(store.get('auth-policy')!) as IAuthPolicy;
			expect(persisted.updatedAt).toBe(1_700_000_000_000);
		});

		it('invalidates cache — subsequent getPolicy returns new value without extra KV read', async () => {
			const { env, kv, store } = makeEnv();
			// Seed KV with an initial policy
			store.set('auth-policy', JSON.stringify(buildPolicy({ minLength: 10 })));
			// Populate cache
			const first = await getPolicy(env);
			expect(first.minLength).toBe(10);
			expect(kv.get).toHaveBeenCalledTimes(1);
			// Overwrite via putPolicy
			await putPolicy(env, buildPolicy({ minLength: 16 }));
			// Cache should now hold the new value without another KV read
			const second = await getPolicy(env);
			expect(second.minLength).toBe(16);
			expect(kv.get).toHaveBeenCalledTimes(1);
		});
	});
});
