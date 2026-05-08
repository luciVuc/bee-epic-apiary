import { describe, it, expect, vi, beforeEach } from 'vitest';
import worker from '../../src/stripe/product/delete-product';
import { handleDeleteProduct } from '../../src/stripe/product/delete-product';
import Stripe from 'stripe';

describe('delete-product handler', () => {
	let mockStripe: any;
	let mockCacheDelete: any;

	beforeEach(() => {
		vi.restoreAllMocks();

		mockStripe = {
			products: {
				retrieve: vi.fn(),
				update: vi.fn(),
			},
			prices: {
				list: vi.fn(),
				update: vi.fn(),
			},
		};

		mockCacheDelete = vi.fn().mockResolvedValue(true);
		vi.spyOn(caches.default, 'delete').mockImplementation(mockCacheDelete);
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

	it('returns 404 when product not found', async () => {
		const error = { code: 'resource_missing', statusCode: 404, message: 'No such product' };
		mockStripe.products.retrieve.mockRejectedValue(error);

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

	it('returns 200 with message when product is already archived', async () => {
		const mockProduct = { id: 'prod_123', active: false, name: 'Test Product' };
		mockStripe.products.retrieve.mockResolvedValue(mockProduct);

		const request = new Request('http://example.com/products/prod_123', {
			method: 'DELETE',
			headers: { Origin: 'https://example.com' },
		});
		const env = { STRIPE_SECRET_KEY: 'sk_test_123', ALLOWED_ORIGINS: 'https://example.com' } as Env;
		const response = await handleDeleteProduct(mockStripe as Stripe, request, env, 'https://example.com');
		expect(response.status).toBe(200);
		const body = (await response.json()) as any;
		expect(body.message).toBe('Product was already archived');
		expect(body.product.active).toBe(false);
	});

	it('archives product and prices successfully', async () => {
		const mockProduct = { id: 'prod_123', active: true, name: 'Test Product', default_price: null };
		const mockArchivedProduct = { id: 'prod_123', active: false, name: 'Test Product' };
		mockStripe.products.retrieve.mockResolvedValue(mockProduct);
		mockStripe.products.update.mockResolvedValue(mockArchivedProduct);
		mockStripe.prices.list.mockResolvedValue({
			data: [
				{ id: 'price_1', active: true },
				{ id: 'price_2', active: true },
			],
		});
		mockStripe.prices.update.mockImplementation((id: string) => Promise.resolve({ id, active: false }));

		const request = new Request('http://example.com/products/prod_123', {
			method: 'DELETE',
			headers: { Origin: 'https://example.com' },
		});
		const env = { STRIPE_SECRET_KEY: 'sk_test_123', ALLOWED_ORIGINS: 'https://example.com' } as Env;
		const response = await handleDeleteProduct(mockStripe as Stripe, request, env, 'https://example.com');
		expect(response.status).toBe(200);
		const body = (await response.json()) as any;
		expect(body.archived_product.active).toBe(false);
		expect(body.archived_prices).toEqual(['price_1', 'price_2']);
		expect(body.archived_prices_count).toBe(2);
		expect(body.message).toBe('Product and associated prices archived successfully. To permanently delete, use the Stripe Dashboard.');
		// Verify cache was busted
		expect(mockCacheDelete).toHaveBeenCalled();
	});

	it('handles default price error when archiving prices', async () => {
		const mockProduct = { id: 'prod_123', active: true, name: 'Test Product', default_price: 'price_1' };
		const mockArchivedProduct = { id: 'prod_123', active: false, name: 'Test Product' };

		// First retrieve returns product with default price
		// After removing default price, second retrieve returns product without default price
		mockStripe.products.retrieve.mockResolvedValueOnce(mockProduct).mockResolvedValueOnce({ ...mockProduct, default_price: null });

		mockStripe.products.update.mockResolvedValue(mockArchivedProduct);

		mockStripe.prices.list.mockResolvedValue({
			data: [
				{ id: 'price_1', active: true },
				{ id: 'price_2', active: true },
			],
		});

		// First call to archive price_1 fails with default price error
		// Second call succeeds after removing default price
		mockStripe.prices.update
			.mockRejectedValueOnce({
				message: 'This price cannot be archived because it is the default price of its product.',
			})
			.mockImplementationOnce((id: string) => Promise.resolve({ id, active: false }))
			.mockImplementationOnce((id: string) => Promise.resolve({ id, active: false }));

		const request = new Request('http://example.com/products/prod_123', {
			method: 'DELETE',
			headers: { Origin: 'https://example.com' },
		});
		const env = { STRIPE_SECRET_KEY: 'sk_test_123', ALLOWED_ORIGINS: 'https://example.com' } as Env;
		const response = await handleDeleteProduct(mockStripe as Stripe, request, env, 'https://example.com');
		expect(response.status).toBe(200);
		const body = (await response.json()) as any;
		expect(body.archived_product.active).toBe(false);
		expect(body.archived_prices.length).toBeGreaterThan(0);
		// Verify cache was busted
		expect(mockCacheDelete).toHaveBeenCalled();
	});

	it('archives product with no active prices', async () => {
		const mockProduct = { id: 'prod_123', active: true, name: 'Test Product' };
		const mockArchivedProduct = { id: 'prod_123', active: false, name: 'Test Product' };
		mockStripe.products.retrieve.mockResolvedValue(mockProduct);
		mockStripe.products.update.mockResolvedValue(mockArchivedProduct);
		mockStripe.prices.list.mockResolvedValue({ data: [] });

		const request = new Request('http://example.com/products/prod_123', {
			method: 'DELETE',
			headers: { Origin: 'https://example.com' },
		});
		const env = { STRIPE_SECRET_KEY: 'sk_test_123', ALLOWED_ORIGINS: 'https://example.com' } as Env;
		const response = await handleDeleteProduct(mockStripe as Stripe, request, env, 'https://example.com');
		expect(response.status).toBe(200);
		const body = (await response.json()) as any;
		expect(body.archived_product.active).toBe(false);
		expect(body.archived_prices).toEqual([]);
		expect(body.archived_prices_count).toBe(0);
		expect(mockCacheDelete).toHaveBeenCalled();
	});

	it('handles Stripe errors gracefully during archiving', async () => {
		const mockProduct = { id: 'prod_123', active: true };
		mockStripe.products.retrieve.mockResolvedValue(mockProduct);
		mockStripe.prices.list.mockResolvedValue({ data: [] });
		mockStripe.products.update.mockRejectedValue({ statusCode: 500, message: 'Internal Server Error' });

		const request = new Request('http://example.com/products/prod_123', {
			method: 'DELETE',
			headers: { Origin: 'https://example.com' },
		});
		const env = { STRIPE_SECRET_KEY: 'sk_test_123', ALLOWED_ORIGINS: 'https://example.com' } as Env;
		const response = await handleDeleteProduct(mockStripe as Stripe, request, env, 'https://example.com');
		expect(response.status).toBe(500);
		const body = (await response.json()) as any;
		expect(body.error).toBe('An error occurred');
	});

	it('returns 401 with invalid Stripe API key', async () => {
		mockStripe.products.retrieve.mockRejectedValue({ statusCode: 401, message: 'Invalid API Key' });

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

	it('handles Stripe errors with statusCode >= 500', async () => {
		const mockProduct = { id: 'prod_123', active: true };
		mockStripe.products.retrieve.mockResolvedValue(mockProduct);
		mockStripe.prices.list.mockResolvedValue({ data: [] });
		mockStripe.products.update.mockRejectedValue({ statusCode: 500, message: 'Internal Server Error' });

		const request = new Request('http://example.com/products/prod_123', {
			method: 'DELETE',
			headers: { Origin: 'https://example.com' },
		});
		const env = { STRIPE_SECRET_KEY: 'sk_test_123', ALLOWED_ORIGINS: 'https://example.com' } as Env;
		const response = await handleDeleteProduct(mockStripe as Stripe, request, env, 'https://example.com');
		expect(response.status).toBe(500);
		const body = (await response.json()) as any;
		expect(body.error).toBe('An error occurred');
	});

	it('handles Stripe errors with missing message when statusCode < 500', async () => {
		const mockProduct = { id: 'prod_123', active: true };
		mockStripe.products.retrieve.mockResolvedValue(mockProduct);
		mockStripe.prices.list.mockResolvedValue({ data: [] });
		mockStripe.products.update.mockRejectedValue({ statusCode: 400 }); // No message

		const request = new Request('http://example.com/products/prod_123', {
			method: 'DELETE',
			headers: { Origin: 'https://example.com' },
		});
		const env = { STRIPE_SECRET_KEY: 'sk_test_123', ALLOWED_ORIGINS: 'https://example.com' } as Env;
		const response = await handleDeleteProduct(mockStripe as Stripe, request, env, 'https://example.com');
		expect(response.status).toBe(400);
		const body = (await response.json()) as any;
		expect(body.error).toBe('An error occurred');
	});

	it('handles Stripe errors with undefined statusCode (defaults to 500)', async () => {
		mockStripe.products.retrieve.mockRejectedValue({ message: 'Something failed' }); // No statusCode

		const request = new Request('http://example.com/products/prod_123', {
			method: 'DELETE',
			headers: { Origin: 'https://example.com' },
		});
		const env = { STRIPE_SECRET_KEY: 'sk_test_123', ALLOWED_ORIGINS: 'https://example.com' } as Env;
		const response = await handleDeleteProduct(mockStripe as Stripe, request, env, 'https://example.com');
		expect(response.status).toBe(500);
		const body = (await response.json()) as any;
		expect(body.error).toBe('An error occurred');
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
