import { describe, it, expect, vi, beforeEach } from 'vitest';
import worker from '../../src/stripe/price/create-price';
import { handleCreatePrice } from '../../src/stripe/price/create-price';
import Stripe from 'stripe';

describe('create-price handler', () => {
	let mockStripe: any;

	beforeEach(() => {
		vi.restoreAllMocks();

		mockStripe = {
			prices: {
				create: vi.fn(),
			},
		};
	});

	it('returns 400 for missing product ID', async () => {
		const request = new Request('http://example.com/prices', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json', Origin: 'https://example.com' },
			body: JSON.stringify({ unit_amount: 2000, currency: 'usd' }),
		});
		const env = { STRIPE_SECRET_KEY: 'sk_test_123', ALLOWED_ORIGINS: 'https://example.com' } as Env;
		const response = await handleCreatePrice(mockStripe as Stripe, request, env, 'https://example.com');
		expect(response.status).toBe(400);
		const body = (await response.json()) as any;
		expect(body.ok).toBe(false);
		expect(body.error.code).toBe('VALIDATION_FAILED');
	});

	it('returns 400 for missing unit_amount', async () => {
		const request = new Request('http://example.com/prices', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json', Origin: 'https://example.com' },
			body: JSON.stringify({ product: 'prod_123', currency: 'usd' }),
		});
		const env = { STRIPE_SECRET_KEY: 'sk_test_123', ALLOWED_ORIGINS: 'https://example.com' } as Env;
		const response = await handleCreatePrice(mockStripe as Stripe, request, env, 'https://example.com');
		expect(response.status).toBe(400);
		const body = (await response.json()) as any;
		expect(body.ok).toBe(false);
		expect(body.error.code).toBe('VALIDATION_FAILED');
	});

	it('returns 400 for unit_amount <= 0', async () => {
		const request = new Request('http://example.com/prices', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json', Origin: 'https://example.com' },
			body: JSON.stringify({ product: 'prod_123', unit_amount: 0, currency: 'usd' }),
		});
		const env = { STRIPE_SECRET_KEY: 'sk_test_123', ALLOWED_ORIGINS: 'https://example.com' } as Env;
		const response = await handleCreatePrice(mockStripe as Stripe, request, env, 'https://example.com');
		expect(response.status).toBe(400);
		const body = (await response.json()) as any;
		expect(body.ok).toBe(false);
		expect(body.error.code).toBe('VALIDATION_FAILED');
	});

	it('returns 400 for missing currency', async () => {
		const request = new Request('http://example.com/prices', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json', Origin: 'https://example.com' },
			body: JSON.stringify({ product: 'prod_123', unit_amount: 2000 }),
		});
		const env = { STRIPE_SECRET_KEY: 'sk_test_123', ALLOWED_ORIGINS: 'https://example.com' } as Env;
		const response = await handleCreatePrice(mockStripe as Stripe, request, env, 'https://example.com');
		expect(response.status).toBe(400);
		const body = (await response.json()) as any;
		expect(body.ok).toBe(false);
		expect(body.error.code).toBe('VALIDATION_FAILED');
	});

	it('returns 400 for invalid lookup_key', async () => {
		const request = new Request('http://example.com/prices', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json', Origin: 'https://example.com' },
			body: JSON.stringify({ product: 'prod_123', unit_amount: 2000, currency: 'usd', lookup_key: 123 }),
		});
		const env = { STRIPE_SECRET_KEY: 'sk_test_123', ALLOWED_ORIGINS: 'https://example.com' } as Env;
		const response = await handleCreatePrice(mockStripe as Stripe, request, env, 'https://example.com');
		expect(response.status).toBe(400);
		const body = (await response.json()) as any;
		expect(body.ok).toBe(false);
		expect(body.error.code).toBe('VALIDATION_FAILED');
	});

	it('creates price successfully', async () => {
		const mockPrice = { id: 'price_123', product: 'prod_123', unit_amount: 2000, currency: 'usd' };
		mockStripe.prices.create.mockResolvedValue(mockPrice);

		const request = new Request('http://example.com/prices', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json', Origin: 'https://example.com' },
			body: JSON.stringify({ product: 'prod_123', unit_amount: 2000, currency: 'usd' }),
		});
		const env = { STRIPE_SECRET_KEY: 'sk_test_123', ALLOWED_ORIGINS: 'https://example.com' } as Env;
		const response = await handleCreatePrice(mockStripe as Stripe, request, env, 'https://example.com');
		expect(response.status).toBe(201);
		const body = (await response.json()) as any;
		expect(body.ok).toBe(true);
		expect(body.data.id).toBe('price_123');
	});

	it('returns 400 with empty string product', async () => {
		const request = new Request('http://example.com/prices', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json', Origin: 'https://example.com' },
			body: JSON.stringify({ product: '', unit_amount: 2000, currency: 'usd' }),
		});
		const env = { STRIPE_SECRET_KEY: 'sk_test_123', ALLOWED_ORIGINS: 'https://example.com' } as Env;
		const response = await handleCreatePrice(mockStripe as Stripe, request, env, 'https://example.com');
		expect(response.status).toBe(400);
	});

	it('handles Stripe errors gracefully', async () => {
		mockStripe.prices.create.mockRejectedValue({ statusCode: 400, message: 'Invalid price data' });

		const request = new Request('http://example.com/prices', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json', Origin: 'https://example.com' },
			body: JSON.stringify({ product: 'prod_123', unit_amount: 2000, currency: 'usd' }),
		});
		const env = { STRIPE_SECRET_KEY: 'sk_test_123', ALLOWED_ORIGINS: 'https://example.com' } as Env;
		const response = await handleCreatePrice(mockStripe as Stripe, request, env, 'https://example.com');
		expect(response.status).toBe(400);
		const body = (await response.json()) as any;
		expect(body.ok).toBe(false);
		expect(body.error.code).toBe('BAD_REQUEST');
	});

	it('handles Stripe errors with statusCode >= 500', async () => {
		mockStripe.prices.create.mockRejectedValue({ statusCode: 500, message: 'Internal Server Error' });

		const request = new Request('http://example.com/prices', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json', Origin: 'https://example.com' },
			body: JSON.stringify({ product: 'prod_123', unit_amount: 2000, currency: 'usd' }),
		});
		const env = { STRIPE_SECRET_KEY: 'sk_test_123', ALLOWED_ORIGINS: 'https://example.com' } as Env;
		const response = await handleCreatePrice(mockStripe as Stripe, request, env, 'https://example.com');
		expect(response.status).toBe(500);
		const body = (await response.json()) as any;
		expect(body.ok).toBe(false);
		expect(body.error.code).toBe('INTERNAL');
	});

	it('handles Stripe errors with missing message when statusCode < 500', async () => {
		mockStripe.prices.create.mockRejectedValue({ statusCode: 400 });

		const request = new Request('http://example.com/prices', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json', Origin: 'https://example.com' },
			body: JSON.stringify({ product: 'prod_123', unit_amount: 2000, currency: 'usd' }),
		});
		const env = { STRIPE_SECRET_KEY: 'sk_test_123', ALLOWED_ORIGINS: 'https://example.com' } as Env;
		const response = await handleCreatePrice(mockStripe as Stripe, request, env, 'https://example.com');
		expect(response.status).toBe(400);
		const body = (await response.json()) as any;
		expect(body.ok).toBe(false);
		expect(body.error.code).toBe('BAD_REQUEST');
	});

	it('handles Stripe errors with undefined statusCode (defaults to 500)', async () => {
		mockStripe.prices.create.mockRejectedValue({ message: 'Something failed' });

		const request = new Request('http://example.com/prices', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json', Origin: 'https://example.com' },
			body: JSON.stringify({ product: 'prod_123', unit_amount: 2000, currency: 'usd' }),
		});
		const env = { STRIPE_SECRET_KEY: 'sk_test_123', ALLOWED_ORIGINS: 'https://example.com' } as Env;
		const response = await handleCreatePrice(mockStripe as Stripe, request, env, 'https://example.com');
		expect(response.status).toBe(500);
		const body = (await response.json()) as any;
		expect(body.ok).toBe(false);
		expect(body.error.code).toBe('INTERNAL');
	});

	it('returns 403 for disallowed origin', async () => {
		const request = new Request('http://example.com/prices', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json', Origin: 'https://evil.com' },
			body: JSON.stringify({ product: 'prod_123', unit_amount: 2000, currency: 'usd' }),
		});
		const env = { STRIPE_SECRET_KEY: 'sk_test_123', ALLOWED_ORIGINS: 'https://example.com' } as Env;
		const response = await worker.fetch(request, env);
		expect(response.status).toBe(403);
	});

	it('returns 405 for non-POST method', async () => {
		const request = new Request('http://example.com/prices', {
			method: 'GET',
			headers: { Origin: 'https://example.com' },
		});
		const env = { STRIPE_SECRET_KEY: 'sk_test_123', ALLOWED_ORIGINS: 'https://example.com' } as Env;
		const response = await worker.fetch(request, env);
		expect(response.status).toBe(405);
	});

	it('handles OPTIONS preflight', async () => {
		const request = new Request('http://example.com/prices', {
			method: 'OPTIONS',
			headers: { Origin: 'https://example.com' },
		});
		const env = { STRIPE_SECRET_KEY: 'sk_test_123', ALLOWED_ORIGINS: 'https://example.com' } as Env;
		const response = await worker.fetch(request, env);
		expect(response.status).toBe(204);
		expect(response.headers.get('Access-Control-Allow-Methods')).toBe('POST, OPTIONS');
	});
});
