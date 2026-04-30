import { describe, it, expect, vi, beforeEach } from 'vitest';
import worker from '../../src/stripe/checkout/stripe-checkout';

describe('stripe-checkout handler', () => {
	beforeEach(() => {
		vi.restoreAllMocks();
	});

	it('returns 400 for missing line_items', async () => {
		const request = new Request('http://example.com/checkout', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json', Origin: 'https://example.com' },
			body: JSON.stringify({
				success_url: 'https://example.com/success',
				cancel_url: 'https://example.com/cancel',
			}),
		});
		const env = { STRIPE_SECRET_KEY: 'sk_test_123', ALLOWED_ORIGINS: 'https://example.com' } as Env;
		const response = await worker.fetch(request, env);
		expect(response.status).toBe(400);
	});

	it('returns 400 for invalid line_item (no price)', async () => {
		const request = new Request('http://example.com/checkout', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json', Origin: 'https://example.com' },
			body: JSON.stringify({
				line_items: [{ quantity: 1 }],
				success_url: 'https://example.com/success',
				cancel_url: 'https://example.com/cancel',
			}),
		});
		const env = { STRIPE_SECRET_KEY: 'sk_test_123', ALLOWED_ORIGINS: 'https://example.com' } as Env;
		const response = await worker.fetch(request, env);
		expect(response.status).toBe(400);
	});

	it('returns 403 for disallowed origin', async () => {
		const request = new Request('http://example.com/checkout', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json', Origin: 'https://evil.com' },
			body: JSON.stringify({
				line_items: [{ price: 'price_123', quantity: 1 }],
				success_url: 'https://example.com/success',
				cancel_url: 'https://example.com/cancel',
			}),
		});
		const env = { STRIPE_SECRET_KEY: 'sk_test_123', ALLOWED_ORIGINS: 'https://example.com' } as Env;
		const response = await worker.fetch(request, env);
		expect(response.status).toBe(403);
	});
});
