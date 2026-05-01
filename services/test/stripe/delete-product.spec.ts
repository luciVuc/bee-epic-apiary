import { describe, it, expect, vi, beforeEach } from 'vitest';
import worker from '../../src/stripe/product/delete-product';
import { handleDeleteProduct } from '../../src/stripe/product/delete-product';
import Stripe from 'stripe';

describe('delete-product handler', () => {
	let mockStripe: any;

	beforeEach(() => {
		vi.restoreAllMocks();

		mockStripe = {
			products: {
				del: vi.fn(),
			},
		};
	});

	// Tests for business logic (using exported handler function with mocked Stripe)
	it('returns 400 for missing product ID', async () => {
		const request = new Request('http://example.com/products/', {
			method: 'DELETE',
			headers: { Origin: 'https://example.com' },
		});
		const env = { STRIPE_SECRET_KEY: 'sk_test_123', ALLOWED_ORIGINS: 'https://example.com' } as Env;
		const response = await handleDeleteProduct(mockStripe as Stripe, request, env, 'https://example.com');
		expect(response.status).toBe(400);
		const body = (await response.json()) as any;
		expect(body.error).toBe('Product ID is required');
	});

	it('deletes product successfully', async () => {
		const mockDeleted = { id: 'prod_123', deleted: true };
		mockStripe.products.del.mockResolvedValue(mockDeleted);

		const request = new Request('http://example.com/products/prod_123', {
			method: 'DELETE',
			headers: { Origin: 'https://example.com' },
		});
		const env = { STRIPE_SECRET_KEY: 'sk_test_123', ALLOWED_ORIGINS: 'https://example.com' } as Env;
		const response = await handleDeleteProduct(mockStripe as Stripe, request, env, 'https://example.com');
		expect(response.status).toBe(200);
		const body = (await response.json()) as any;
		expect(body.deleted).toBe(true);
	});

	it('handles Stripe errors gracefully', async () => {
		mockStripe.products.del.mockRejectedValue({ statusCode: 404, message: 'Product not found' });

		const request = new Request('http://example.com/products/prod_999', {
			method: 'DELETE',
			headers: { Origin: 'https://example.com' },
		});
		const env = { STRIPE_SECRET_KEY: 'sk_test_123', ALLOWED_ORIGINS: 'https://example.com' } as Env;
		const response = await handleDeleteProduct(mockStripe as Stripe, request, env, 'https://example.com');
		expect(response.status).toBe(404);
		const body = (await response.json()) as any;
		expect(body.error).toBe('Product not found');
	});

	it('returns 401 with invalid Stripe API key', async () => {
		mockStripe.products.del.mockRejectedValue({ statusCode: 401, message: 'Invalid API Key' });

		const request = new Request('http://example.com/products/prod_123', {
			method: 'DELETE',
			headers: { Origin: 'https://example.com' },
		});
		const env = { STRIPE_SECRET_KEY: 'invalid_key', ALLOWED_ORIGINS: 'https://example.com' } as Env;
		const response = await handleDeleteProduct(mockStripe as Stripe, request, env, 'https://example.com');
		expect(response.status).toBe(401);
		const body = (await response.json()) as any;
		expect(body.error).toBe('Invalid API Key');
	});

	// Tests for middleware (using worker.fetch)
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

	it('handles OPTIONS preflight', async () => {
		const request = new Request('http://example.com/products/prod_123', {
			method: 'OPTIONS',
			headers: { Origin: 'https://example.com' },
		});
		const env = { STRIPE_SECRET_KEY: 'sk_test_123', ALLOWED_ORIGINS: 'https://example.com' } as Env;
		const response = await worker.fetch(request, env);
		expect(response.status).toBe(204);
		expect(response.headers.get('Access-Control-Allow-Methods')).toBe('DELETE, OPTIONS');
	});
});
