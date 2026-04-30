import { describe, it, expect, vi, beforeEach } from 'vitest';
import worker from '../../src/stripe/product/get-products';

describe('get-products handler', () => {
	beforeEach(() => {
		vi.restoreAllMocks();
	});

	it('returns 403 for disallowed origin', async () => {
		const request = new Request('http://example.com/products', {
			method: 'GET',
			headers: { Origin: 'https://evil.com' },
		});
		const env = { STRIPE_SECRET_KEY: 'sk_test_123', ALLOWED_ORIGINS: 'https://example.com' } as Env;
		const response = await worker.fetch(request, env);
		expect(response.status).toBe(403);
	});

	it('returns 405 for non-GET method', async () => {
		const request = new Request('http://example.com/products', {
			method: 'POST',
			headers: { Origin: 'https://example.com' },
		});
		const env = { STRIPE_SECRET_KEY: 'sk_test_123', ALLOWED_ORIGINS: 'https://example.com' } as Env;
		const response = await worker.fetch(request, env);
		expect(response.status).toBe(405);
	});
});
