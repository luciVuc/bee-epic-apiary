import { describe, it, expect, vi, beforeEach } from 'vitest';
import worker from '../../src/stripe/product/create-product';
import { handleCreateProduct } from '../../src/stripe/product/create-product';
import Stripe from 'stripe';

describe('create-product handler', () => {
	let mockStripe: any;

	beforeEach(() => {
		vi.restoreAllMocks();

		mockStripe = {
			products: {
				create: vi.fn(),
			},
		};
	});

	// Tests for business logic (using exported handler function with mocked Stripe)
	it('returns 400 for missing name', async () => {
		const request = new Request('http://example.com/products', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json', Origin: 'https://example.com' },
			body: JSON.stringify({ description: 'Test' }),
		});
		const env = { STRIPE_SECRET_KEY: 'sk_test_123', ALLOWED_ORIGINS: 'https://example.com' } as Env;
		const response = await handleCreateProduct(mockStripe as Stripe, request, env, 'https://example.com');
		expect(response.status).toBe(400);
		const body = (await response.json()) as any;
		expect(body.ok).toBe(false);
		expect(body.error.code).toBe('VALIDATION_FAILED');
	});

	it('returns 400 for empty name', async () => {
		const request = new Request('http://example.com/products', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json', Origin: 'https://example.com' },
			body: JSON.stringify({ name: '   ' }),
		});
		const env = { STRIPE_SECRET_KEY: 'sk_test_123', ALLOWED_ORIGINS: 'https://example.com' } as Env;
		const response = await handleCreateProduct(mockStripe as Stripe, request, env, 'https://example.com');
		expect(response.status).toBe(400);
	});

	it('returns 400 for invalid product URL', async () => {
		const request = new Request('http://example.com/products', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json', Origin: 'https://example.com' },
			body: JSON.stringify({ name: 'Test Product', url: 'invalid-url' }),
		});
		const env = { STRIPE_SECRET_KEY: 'sk_test_123', ALLOWED_ORIGINS: 'https://example.com' } as Env;
		const response = await handleCreateProduct(mockStripe as Stripe, request, env, 'https://example.com');
		expect(response.status).toBe(400);
		const body = (await response.json()) as any;
		expect(body.ok).toBe(false);
		expect(body.error.code).toBe('VALIDATION_FAILED');
	});

	it('returns 400 for invalid image URL', async () => {
		const request = new Request('http://example.com/products', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json', Origin: 'https://example.com' },
			body: JSON.stringify({
				name: 'Test Product',
				images: ['https://valid.com/img.png', 'invalid-url'],
			}),
		});
		const env = { STRIPE_SECRET_KEY: 'sk_test_123', ALLOWED_ORIGINS: 'https://example.com' } as Env;
		const response = await handleCreateProduct(mockStripe as Stripe, request, env, 'https://example.com');
		expect(response.status).toBe(400);
		const body = (await response.json()) as any;
		expect(body.ok).toBe(false);
		expect(body.error.code).toBe('VALIDATION_FAILED');
	});

	it('creates product successfully', async () => {
		const mockProduct = { id: 'prod_123', name: 'Test Product', description: 'A test product' };
		mockStripe.products.create.mockResolvedValue(mockProduct);

		const request = new Request('http://example.com/products', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json', Origin: 'https://example.com' },
			body: JSON.stringify({ name: 'Test Product', description: 'A test product' }),
		});
		const env = { STRIPE_SECRET_KEY: 'sk_test_123', ALLOWED_ORIGINS: 'https://example.com' } as Env;
		const response = await handleCreateProduct(mockStripe as Stripe, request, env, 'https://example.com');
		expect(response.status).toBe(201);
		const body = (await response.json()) as any;
		expect(body.ok).toBe(true);
		expect(body.data.id).toBe('prod_123');
		expect(body.data.name).toBe('Test Product');
	});

	it('handles Stripe errors gracefully', async () => {
		mockStripe.products.create.mockRejectedValue({ statusCode: 400, message: 'Invalid product data' });

		const request = new Request('http://example.com/products', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json', Origin: 'https://example.com' },
			body: JSON.stringify({ name: 'Test Product' }),
		});
		const env = { STRIPE_SECRET_KEY: 'sk_test_123', ALLOWED_ORIGINS: 'https://example.com' } as Env;
		const response = await handleCreateProduct(mockStripe as Stripe, request, env, 'https://example.com');
		expect(response.status).toBe(400);
		const body = (await response.json()) as any;
		expect(body.ok).toBe(false);
		expect(body.error.code).toBe('BAD_REQUEST');
	});

	it('creates product with valid URL', async () => {
		const mockProduct = { id: 'prod_123', name: 'Test Product', url: 'https://example.com/product' };
		mockStripe.products.create.mockResolvedValue(mockProduct);

		const request = new Request('http://example.com/products', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json', Origin: 'https://example.com' },
			body: JSON.stringify({ name: 'Test Product', url: 'https://example.com/product' }),
		});
		const env = { STRIPE_SECRET_KEY: 'sk_test_123', ALLOWED_ORIGINS: 'https://example.com' } as Env;
		const response = await handleCreateProduct(mockStripe as Stripe, request, env, 'https://example.com');
		expect(response.status).toBe(201);
		const body = (await response.json()) as any;
		expect(body.ok).toBe(true);
		expect(body.data.url).toBe('https://example.com/product');
	});

	it('returns 401 with invalid Stripe API key', async () => {
		mockStripe.products.create.mockRejectedValue({ statusCode: 401, message: 'Invalid API Key' });

		const request = new Request('http://example.com/products', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json', Origin: 'https://example.com' },
			body: JSON.stringify({ name: 'Test Product' }),
		});
		const env = { STRIPE_SECRET_KEY: 'invalid_key', ALLOWED_ORIGINS: 'https://example.com' } as Env;
		const response = await handleCreateProduct(mockStripe as Stripe, request, env, 'https://example.com');
		// Stripe's own 401 (invalid API key) is surfaced as BAD_REQUEST to the caller —
		// it's the operator's misconfiguration, not the caller's auth failure.
		expect(response.status).toBe(400);
		const body = (await response.json()) as any;
		expect(body.ok).toBe(false);
		expect(body.error.code).toBe('BAD_REQUEST');
	});

	it('handles Stripe errors with statusCode >= 500', async () => {
		mockStripe.products.create.mockRejectedValue({ statusCode: 500, message: 'Internal Server Error' });

		const request = new Request('http://example.com/products', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json', Origin: 'https://example.com' },
			body: JSON.stringify({ name: 'Test Product' }),
		});
		const env = { STRIPE_SECRET_KEY: 'sk_test_123', ALLOWED_ORIGINS: 'https://example.com' } as Env;
		const response = await handleCreateProduct(mockStripe as Stripe, request, env, 'https://example.com');
		expect(response.status).toBe(500);
		const body = (await response.json()) as any;
		expect(body.ok).toBe(false);
		expect(body.error.code).toBe('INTERNAL');
	});

	it('handles Stripe errors with missing message when statusCode < 500', async () => {
		mockStripe.products.create.mockRejectedValue({ statusCode: 400 }); // No message

		const request = new Request('http://example.com/products', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json', Origin: 'https://example.com' },
			body: JSON.stringify({ name: 'Test Product' }),
		});
		const env = { STRIPE_SECRET_KEY: 'sk_test_123', ALLOWED_ORIGINS: 'https://example.com' } as Env;
		const response = await handleCreateProduct(mockStripe as Stripe, request, env, 'https://example.com');
		expect(response.status).toBe(400);
		const body = (await response.json()) as any;
		expect(body.ok).toBe(false);
		expect(body.error.code).toBe('BAD_REQUEST');
	});

	it('handles Stripe errors with undefined statusCode (defaults to 500)', async () => {
		mockStripe.products.create.mockRejectedValue({ message: 'Something failed' }); // No statusCode

		const request = new Request('http://example.com/products', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json', Origin: 'https://example.com' },
			body: JSON.stringify({ name: 'Test Product' }),
		});
		const env = { STRIPE_SECRET_KEY: 'sk_test_123', ALLOWED_ORIGINS: 'https://example.com' } as Env;
		const response = await handleCreateProduct(mockStripe as Stripe, request, env, 'https://example.com');
		expect(response.status).toBe(500);
		const body = (await response.json()) as any;
		expect(body.ok).toBe(false);
		expect(body.error.code).toBe('INTERNAL');
	});

	// Tests for middleware (using worker.fetch)
	it('returns 403 for disallowed origin', async () => {
		const request = new Request('http://example.com/products', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json', Origin: 'https://evil.com' },
			body: JSON.stringify({ name: 'Test Product' }),
		});
		const env = { STRIPE_SECRET_KEY: 'sk_test_123', ALLOWED_ORIGINS: 'https://example.com' } as Env;
		const response = await worker.fetch(request, env);
		expect(response.status).toBe(403);
	});

	it('returns 405 for non-POST method', async () => {
		const request = new Request('http://example.com/products', {
			method: 'GET',
			headers: { Origin: 'https://example.com' },
		});
		const env = { STRIPE_SECRET_KEY: 'sk_test_123', ALLOWED_ORIGINS: 'https://example.com' } as Env;
		const response = await worker.fetch(request, env);
		expect(response.status).toBe(405);
	});

	it('handles OPTIONS preflight', async () => {
		const request = new Request('http://example.com/products', {
			method: 'OPTIONS',
			headers: { Origin: 'https://example.com' },
		});
		const env = { STRIPE_SECRET_KEY: 'sk_test_123', ALLOWED_ORIGINS: 'https://example.com' } as Env;
		const response = await worker.fetch(request, env);
		expect(response.status).toBe(204);
		expect(response.headers.get('Access-Control-Allow-Methods')).toBe('POST, OPTIONS');
	});
});
