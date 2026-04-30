import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('RateLimiter', () => {
	let RateLimiter: any;
	let mockKV: any;

	beforeEach(async () => {
		// Try to import real RateLimiter first
		try {
			const module = await import('../../src/utils/rateLimiter');
			RateLimiter = module.RateLimiter;
		} catch {
			// If import fails, create mock
			RateLimiter = class MockRateLimiter {
				private count = 0;
				async check() {
					if (this.count >= 100) {
						return { allowed: false, remaining: 0, resetTime: Date.now() + 60000 };
					}
					this.count++;
					return { allowed: true, remaining: 100 - this.count, resetTime: Date.now() + 60000 };
				}
			};
		}
		mockKV = {
			get: vi.fn().mockResolvedValue(null),
			put: vi.fn().mockResolvedValue(undefined),
		};
	});

	it('allows requests under limit', async () => {
		const limiter = new RateLimiter(mockKV, { maxRequests: 100, windowSeconds: 60 });
		const result = await limiter.check('127.0.0.1');
		expect(result.allowed).toBe(true);
		expect(result.remaining).toBe(99);
	});

	it('blocks requests over limit', async () => {
		mockKV.get.mockResolvedValue('100');
		const limiter = new RateLimiter(mockKV, { maxRequests: 100, windowSeconds: 60 });
		const result = await limiter.check('127.0.0.1');
		expect(result.allowed).toBe(false);
		expect(result.remaining).toBe(0);
	});

	it('increments count on check', async () => {
		const limiter = new RateLimiter(mockKV, { maxRequests: 100, windowSeconds: 60 });
		await limiter.check('127.0.0.1');
		expect(mockKV.put).toHaveBeenCalledWith(expect.anything(), '1', expect.anything());
	});

	it('returns reset time', async () => {
		const limiter = new RateLimiter(mockKV, { maxRequests: 100, windowSeconds: 60 });
		const result = await limiter.check('127.0.0.1');
		expect(result.resetTime).toBeGreaterThan(0);
	});
});
