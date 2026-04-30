import { describe, it, expect, vi, beforeEach } from 'vitest';
import worker from '../../src/stripe/product/delete-product';

describe('delete-product handler', () => {
	beforeEach(() => {
		vi.restoreAllMocks();
	});

	it('returns 403 for disallowed origin', async () => {
		const request = new Request('http://example.com/products/prod_123', {
			method: 'DELETE',
			headers: { Origin: 'https://evil.com' },
		});
		const env = { STRIPE_SECRET_KEY: 'sk_test_123', ALLOWED_ORIGINS: 'https://example.com' } as Env;
		const response = await worker.fetch(request, env);
		expect(response.status).toBe(403);
	});

	it('returns 405 for non-DELETE method', async () => {
		const request = new Request('http://example.com/products/prod_123', {
			method: 'PUT',
			headers: { Origin: 'https://example.com' },
		});
		const env = { STRIPE_SECRET_KEY: 'sk_test_123', ALLOWED_ORIGINS: 'https://example.com' } as Env;
		const response = await worker.fetch(request, env);
		expect(response.status).toBe(405);
	});
});
