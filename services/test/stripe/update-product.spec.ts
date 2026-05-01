import { describe, it, expect, vi, beforeEach } from 'vitest';
import worker from '../../src/stripe/product/update-product';
import { handleUpdateProduct } from '../../src/stripe/product/update-product';
import Stripe from 'stripe';

describe('update-product handler', () => {
	let mockStripe: any;

	beforeEach(() => {
		vi.restoreAllMocks();

		mockStripe = {
			products: {
				update: vi.fn(),
			},
		};
	});

	// Tests for business logic (using exported handler function with mocked Stripe)
	it('returns 400 for missing product ID', async () => {
		const request = new Request('http://example.com/products/', {
			method: 'PUT',
			headers: { 'Content-Type': 'application/json', Origin: 'https://example.com' },
			body: JSON.stringify({ name: 'Updated' }),
		});
		const env = { STRIPE_SECRET_KEY: 'sk_test_123', ALLOWED_ORIGINS: 'https://example.com' } as Env;
		const response = await handleUpdateProduct(mockStripe as Stripe, request, env, 'https://example.com');
		expect(response.status).toBe(400);
		const body = (await response.json()) as any;
		expect(body.error).toBe('Product ID is required');
	});

	it('returns 400 for empty update data', async () => {
		const request = new Request('http://example.com/products/prod_123', {
			method: 'PUT',
			headers: { 'Content-Type': 'application/json', Origin: 'https://example.com' },
			body: JSON.stringify({}),
		});
		const env = { STRIPE_SECRET_KEY: 'sk_test_123', ALLOWED_ORIGINS: 'https://example.com' } as Env;
		const response = await handleUpdateProduct(mockStripe as Stripe, request, env, 'https://example.com');
		expect(response.status).toBe(400);
		const body = (await response.json()) as any;
		expect(body.error).toBe('No update data provided');
	});

	it('returns 400 for invalid product URL', async () => {
		const request = new Request('http://example.com/products/prod_123', {
			method: 'PUT',
			headers: { 'Content-Type': 'application/json', Origin: 'https://example.com' },
			body: JSON.stringify({ name: 'Updated', url: 'invalid-url' }),
		});
		const env = { STRIPE_SECRET_KEY: 'sk_test_123', ALLOWED_ORIGINS: 'https://example.com' } as Env;
		const response = await handleUpdateProduct(mockStripe as Stripe, request, env, 'https://example.com');
		expect(response.status).toBe(400);
		const body = (await response.json()) as any;
		expect(body.error).toBe('Invalid product URL');
	});

	it('returns 400 for invalid image URL', async () => {
		const request = new Request('http://example.com/products/prod_123', {
			method: 'PUT',
			headers: { 'Content-Type': 'application/json', Origin: 'https://example.com' },
			body: JSON.stringify({
				name: 'Updated',
				images: ['https://valid.com/img.png', 'invalid-url'],
			}),
		});
		const env = { STRIPE_SECRET_KEY: 'sk_test_123', ALLOWED_ORIGINS: 'https://example.com' } as Env;
		const response = await handleUpdateProduct(mockStripe as Stripe, request, env, 'https://example.com');
		expect(response.status).toBe(400);
		const body = (await response.json()) as any;
		expect(body.error).toContain('Invalid image URL');
	});

	it('updates product successfully', async () => {
		const mockProduct = { id: 'prod_123', name: 'Updated Product' };
		mockStripe.products.update.mockResolvedValue(mockProduct);

		const request = new Request('http://example.com/products/prod_123', {
			method: 'PUT',
			headers: { 'Content-Type': 'application/json', Origin: 'https://example.com' },
			body: JSON.stringify({ name: 'Updated Product' }),
		});
		const env = { STRIPE_SECRET_KEY: 'sk_test_123', ALLOWED_ORIGINS: 'https://example.com' } as Env;
		const response = await handleUpdateProduct(mockStripe as Stripe, request, env, 'https://example.com');
		expect(response.status).toBe(200);
		const body = (await response.json()) as any;
		expect(body.id).toBe('prod_123');
		expect(body.name).toBe('Updated Product');
	});

	it('handles Stripe errors gracefully', async () => {
		mockStripe.products.update.mockRejectedValue({ statusCode: 404, message: 'Product not found' });

		const request = new Request('http://example.com/products/prod_999', {
			method: 'PUT',
			headers: { 'Content-Type': 'application/json', Origin: 'https://example.com' },
			body: JSON.stringify({ name: 'Updated' }),
		});
		const env = { STRIPE_SECRET_KEY: 'sk_test_123', ALLOWED_ORIGINS: 'https://example.com' } as Env;
		const response = await handleUpdateProduct(mockStripe as Stripe, request, env, 'https://example.com');
		expect(response.status).toBe(404);
		const body = (await response.json()) as any;
		expect(body.error).toBe('Product not found');
	});

	it('updates product with valid URL', async () => {
		const mockProduct = { id: 'prod_123', name: 'Updated Product', url: 'https://example.com/product' };
		mockStripe.products.update.mockResolvedValue(mockProduct);

		const request = new Request('http://example.com/products/prod_123', {
			method: 'PUT',
			headers: { 'Content-Type': 'application/json', Origin: 'https://example.com' },
			body: JSON.stringify({ name: 'Updated Product', url: 'https://example.com/product' }),
		});
		const env = { STRIPE_SECRET_KEY: 'sk_test_123', ALLOWED_ORIGINS: 'https://example.com' } as Env;
		const response = await handleUpdateProduct(mockStripe as Stripe, request, env, 'https://example.com');
		expect(response.status).toBe(200);
		const body = (await response.json()) as any;
		expect(body.url).toBe('https://example.com/product');
	});

	it('returns 401 with invalid Stripe API key', async () => {
		mockStripe.products.update.mockRejectedValue({ statusCode: 401, message: 'Invalid API Key' });

		const request = new Request('http://example.com/products/prod_123', {
			method: 'PUT',
			headers: { 'Content-Type': 'application/json', Origin: 'https://example.com' },
			body: JSON.stringify({ name: 'Updated Product' }),
		});
		const env = { STRIPE_SECRET_KEY: 'invalid_key', ALLOWED_ORIGINS: 'https://example.com' } as Env;
		const response = await handleUpdateProduct(mockStripe as Stripe, request, env, 'https://example.com');
		expect(response.status).toBe(401);
		const body = (await response.json()) as any;
		expect(body.error).toBe('Invalid API Key');
	});

	// Tests for middleware (using worker.fetch)
	it('returns 403 for disallowed origin', async () => {
		const request = new Request('http://example.com/products/prod_123', {
			method: 'PUT',
			headers: { 'Content-Type': 'application/json', Origin: 'https://evil.com' },
			body: JSON.stringify({ name: 'Updated' }),
		});
		const env = { STRIPE_SECRET_KEY: 'sk_test_123', ALLOWED_ORIGINS: 'https://example.com' } as Env;
		const response = await worker.fetch(request, env);
		expect(response.status).toBe(403);
	});

	it('returns 405 for non-PUT method', async () => {
		const request = new Request('http://example.com/products/prod_123', {
			method: 'POST',
			headers: { Origin: 'https://example.com' },
		});
		const env = { STRIPE_SECRET_KEY: 'sk_test_123', ALLOWED_ORIGINS: 'https://example.com' } as Env;
		const response = await worker.fetch(request, env);
		expect(response.status).toBe(405);
	});

	it('handles OPTIONS preflight', async () => {
		const request = new Request('http://example.com/products/prod_123', {
			method: 'OPTIONS',
			headers: { Origin: 'https://example.com' },
		});
		const env = { STRIPE_SECRET_KEY: 'sk_test_123', ALLOWED_ORIGINS: 'https://example.com' } as Env;
		const response = await worker.fetch(request, env);
		expect(response.status).toBe(204);
		expect(response.headers.get('Access-Control-Allow-Methods')).toBe('PUT, OPTIONS');
	});
});
