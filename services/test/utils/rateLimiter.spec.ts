import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RateLimiter } from '../../src/utils/rateLimiter';

describe('RateLimiter', () => {
	let mockKV: any;

	beforeEach(() => {
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
