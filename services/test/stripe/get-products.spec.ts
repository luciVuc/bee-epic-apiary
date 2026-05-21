import { describe, it, expect, vi, beforeEach } from 'vitest';
import worker from '../../src/stripe/product/get-products';
import { handleGetProducts } from '../../src/stripe/product/get-products';
import Stripe from 'stripe';

describe('get-products handler', () => {
	let mockStripe: any;

	beforeEach(() => {
		vi.restoreAllMocks();

		mockStripe = {
			products: {
				retrieve: vi.fn(),
				list: vi.fn(),
			},
		};
	});

	// Tests for business logic (using exported handler function with mocked Stripe)
	it('retrieves single active product successfully', async () => {
		const mockProduct = { id: 'prod_123', name: 'Test Product', active: true };
		mockStripe.products.retrieve.mockResolvedValue(mockProduct);

		const request = new Request('http://example.com/products/prod_123', {
			method: 'GET',
			headers: { Origin: 'https://example.com' },
		});
		const env = { STRIPE_SECRET_KEY: 'sk_test_123', ALLOWED_ORIGINS: 'https://example.com' } as Env;
		const response = await handleGetProducts(mockStripe as Stripe, request, env, 'https://example.com');
		expect(response.status).toBe(200);
		const body = (await response.json()) as any;
		expect(body.id).toBe('prod_123');
	});

	it('returns 404 for inactive product', async () => {
		const mockProduct = { id: 'prod_123', name: 'Test Product', active: false };
		mockStripe.products.retrieve.mockResolvedValue(mockProduct);

		const request = new Request('http://example.com/products/prod_123', {
			method: 'GET',
			headers: { Origin: 'https://example.com' },
		});
		const env = { STRIPE_SECRET_KEY: 'sk_test_123', ALLOWED_ORIGINS: 'https://example.com' } as Env;
		const response = await handleGetProducts(mockStripe as Stripe, request, env, 'https://example.com');
		expect(response.status).toBe(404);
		const body = (await response.json()) as any;
		expect(body.error).toBe('Product not found');
	});

	it('lists only active products', async () => {
		const mockProducts = {
			data: [
				{ id: 'prod_1', name: 'Product 1', active: true },
				{ id: 'prod_2', name: 'Product 2', active: true },
			],
		};
		mockStripe.products.list.mockResolvedValue(mockProducts);

		const request = new Request('http://example.com/products', {
			method: 'GET',
			headers: { Origin: 'https://example.com' },
		});
		const env = { STRIPE_SECRET_KEY: 'sk_test_123', ALLOWED_ORIGINS: 'https://example.com' } as Env;
		const response = await handleGetProducts(mockStripe as Stripe, request, env, 'https://example.com');
		expect(response.status).toBe(200);
		const body = (await response.json()) as any;
		expect(body.data).toHaveLength(2);
		// Verify that active: true was passed to stripe.products.list
		expect(mockStripe.products.list).toHaveBeenCalledWith(expect.objectContaining({ active: true }));
	});

	it('handles Stripe errors gracefully', async () => {
		mockStripe.products.retrieve.mockRejectedValue({ statusCode: 404, message: 'Product not found' });

		const request = new Request('http://example.com/products/prod_999', {
			method: 'GET',
			headers: { Origin: 'https://example.com' },
		});
		const env = { STRIPE_SECRET_KEY: 'sk_test_123', ALLOWED_ORIGINS: 'https://example.com' } as Env;
		const response = await handleGetProducts(mockStripe as Stripe, request, env, 'https://example.com');
		expect(response.status).toBe(404);
		const body = (await response.json()) as any;
		expect(body.error).toBe('Product not found');
	});

	it('handles errors without statusCode', async () => {
		mockStripe.products.retrieve.mockRejectedValue(new Error('Something went wrong'));

		const request = new Request('http://example.com/products/prod_123', {
			method: 'GET',
			headers: { Origin: 'https://example.com' },
		});
		const env = { STRIPE_SECRET_KEY: 'sk_test_123', ALLOWED_ORIGINS: 'https://example.com' } as Env;
		const response = await handleGetProducts(mockStripe as Stripe, request, env, 'https://example.com');
		expect(response.status).toBe(500);
		const body = (await response.json()) as any;
		expect(body.error).toBe('An error occurred');
	});

	it('returns 401 with invalid Stripe API key for single product', async () => {
		mockStripe.products.retrieve.mockRejectedValue({ statusCode: 401, message: 'Invalid API Key' });

		const request = new Request('http://example.com/products/prod_123', {
			method: 'GET',
			headers: { Origin: 'https://example.com' },
		});
		const env = { STRIPE_SECRET_KEY: 'invalid_key', ALLOWED_ORIGINS: 'https://example.com' } as Env;
		const response = await handleGetProducts(mockStripe as Stripe, request, env, 'https://example.com');
		expect(response.status).toBe(401);
		const body = (await response.json()) as any;
		expect(body.error).toBe('Invalid API Key');
	});

	it('returns 401 with invalid Stripe API key for list', async () => {
		mockStripe.products.list.mockRejectedValue({ statusCode: 401, message: 'Invalid API Key' });

		const request = new Request('http://example.com/products', {
			method: 'GET',
			headers: { Origin: 'https://example.com' },
		});
		const env = { STRIPE_SECRET_KEY: 'invalid_key', ALLOWED_ORIGINS: 'https://example.com' } as Env;
		const response = await handleGetProducts(mockStripe as Stripe, request, env, 'https://example.com');
		expect(response.status).toBe(401);
		const body = (await response.json()) as any;
		expect(body.error).toBe('Invalid API Key');
	});

	it('handles Stripe errors with statusCode >= 500 for single product', async () => {
		mockStripe.products.retrieve.mockRejectedValue({ statusCode: 500, message: 'Internal Server Error' });

		const request = new Request('http://example.com/products/prod_123', {
			method: 'GET',
			headers: { Origin: 'https://example.com' },
		});
		const env = { STRIPE_SECRET_KEY: 'sk_test_123', ALLOWED_ORIGINS: 'https://example.com' } as Env;
		const response = await handleGetProducts(mockStripe as Stripe, request, env, 'https://example.com');
		expect(response.status).toBe(500);
		const body = (await response.json()) as any;
		expect(body.error).toBe('An error occurred');
	});

	it('handles Stripe errors with missing message when statusCode < 500', async () => {
		mockStripe.products.retrieve.mockRejectedValue({ statusCode: 404 }); // No message

		const request = new Request('http://example.com/products/prod_999', {
			method: 'GET',
			headers: { Origin: 'https://example.com' },
		});
		const env = { STRIPE_SECRET_KEY: 'sk_test_123', ALLOWED_ORIGINS: 'https://example.com' } as Env;
		const response = await handleGetProducts(mockStripe as Stripe, request, env, 'https://example.com');
		expect(response.status).toBe(404);
		const body = (await response.json()) as any;
		expect(body.error).toBe('An error occurred');
	});

	// Tests for middleware (using worker.fetch)
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

	it('handles OPTIONS preflight for products list', async () => {
		const request = new Request('http://example.com/products', {
			method: 'OPTIONS',
			headers: { Origin: 'https://example.com' },
		});
		const env = { STRIPE_SECRET_KEY: 'sk_test_123', ALLOWED_ORIGINS: 'https://example.com' } as Env;
		const response = await worker.fetch(request, env);
		expect(response.status).toBe(204);
		expect(response.headers.get('Access-Control-Allow-Methods')).toBe('GET, OPTIONS');
	});

	it('handles OPTIONS preflight for single product', async () => {
		const request = new Request('http://example.com/products/prod_123', {
			method: 'OPTIONS',
			headers: { Origin: 'https://example.com' },
		});
		const env = { STRIPE_SECRET_KEY: 'sk_test_123', ALLOWED_ORIGINS: 'https://example.com' } as Env;
		const response = await worker.fetch(request, env);
		expect(response.status).toBe(204);
		expect(response.headers.get('Access-Control-Allow-Methods')).toBe('GET, OPTIONS');
	});

	it('lists products with starting_after parameter', async () => {
		mockStripe.products.list.mockResolvedValue({
			data: [{ id: 'prod_2', name: 'Product 2', active: true }],
			has_more: false,
		});

		const request = new Request('http://example.com/products?starting_after=prod_1&limit=1', {
			method: 'GET',
			headers: { Origin: 'https://example.com' },
		});
		const env = { STRIPE_SECRET_KEY: 'sk_test_123', ALLOWED_ORIGINS: 'https://example.com' } as Env;
		const response = await handleGetProducts(mockStripe as Stripe, request, env, 'https://example.com');
		expect(response.status).toBe(200);
		expect(mockStripe.products.list).toHaveBeenCalledWith(expect.objectContaining({ starting_after: 'prod_1', limit: 1 }));
	});

	it('lists products with expand parameter', async () => {
		mockStripe.products.list.mockResolvedValue({
			data: [{ id: 'prod_1', name: 'Product 1', active: true }],
			has_more: false,
		});

		const request = new Request('http://example.com/products?expand[]=default_price', {
			method: 'GET',
			headers: { Origin: 'https://example.com' },
		});
		const env = { STRIPE_SECRET_KEY: 'sk_test_123', ALLOWED_ORIGINS: 'https://example.com' } as Env;
		const response = await handleGetProducts(mockStripe as Stripe, request, env, 'https://example.com');
		expect(response.status).toBe(200);
		expect(mockStripe.products.list).toHaveBeenCalledWith(expect.objectContaining({ expand: ['default_price'] }));
	});

	it('retrieves single product with expand parameter', async () => {
		const mockProduct = { id: 'prod_123', name: 'Test Product', active: true };
		mockStripe.products.retrieve.mockResolvedValue(mockProduct);

		const request = new Request('http://example.com/products/prod_123?expand[]=default_price', {
			method: 'GET',
			headers: { Origin: 'https://example.com' },
		});
		const env = { STRIPE_SECRET_KEY: 'sk_test_123', ALLOWED_ORIGINS: 'https://example.com' } as Env;
		const response = await handleGetProducts(mockStripe as Stripe, request, env, 'https://example.com');
		expect(response.status).toBe(200);
		expect(mockStripe.products.retrieve).toHaveBeenCalledWith('prod_123', expect.objectContaining({ expand: ['default_price'] }));
	});

	it('filters products by search term', async () => {
		const allProducts = [
			{ id: 'prod_1', name: 'Wildflower Honey', active: true, description: null, metadata: {} },
			{ id: 'prod_2', name: 'Beeswax Candles', active: true, description: null, metadata: {} },
		];
		mockStripe.products.list.mockResolvedValue({ data: allProducts, has_more: false });

		const request = new Request('http://example.com/products?search=Honey', {
			method: 'GET',
			headers: { Origin: 'https://example.com' },
		});
		const env = { STRIPE_SECRET_KEY: 'sk_test_123', ALLOWED_ORIGINS: 'https://example.com' } as Env;
		const response = await handleGetProducts(mockStripe as Stripe, request, env, 'https://example.com');
		expect(response.status).toBe(200);
		const body = (await response.json()) as any;
		expect(body.data).toHaveLength(1);
		expect(body.data[0].name).toBe('Wildflower Honey');
	});

	it('filters products by category', async () => {
		const allProducts = [
			{ id: 'prod_1', name: 'Honey', active: true, description: null, metadata: { category: 'HONEY' } },
			{ id: 'prod_2', name: 'Candles', active: true, description: null, metadata: { category: 'BEESWAX' } },
		];
		mockStripe.products.list.mockResolvedValue({ data: allProducts, has_more: false });

		const request = new Request('http://example.com/products?category=HONEY', {
			method: 'GET',
			headers: { Origin: 'https://example.com' },
		});
		const env = { STRIPE_SECRET_KEY: 'sk_test_123', ALLOWED_ORIGINS: 'https://example.com' } as Env;
		const response = await handleGetProducts(mockStripe as Stripe, request, env, 'https://example.com');
		expect(response.status).toBe(200);
		const body = (await response.json()) as any;
		expect(body.data).toHaveLength(1);
		expect(body.data[0].name).toBe('Honey');
	});

	it('handles error when fetching all products for total_count', async () => {
		mockStripe.products.list
			.mockResolvedValueOnce({ data: [{ id: 'prod_1', name: 'Product 1', active: true }], has_more: false })
			.mockRejectedValueOnce(new Error('Network error'));

		const request = new Request('http://example.com/products?limit=1', {
			method: 'GET',
			headers: { Origin: 'https://example.com' },
		});
		const env = { STRIPE_SECRET_KEY: 'sk_test_123', ALLOWED_ORIGINS: 'https://example.com' } as Env;
		const response = await handleGetProducts(mockStripe as Stripe, request, env, 'https://example.com');
		expect(response.status).toBe(200);
		const body = (await response.json()) as any;
		expect(body.total_count).toBe(1);
		expect(body.data).toHaveLength(1);
	});
});
