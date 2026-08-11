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
		expect(body.ok).toBe(false);
		expect(body.error.code).toBe('VALIDATION_FAILED');
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
		expect(body.ok).toBe(false);
		expect(body.error.code).toBe('VALIDATION_FAILED');
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
		expect(body.ok).toBe(false);
		expect(body.error.code).toBe('VALIDATION_FAILED');
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
		expect(body.ok).toBe(false);
		expect(body.error.code).toBe('VALIDATION_FAILED');
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
		expect(body.ok).toBe(false);
		expect(body.error.code).toBe('VALIDATION_FAILED');
	});

	it('rejects caller-supplied inline price_data (arbitrary-amount injection guard)', async () => {
		const request = new Request('http://example.com/checkout', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json', Origin: 'https://example.com' },
			body: JSON.stringify({
				line_items: [
					{
						price_data: {
							currency: 'usd',
							product_data: { name: 'Free honey' },
							unit_amount: 1,
						},
						quantity: 1,
					},
				],
				success_url: 'https://example.com/success',
				cancel_url: 'https://example.com/cancel',
			}),
		});
		const env = { STRIPE_SECRET_KEY: 'sk_test_123', ALLOWED_ORIGINS: 'https://example.com' } as Env;
		const response = await handleCheckout(mockStripe as Stripe, request, env, 'https://example.com');
		expect(response.status).toBe(400);
		const body = (await response.json()) as any;
		expect(body.ok).toBe(false);
		expect(body.error.code).toBe('VALIDATION_FAILED');
		// price_data must never reach Stripe.
		expect(mockStripe.prices.retrieve).not.toHaveBeenCalled();
		expect(mockStripe.checkout.sessions.create).not.toHaveBeenCalled();
	});

	it('rejects a non-string price (must be a price ID)', async () => {
		const request = new Request('http://example.com/checkout', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json', Origin: 'https://example.com' },
			body: JSON.stringify({
				line_items: [{ price: { foo: 'bar' }, quantity: 1 }],
				success_url: 'https://example.com/success',
				cancel_url: 'https://example.com/cancel',
			}),
		});
		const env = { STRIPE_SECRET_KEY: 'sk_test_123', ALLOWED_ORIGINS: 'https://example.com' } as Env;
		const response = await handleCheckout(mockStripe as Stripe, request, env, 'https://example.com');
		expect(response.status).toBe(400);
		const body = (await response.json()) as any;
		expect(body.error.code).toBe('VALIDATION_FAILED');
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
		expect(body.ok).toBe(true);
		expect(body.data.sessions).toContain('https://checkout.stripe.com/cs_123');

		// Verify the Stripe SDK was called with the checkout session params (custom_fields
		// for order_status are added by the admin-side `update-order` flow, not at checkout).
		const createCall = mockStripe.checkout.sessions.create.mock.calls[0][0];
		expect(createCall.mode).toBe('payment');
		expect(createCall.line_items).toHaveLength(1);
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
		expect(body.ok).toBe(true);
		expect(body.data.sessions).toHaveLength(2);
		expect(body.data.message).toBe('Multiple checkout sessions created');

		// Both sessions are created with the right mode
		const subCall = mockStripe.checkout.sessions.create.mock.calls[0][0];
		const payCall = mockStripe.checkout.sessions.create.mock.calls[1][0];
		expect(subCall.mode).toBe('subscription');
		expect(payCall.mode).toBe('payment');
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
		expect(body.ok).toBe(false);
		expect(body.error.code).toBe('BAD_REQUEST');
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
		expect(body.ok).toBe(true);
		expect(body.data.sessions).toHaveLength(0);
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
		expect(body.ok).toBe(true);
		expect(body.data.sessions).toHaveLength(0);
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
		expect(body.ok).toBe(false);
		expect(body.error.code).toBe('INTERNAL');
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
		expect(body.ok).toBe(false);
		expect(body.error.code).toBe('BAD_REQUEST');
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
		expect(body.ok).toBe(false);
		expect(body.error.code).toBe('INTERNAL');
	});

	describe('success_url / cancel_url hostname validation (review I3)', () => {
		// Open-redirect class: without a hostname check, a malicious client can drive
		// users through Stripe and back to an attacker-controlled domain that mimics
		// the shop's "thank you" page. ALLOWED_ORIGINS is the trust boundary.

		it('rejects success_url whose hostname is outside ALLOWED_ORIGINS', async () => {
			const request = new Request('http://example.com/checkout', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json', Origin: 'https://example.com' },
				body: JSON.stringify({
					line_items: [{ price: 'price_123', quantity: 1 }],
					success_url: 'https://evil.test/win',
					cancel_url: 'https://example.com/cancel',
				}),
			});
			const env = { STRIPE_SECRET_KEY: 'sk_test_123', ALLOWED_ORIGINS: 'https://example.com' } as Env;
			const response = await handleCheckout(mockStripe as Stripe, request, env, 'https://example.com');
			expect(response.status).toBe(400);
			const body = (await response.json()) as any;
			expect(body.ok).toBe(false);
			expect(body.error.code).toBe('VALIDATION_FAILED');
		});

		it('rejects cancel_url whose hostname is outside ALLOWED_ORIGINS', async () => {
			const request = new Request('http://example.com/checkout', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json', Origin: 'https://example.com' },
				body: JSON.stringify({
					line_items: [{ price: 'price_123', quantity: 1 }],
					success_url: 'https://example.com/success',
					cancel_url: 'https://attacker.test/cancel',
				}),
			});
			const env = { STRIPE_SECRET_KEY: 'sk_test_123', ALLOWED_ORIGINS: 'https://example.com' } as Env;
			const response = await handleCheckout(mockStripe as Stripe, request, env, 'https://example.com');
			expect(response.status).toBe(400);
			const body = (await response.json()) as any;
			expect(body.ok).toBe(false);
			expect(body.error.code).toBe('VALIDATION_FAILED');
		});

		it('accepts URLs matching any entry in a multi-origin ALLOWED_ORIGINS list', async () => {
			const mockPrice = { id: 'price_123', recurring: null };
			const mockSession = { id: 'cs_123', url: 'https://checkout.stripe.com/cs_123' };
			mockStripe.prices.retrieve.mockResolvedValue(mockPrice);
			mockStripe.checkout.sessions.create.mockResolvedValue(mockSession);

			const request = new Request('http://example.com/checkout', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json', Origin: 'https://shop.example.com' },
				body: JSON.stringify({
					line_items: [{ price: 'price_123', quantity: 1 }],
					success_url: 'https://shop.example.com/success',
					cancel_url: 'https://admin.example.com/cancel',
				}),
			});
			const env = {
				STRIPE_SECRET_KEY: 'sk_test_123',
				ALLOWED_ORIGINS: 'https://shop.example.com,https://admin.example.com',
			} as Env;
			const response = await handleCheckout(mockStripe as Stripe, request, env, 'https://shop.example.com');
			expect(response.status).toBe(200);
		});

		it('treats ALLOWED_ORIGINS=* as a wildcard (development bypass)', async () => {
			const mockPrice = { id: 'price_123', recurring: null };
			const mockSession = { id: 'cs_123', url: 'https://checkout.stripe.com/cs_123' };
			mockStripe.prices.retrieve.mockResolvedValue(mockPrice);
			mockStripe.checkout.sessions.create.mockResolvedValue(mockSession);

			const request = new Request('http://example.com/checkout', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json', Origin: 'https://anything.test' },
				body: JSON.stringify({
					line_items: [{ price: 'price_123', quantity: 1 }],
					success_url: 'http://localhost:5173/success',
					cancel_url: 'http://localhost:5173/cancel',
				}),
			});
			const env = { STRIPE_SECRET_KEY: 'sk_test_123', ALLOWED_ORIGINS: '*' } as Env;
			const response = await handleCheckout(mockStripe as Stripe, request, env, 'https://anything.test');
			expect(response.status).toBe(200);
		});
	});
});
