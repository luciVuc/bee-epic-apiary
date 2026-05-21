import { describe, it, expect, vi, beforeEach } from 'vitest';
import worker from '../../src/stripe/product/get-products-count';
import { handleGetProductsCount } from '../../src/stripe/product/get-products-count';
import Stripe from 'stripe';

describe('get-products-count handler', () => {
	let mockStripe: any;

	beforeEach(() => {
		vi.restoreAllMocks();

		mockStripe = {
			products: {
				list: vi.fn(),
			},
		};
	});

	it('returns total count of active products successfully', async () => {
		// Mock first page of products
		mockStripe.products.list.mockResolvedValueOnce({
			data: [
				{ id: 'prod_1', name: 'Product 1' },
				{ id: 'prod_2', name: 'Product 2' },
			],
			has_more: false,
		});

		const request = new Request('http://example.com/products/count', {
			method: 'GET',
			headers: { Origin: 'https://example.com' },
		});
		const env = { STRIPE_SECRET_KEY: 'sk_test_123', ALLOWED_ORIGINS: 'https://example.com' } as Env;
		const response = await handleGetProductsCount(mockStripe as Stripe, request, env, 'https://example.com');
		expect(response.status).toBe(200);
		const body = (await response.json()) as any;
		expect(body.total).toBe(2);
	});

	it('handles pagination and returns correct total count', async () => {
		// Mock first page
		mockStripe.products.list.mockResolvedValueOnce({
			data: [
				{ id: 'prod_1', name: 'Product 1' },
				{ id: 'prod_2', name: 'Product 2' },
			],
			has_more: true,
		});

		// Mock second page
		mockStripe.products.list.mockResolvedValueOnce({
			data: [{ id: 'prod_3', name: 'Product 3' }],
			has_more: false,
		});

		const request = new Request('http://example.com/products/count', {
			method: 'GET',
			headers: { Origin: 'https://example.com' },
		});
		const env = { STRIPE_SECRET_KEY: 'sk_test_123', ALLOWED_ORIGINS: 'https://example.com' } as Env;
		const response = await handleGetProductsCount(mockStripe as Stripe, request, env, 'https://example.com');
		expect(response.status).toBe(200);
		const body = (await response.json()) as any;
		expect(body.total).toBe(3);
	});

	it('returns 0 when no products exist', async () => {
		mockStripe.products.list.mockResolvedValue({
			data: [],
			has_more: false,
		});

		const request = new Request('http://example.com/products/count', {
			method: 'GET',
			headers: { Origin: 'https://example.com' },
		});
		const env = { STRIPE_SECRET_KEY: 'sk_test_123', ALLOWED_ORIGINS: 'https://example.com' } as Env;
		const response = await handleGetProductsCount(mockStripe as Stripe, request, env, 'https://example.com');
		expect(response.status).toBe(200);
		const body = (await response.json()) as any;
		expect(body.total).toBe(0);
	});

	it('handles Stripe errors gracefully', async () => {
		mockStripe.products.list.mockRejectedValue({ statusCode: 401, message: 'Invalid API Key' });

		const request = new Request('http://example.com/products/count', {
			method: 'GET',
			headers: { Origin: 'https://example.com' },
		});
		const env = { STRIPE_SECRET_KEY: 'invalid_key', ALLOWED_ORIGINS: 'https://example.com' } as Env;
		const response = await handleGetProductsCount(mockStripe as Stripe, request, env, 'https://example.com');
		expect(response.status).toBe(401);
		const body = (await response.json()) as any;
		expect(body.error).toBe('Invalid API Key');
	});

	it('handles errors without statusCode', async () => {
		mockStripe.products.list.mockRejectedValue(new Error('Something went wrong'));

		const request = new Request('http://example.com/products/count', {
			method: 'GET',
			headers: { Origin: 'https://example.com' },
		});
		const env = { STRIPE_SECRET_KEY: 'sk_test_123', ALLOWED_ORIGINS: 'https://example.com' } as Env;
		const response = await handleGetProductsCount(mockStripe as Stripe, request, env, 'https://example.com');
		expect(response.status).toBe(500);
		const body = (await response.json()) as any;
		expect(body.error).toBe('An error occurred');
	});

	it('handles errors with statusCode < 500 and no message', async () => {
		mockStripe.products.list.mockRejectedValue({ statusCode: 400 }); // No message property

		const request = new Request('http://example.com/products/count', {
			method: 'GET',
			headers: { Origin: 'https://example.com' },
		});
		const env = { STRIPE_SECRET_KEY: 'sk_test_123', ALLOWED_ORIGINS: 'https://example.com' } as Env;
		const response = await handleGetProductsCount(mockStripe as Stripe, request, env, 'https://example.com');
		expect(response.status).toBe(400);
		const body = (await response.json()) as any;
		expect(body.error).toBe('An error occurred');
	});

	it('returns 405 for non-GET methods', async () => {
		const request = new Request('http://example.com/products/count', {
			method: 'POST',
			headers: { Origin: 'https://example.com' },
		});
		const env = { STRIPE_SECRET_KEY: 'sk_test_123', ALLOWED_ORIGINS: 'https://example.com' } as Env;
		const response = await worker.fetch(request, env);
		expect(response.status).toBe(405);
	});

	it('filters count by search term', async () => {
		const allProducts = [
			{ id: 'prod_1', name: 'Wildflower Honey', active: true, description: null, metadata: {} },
			{ id: 'prod_2', name: 'Beeswax Candles', active: true, description: null, metadata: {} },
		];
		mockStripe.products.list.mockResolvedValue({ data: allProducts, has_more: false });

		const request = new Request('http://example.com/products/count?search=Honey', {
			method: 'GET',
			headers: { Origin: 'https://example.com' },
		});
		const env = { STRIPE_SECRET_KEY: 'sk_test_123', ALLOWED_ORIGINS: 'https://example.com' } as Env;
		const response = await handleGetProductsCount(mockStripe as Stripe, request, env, 'https://example.com');
		expect(response.status).toBe(200);
		const body = (await response.json()) as any;
		expect(body.total).toBe(1);
	});

	it('filters count by category', async () => {
		const allProducts = [
			{ id: 'prod_1', name: 'Honey', active: true, description: null, metadata: { category: 'HONEY' } },
			{ id: 'prod_2', name: 'Candles', active: true, description: null, metadata: { category: 'BEESWAX' } },
		];
		mockStripe.products.list.mockResolvedValue({ data: allProducts, has_more: false });

		const request = new Request('http://example.com/products/count?category=HONEY', {
			method: 'GET',
			headers: { Origin: 'https://example.com' },
		});
		const env = { STRIPE_SECRET_KEY: 'sk_test_123', ALLOWED_ORIGINS: 'https://example.com' } as Env;
		const response = await handleGetProductsCount(mockStripe as Stripe, request, env, 'https://example.com');
		expect(response.status).toBe(200);
		const body = (await response.json()) as any;
		expect(body.total).toBe(1);
	});

	it('counts all products when category is ALL', async () => {
		const allProducts = [
			{ id: 'prod_1', name: 'Honey', active: true, description: null, metadata: { category: 'HONEY' } },
			{ id: 'prod_2', name: 'Candles', active: true, description: null, metadata: { category: 'BEESWAX' } },
		];
		mockStripe.products.list.mockResolvedValue({ data: allProducts, has_more: false });

		const request = new Request('http://example.com/products/count?category=ALL', {
			method: 'GET',
			headers: { Origin: 'https://example.com' },
		});
		const env = { STRIPE_SECRET_KEY: 'sk_test_123', ALLOWED_ORIGINS: 'https://example.com' } as Env;
		const response = await handleGetProductsCount(mockStripe as Stripe, request, env, 'https://example.com');
		expect(response.status).toBe(200);
		const body = (await response.json()) as any;
		expect(body.total).toBe(2);
	});
});
