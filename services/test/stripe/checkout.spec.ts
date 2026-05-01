import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleCheckout } from '../../src/stripe/checkout/stripe-checkout';
import Stripe from 'stripe';

describe('stripe-checkout handler', () => {
	let mockStripe: any;

	beforeEach(() => {
		vi.restoreAllMocks();

		mockStripe = {
			prices: {
				retrieve: vi.fn(),
			},
			checkout: {
				sessions: {
					create: vi.fn(),
				},
			},
		};
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
		const response = await handleCheckout(mockStripe as Stripe, request, env, 'https://example.com');
		expect(response.status).toBe(400);
		const body = (await response.json()) as any;
		expect(body.error).toBe('line_items is required and must be a non-empty array');
	});

	it('returns 400 for empty line_items array', async () => {
		const request = new Request('http://example.com/checkout', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json', Origin: 'https://example.com' },
			body: JSON.stringify({
				line_items: [],
				success_url: 'https://example.com/success',
				cancel_url: 'https://example.com/cancel',
			}),
		});
		const env = { STRIPE_SECRET_KEY: 'sk_test_123', ALLOWED_ORIGINS: 'https://example.com' } as Env;
		const response = await handleCheckout(mockStripe as Stripe, request, env, 'https://example.com');
		expect(response.status).toBe(400);
	});

	it('returns 400 for missing success_url', async () => {
		const request = new Request('http://example.com/checkout', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json', Origin: 'https://example.com' },
			body: JSON.stringify({
				line_items: [{ price: 'price_123', quantity: 1 }],
				cancel_url: 'https://example.com/cancel',
			}),
		});
		const env = { STRIPE_SECRET_KEY: 'sk_test_123', ALLOWED_ORIGINS: 'https://example.com' } as Env;
		const response = await handleCheckout(mockStripe as Stripe, request, env, 'https://example.com');
		expect(response.status).toBe(400);
		const body = (await response.json()) as any;
		expect(body.error).toBe('success_url and cancel_url are required');
	});

	it('returns 400 for missing cancel_url', async () => {
		const request = new Request('http://example.com/checkout', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json', Origin: 'https://example.com' },
			body: JSON.stringify({
				line_items: [{ price: 'price_123', quantity: 1 }],
				success_url: 'https://example.com/success',
			}),
		});
		const env = { STRIPE_SECRET_KEY: 'sk_test_123', ALLOWED_ORIGINS: 'https://example.com' } as Env;
		const response = await handleCheckout(mockStripe as Stripe, request, env, 'https://example.com');
		expect(response.status).toBe(400);
	});

	it('returns 400 for invalid success_url', async () => {
		const request = new Request('http://example.com/checkout', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json', Origin: 'https://example.com' },
			body: JSON.stringify({
				line_items: [{ price: 'price_123', quantity: 1 }],
				success_url: 'invalid-url',
				cancel_url: 'https://example.com/cancel',
			}),
		});
		const env = { STRIPE_SECRET_KEY: 'sk_test_123', ALLOWED_ORIGINS: 'https://example.com' } as Env;
		const response = await handleCheckout(mockStripe as Stripe, request, env, 'https://example.com');
		expect(response.status).toBe(400);
		const body = (await response.json()) as any;
		expect(body.error).toBe('success_url and cancel_url must be valid URLs');
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
		const response = await handleCheckout(mockStripe as Stripe, request, env, 'https://example.com');
		expect(response.status).toBe(400);
		const body = (await response.json()) as any;
		expect(body.error).toBe('Each line item must have either price or price_data');
	});

	it('returns 400 for invalid line_item (quantity < 1)', async () => {
		const request = new Request('http://example.com/checkout', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json', Origin: 'https://example.com' },
			body: JSON.stringify({
				line_items: [{ price: 'price_123', quantity: 0 }],
				success_url: 'https://example.com/success',
				cancel_url: 'https://example.com/cancel',
			}),
		});
		const env = { STRIPE_SECRET_KEY: 'sk_test_123', ALLOWED_ORIGINS: 'https://example.com' } as Env;
		const response = await handleCheckout(mockStripe as Stripe, request, env, 'https://example.com');
		expect(response.status).toBe(400);
		const body = (await response.json()) as any;
		expect(body.error).toBe('Each line item must have a quantity >= 1');
	});

	it('creates checkout session with one-time items', async () => {
		const mockPrice = { id: 'price_123', recurring: null };
		const mockSession = { id: 'cs_123', url: 'https://checkout.stripe.com/cs_123' };

		mockStripe.prices.retrieve.mockResolvedValue(mockPrice);
		mockStripe.checkout.sessions.create.mockResolvedValue(mockSession);

		const request = new Request('http://example.com/checkout', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json', Origin: 'https://example.com' },
			body: JSON.stringify({
				line_items: [{ price: 'price_123', quantity: 1 }],
				success_url: 'https://example.com/success',
				cancel_url: 'https://example.com/cancel',
			}),
		});
		const env = { STRIPE_SECRET_KEY: 'sk_test_123', ALLOWED_ORIGINS: 'https://example.com' } as Env;
		const response = await handleCheckout(mockStripe as Stripe, request, env, 'https://example.com');
		expect(response.status).toBe(200);
		const body = (await response.json()) as any;
		expect(body.sessions).toContain('https://checkout.stripe.com/cs_123');
	});

	it('creates separate sessions for recurring and one-time items', async () => {
		const mockRecurringPrice = { id: 'price_sub', recurring: { interval: 'month' } };
		const mockOneTimePrice = { id: 'price_onetime', recurring: null };
		const mockSubSession = { id: 'cs_sub', url: 'https://checkout.stripe.com/cs_sub' };
		const mockPaySession = { id: 'cs_pay', url: 'https://checkout.stripe.com/cs_pay' };

		mockStripe.prices.retrieve.mockResolvedValueOnce(mockRecurringPrice).mockResolvedValueOnce(mockOneTimePrice);
		mockStripe.checkout.sessions.create.mockResolvedValueOnce(mockSubSession).mockResolvedValueOnce(mockPaySession);

		const request = new Request('http://example.com/checkout', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json', Origin: 'https://example.com' },
			body: JSON.stringify({
				line_items: [
					{ price: 'price_sub', quantity: 1 },
					{ price: 'price_onetime', quantity: 2 },
				],
				success_url: 'https://example.com/success',
				cancel_url: 'https://example.com/cancel',
			}),
		});
		const env = { STRIPE_SECRET_KEY: 'sk_test_123', ALLOWED_ORIGINS: 'https://example.com' } as Env;
		const response = await handleCheckout(mockStripe as Stripe, request, env, 'https://example.com');
		expect(response.status).toBe(200);
		const body = (await response.json()) as any;
		expect(body.sessions).toHaveLength(2);
		expect(body.message).toBe('Multiple checkout sessions created');
	});

	it('handles Stripe errors gracefully', async () => {
		mockStripe.prices.retrieve.mockRejectedValue({ statusCode: 400, message: 'Invalid price' });

		const request = new Request('http://example.com/checkout', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json', Origin: 'https://example.com' },
			body: JSON.stringify({
				line_items: [{ price: 'price_invalid', quantity: 1 }],
				success_url: 'https://example.com/success',
				cancel_url: 'https://example.com/cancel',
			}),
		});
		const env = { STRIPE_SECRET_KEY: 'sk_test_123', ALLOWED_ORIGINS: 'https://example.com' } as Env;
		const response = await handleCheckout(mockStripe as Stripe, request, env, 'https://example.com');
		expect(response.status).toBe(400);
		const body = (await response.json()) as any;
		expect(body.error).toBe('Invalid price');
	});

	it('skips session when url is undefined for one-time items', async () => {
		const mockPrice = { id: 'price_123', recurring: null };
		const mockSession = { id: 'cs_123' }; // No url property

		mockStripe.prices.retrieve.mockResolvedValue(mockPrice);
		mockStripe.checkout.sessions.create.mockResolvedValue(mockSession);

		const request = new Request('http://example.com/checkout', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json', Origin: 'https://example.com' },
			body: JSON.stringify({
				line_items: [{ price: 'price_123', quantity: 1 }],
				success_url: 'https://example.com/success',
				cancel_url: 'https://example.com/cancel',
			}),
		});
		const env = { STRIPE_SECRET_KEY: 'sk_test_123', ALLOWED_ORIGINS: 'https://example.com' } as Env;
		const response = await handleCheckout(mockStripe as Stripe, request, env, 'https://example.com');
		expect(response.status).toBe(200);
		const body = (await response.json()) as any;
		expect(body.sessions).toHaveLength(0);
	});

	it('skips session when url is undefined for recurring items', async () => {
		const mockPrice = { id: 'price_sub', recurring: { interval: 'month' } };
		const mockSession = { id: 'cs_sub' }; // No url property

		mockStripe.prices.retrieve.mockResolvedValue(mockPrice);
		mockStripe.checkout.sessions.create.mockResolvedValue(mockSession);

		const request = new Request('http://example.com/checkout', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json', Origin: 'https://example.com' },
			body: JSON.stringify({
				line_items: [{ price: 'price_sub', quantity: 1 }],
				success_url: 'https://example.com/success',
				cancel_url: 'https://example.com/cancel',
			}),
		});
		const env = { STRIPE_SECRET_KEY: 'sk_test_123', ALLOWED_ORIGINS: 'https://example.com' } as Env;
		const response = await handleCheckout(mockStripe as Stripe, request, env, 'https://example.com');
		expect(response.status).toBe(200);
		const body = (await response.json()) as any;
		expect(body.sessions).toHaveLength(0);
	});

	it('handles Stripe errors with statusCode >= 500', async () => {
		mockStripe.prices.retrieve.mockRejectedValue({ statusCode: 500, message: 'Internal Server Error' });

		const request = new Request('http://example.com/checkout', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json', Origin: 'https://example.com' },
			body: JSON.stringify({
				line_items: [{ price: 'price_500', quantity: 1 }],
				success_url: 'https://example.com/success',
				cancel_url: 'https://example.com/cancel',
			}),
		});
		const env = { STRIPE_SECRET_KEY: 'sk_test_123', ALLOWED_ORIGINS: 'https://example.com' } as Env;
		const response = await handleCheckout(mockStripe as Stripe, request, env, 'https://example.com');
		expect(response.status).toBe(500);
		const body = (await response.json()) as any;
		expect(body.error).toBe('An error occurred');
	});

	it('handles Stripe errors with missing message when statusCode < 500', async () => {
		mockStripe.prices.retrieve.mockRejectedValue({ statusCode: 400 }); // No message

		const request = new Request('http://example.com/checkout', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json', Origin: 'https://example.com' },
			body: JSON.stringify({
				line_items: [{ price: 'price_400', quantity: 1 }],
				success_url: 'https://example.com/success',
				cancel_url: 'https://example.com/cancel',
			}),
		});
		const env = { STRIPE_SECRET_KEY: 'sk_test_123', ALLOWED_ORIGINS: 'https://example.com' } as Env;
		const response = await handleCheckout(mockStripe as Stripe, request, env, 'https://example.com');
		expect(response.status).toBe(400);
		const body = (await response.json()) as any;
		expect(body.error).toBe('An error occurred');
	});

	it('handles Stripe errors with undefined statusCode (defaults to 500)', async () => {
		mockStripe.prices.retrieve.mockRejectedValue({ message: 'Something failed' }); // No statusCode

		const request = new Request('http://example.com/checkout', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json', Origin: 'https://example.com' },
			body: JSON.stringify({
				line_items: [{ price: 'price_unknown', quantity: 1 }],
				success_url: 'https://example.com/success',
				cancel_url: 'https://example.com/cancel',
			}),
		});
		const env = { STRIPE_SECRET_KEY: 'sk_test_123', ALLOWED_ORIGINS: 'https://example.com' } as Env;
		const response = await handleCheckout(mockStripe as Stripe, request, env, 'https://example.com');
		expect(response.status).toBe(500);
		const body = (await response.json()) as any;
		expect(body.error).toBe('An error occurred');
	});
});
