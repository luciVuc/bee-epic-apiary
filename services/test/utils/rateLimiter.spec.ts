import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RateLimiter } from '../../src/utils/rateLimiter';
import { checkRateLimit, type IRateLimitStorage } from '../../src/utils/rate-limiter-do';

/**
 * RateLimiter delegates to a Durable Object via `doNamespace.getByName('default').check(...)`.
 * These tests mock the namespace and stub the RPC to verify both the happy path and the
 * graceful-fallback behavior when the DO is unreachable.
 */
describe('RateLimiter', () => {
	let mockStub: { check: ReturnType<typeof vi.fn> };
	let mockNamespace: any;

	beforeEach(() => {
		mockStub = { check: vi.fn() };
		mockNamespace = { getByName: vi.fn().mockReturnValue(mockStub) };
	});

	it('returns the DO result when allowed', async () => {
		mockStub.check.mockResolvedValue({ allowed: true, remaining: 99, resetTime: 12345 });
		const limiter = new RateLimiter(mockNamespace, { maxRequests: 100, windowSeconds: 60 });
		const result = await limiter.check('127.0.0.1');
		expect(result).toEqual({ allowed: true, remaining: 99, resetTime: 12345 });
		expect(mockStub.check).toHaveBeenCalledWith('127.0.0.1', 100, 60);
	});

	it('returns the DO result when blocked', async () => {
		mockStub.check.mockResolvedValue({ allowed: false, remaining: 0, resetTime: 99999 });
		const limiter = new RateLimiter(mockNamespace, { maxRequests: 100, windowSeconds: 60 });
		const result = await limiter.check('127.0.0.1');
		expect(result.allowed).toBe(false);
		expect(result.remaining).toBe(0);
	});

	it('passes maxRequests and windowSeconds to the DO', async () => {
		mockStub.check.mockResolvedValue({ allowed: true, remaining: 4, resetTime: 0 });
		const limiter = new RateLimiter(mockNamespace, { maxRequests: 5, windowSeconds: 30 });
		await limiter.check('client-key');
		expect(mockStub.check).toHaveBeenCalledWith('client-key', 5, 30);
	});

	it('falls back to fail-open (allowed: true) when the DO call throws', async () => {
		mockStub.check.mockRejectedValue(new Error('DO unreachable'));
		const limiter = new RateLimiter(mockNamespace, { maxRequests: 100, windowSeconds: 60 });
		const result = await limiter.check('127.0.0.1');
		expect(result.allowed).toBe(true);
		expect(result.remaining).toBe(100);
		expect(result.resetTime).toBeGreaterThan(0);
	});

	it('logs to console.error when the DO throws (review I2)', async () => {
		// Fail-open is fine for availability, but the error must reach observability;
		// without a log, a degraded rate limiter is invisible to monitoring.
		const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
		mockStub.check.mockRejectedValue(new Error('boom'));
		const limiter = new RateLimiter(mockNamespace, { maxRequests: 10, windowSeconds: 60 });
		const r = await limiter.check('client-key');
		expect(r.allowed).toBe(true);
		expect(errSpy).toHaveBeenCalled();
		const [msg, payload] = errSpy.mock.calls[0];
		expect(String(msg)).toMatch(/rate.?limit/i);
		expect(payload).toMatchObject({ key: 'client-key' });
		errSpy.mockRestore();
	});
});

/**
 * `RateLimiterDO.check()` delegates to a pure `checkRateLimit(storage, ...)` so the
 * persistence logic can be tested against a fake storage without needing a real
 * `DurableObject` runtime. The previous implementation kept counts in a private
 * `Map`, which silently reset on every isolate eviction (review I1).
 */
describe('checkRateLimit state.storage persistence (review I1)', () => {
	function makeFakeStorage() {
		const store = new Map<string, unknown>();
		const storage: IRateLimitStorage & {
			__getRaw: <T>(k: string) => T | undefined;
			__setRaw: (k: string, v: unknown) => void;
			__putSpy: ReturnType<typeof vi.fn>;
		} = {
			get: vi.fn(async <T>(k: string) => store.get(k) as T | undefined),
			put: vi.fn(async (k: string, v: unknown) => {
				store.set(k, v);
			}),
			__getRaw: <T>(k: string) => store.get(k) as T | undefined,
			__setRaw: (k: string, v: unknown) => {
				store.set(k, v);
			},
			__putSpy: undefined as never,
		};
		storage.__putSpy = storage.put as unknown as ReturnType<typeof vi.fn>;
		return storage;
	}

	it('persists counts across check() calls via storage (no in-memory cache lost on eviction)', async () => {
		const storage = makeFakeStorage();
		// Two calls write to storage…
		await checkRateLimit(storage, 'k', 5, 60);
		await checkRateLimit(storage, 'k', 5, 60);
		// …and a fresh "isolate" (a brand-new caller) still sees the prior count.
		const r = await checkRateLimit(storage, 'k', 5, 60);
		expect(r.allowed).toBe(true);
		expect(r.remaining).toBe(2); // 3rd request → 5 - 3 = 2 remaining
	});

	it('writes to storage on every check() (not just memory)', async () => {
		const storage = makeFakeStorage();
		await checkRateLimit(storage, 'k', 3, 60);
		expect(storage.__putSpy).toHaveBeenCalled();
	});

	it('returns blocked once max is reached', async () => {
		const storage = makeFakeStorage();
		await checkRateLimit(storage, 'k', 2, 60);
		await checkRateLimit(storage, 'k', 2, 60);
		const third = await checkRateLimit(storage, 'k', 2, 60);
		expect(third.allowed).toBe(false);
		expect(third.remaining).toBe(0);
	});

	it('resets the window once resetAt has passed', async () => {
		const storage = makeFakeStorage();
		await checkRateLimit(storage, 'k', 2, 60);
		// manually rewind resetAt into the past
		const stored = storage.__getRaw<{ count: number; resetAt: number }>('rl:k');
		if (!stored) throw new Error('expected stored entry');
		storage.__setRaw('rl:k', { count: stored.count, resetAt: Math.floor(Date.now() / 1000) - 1 });
		const r = await checkRateLimit(storage, 'k', 2, 60);
		expect(r.allowed).toBe(true);
		expect(r.remaining).toBe(1); // window reset → counter at 1
	});

	it('passes expirationTtl on put so storage entries auto-expire', async () => {
		const storage = makeFakeStorage();
		await checkRateLimit(storage, 'k', 5, 60);
		expect(storage.__putSpy).toHaveBeenCalledWith('rl:k', expect.any(Object), expect.objectContaining({ expirationTtl: 65 }));
	});
});
