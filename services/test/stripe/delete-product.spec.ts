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
				retrieve: vi.fn(),
				update: vi.fn(),
				del: vi.fn(),
			},
			prices: {
				list: vi.fn(),
				update: vi.fn(),
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
		expect(body.ok).toBe(false);
		expect(body.error.code).toBe('VALIDATION_FAILED');
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
		expect(body.ok).toBe(false);
		expect(body.error.code).toBe('NOT_FOUND');
	});

	it('permanently deletes a product when Stripe allows it', async () => {
		mockStripe.products.retrieve.mockResolvedValue({ id: 'prod_123', active: true, name: 'Test Product' });
		mockStripe.products.del.mockResolvedValue({ id: 'prod_123', deleted: true });

		const request = new Request('http://example.com/products/prod_123', {
			method: 'DELETE',
			headers: { Origin: 'https://example.com' },
		});
		const env = { STRIPE_SECRET_KEY: 'sk_test_123', ALLOWED_ORIGINS: 'https://example.com' } as Env;
		const response = await handleDeleteProduct(mockStripe as Stripe, request, env, 'https://example.com');
		expect(response.status).toBe(200);
		const body = (await response.json()) as any;
		expect(body.ok).toBe(true);
		expect(body.data.deleted).toBe(true);
		expect(body.data.archived).toBe(false);
		expect(body.data.id).toBe('prod_123');
		expect(mockStripe.products.del).toHaveBeenCalledWith('prod_123');
		// No archiving should have occurred.
		expect(mockStripe.products.update).not.toHaveBeenCalled();
	});

	it('returns 404 when delete reports the product is already gone', async () => {
		mockStripe.products.retrieve.mockResolvedValue({ id: 'prod_123', active: true, name: 'Test Product' });
		mockStripe.products.del.mockRejectedValue({ code: 'resource_missing', statusCode: 404, message: 'No such product' });

		const request = new Request('http://example.com/products/prod_123', {
			method: 'DELETE',
			headers: { Origin: 'https://example.com' },
		});
		const env = { STRIPE_SECRET_KEY: 'sk_test_123', ALLOWED_ORIGINS: 'https://example.com' } as Env;
		const response = await handleDeleteProduct(mockStripe as Stripe, request, env, 'https://example.com');
		expect(response.status).toBe(404);
		const body = (await response.json()) as any;
		expect(body.error.code).toBe('NOT_FOUND');
	});

	it('falls back to archiving when Stripe refuses to delete (has price history)', async () => {
		mockStripe.products.retrieve.mockResolvedValue({ id: 'prod_123', active: true, name: 'Test Product', default_price: null });
		mockStripe.products.del.mockRejectedValue({
			code: 'invalid_request_error',
			statusCode: 400,
			message: 'You cannot delete a product that has prices associated with it.',
		});
		mockStripe.products.update.mockResolvedValue({ id: 'prod_123', active: false, name: 'Test Product' });
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
		expect(body.ok).toBe(true);
		expect(body.data.deleted).toBe(false);
		expect(body.data.archived).toBe(true);
		expect(body.data.archived_product.active).toBe(false);
		expect(body.data.archived_prices).toEqual(['price_1', 'price_2']);
		expect(body.data.archived_prices_count).toBe(2);
	});

	it('short-circuits to archived response when an already-archived product cannot be deleted', async () => {
		mockStripe.products.retrieve.mockResolvedValue({ id: 'prod_123', active: false, name: 'Test Product' });
		mockStripe.products.del.mockRejectedValue({
			code: 'invalid_request_error',
			statusCode: 400,
			message: 'You cannot delete a product that has prices associated with it.',
		});

		const request = new Request('http://example.com/products/prod_123', {
			method: 'DELETE',
			headers: { Origin: 'https://example.com' },
		});
		const env = { STRIPE_SECRET_KEY: 'sk_test_123', ALLOWED_ORIGINS: 'https://example.com' } as Env;
		const response = await handleDeleteProduct(mockStripe as Stripe, request, env, 'https://example.com');
		expect(response.status).toBe(200);
		const body = (await response.json()) as any;
		expect(body.ok).toBe(true);
		expect(body.data.deleted).toBe(false);
		expect(body.data.archived).toBe(true);
		expect(body.data.message).toBe('Product was already archived');
		// Should not attempt to archive prices again.
		expect(mockStripe.prices.list).not.toHaveBeenCalled();
	});

	it('fires product-deleted notification on permanent delete', async () => {
		mockStripe.products.retrieve.mockResolvedValue({ id: 'prod_123', active: true, name: 'Test' });
		mockStripe.products.del.mockResolvedValue({ id: 'prod_123', deleted: true });

		const mockNotify = vi.fn().mockResolvedValue(undefined);
		const mockNotificationHub = { getByName: vi.fn().mockReturnValue({ notify: mockNotify }) };

		const request = new Request('http://example.com/products/prod_123', {
			method: 'DELETE',
			headers: { Origin: 'https://example.com' },
		});
		const env = {
			STRIPE_SECRET_KEY: 'sk_test_123',
			ALLOWED_ORIGINS: 'https://example.com',
			NOTIFICATION_HUB: mockNotificationHub,
		} as unknown as Env;
		const response = await handleDeleteProduct(mockStripe as Stripe, request, env, 'https://example.com');
		expect(response.status).toBe(200);
		expect(mockNotificationHub.getByName).toHaveBeenCalledWith('default');
		expect(mockNotify).toHaveBeenCalledWith({ type: 'product-deleted', productId: 'prod_123' });
	});

	it('fires product-deleted notification on archive fallback', async () => {
		mockStripe.products.retrieve.mockResolvedValue({ id: 'prod_123', active: true, name: 'Test', default_price: null });
		mockStripe.products.del.mockRejectedValue({ code: 'invalid_request_error', statusCode: 400, message: 'has prices' });
		mockStripe.products.update.mockResolvedValue({ id: 'prod_123', active: false, name: 'Test' });
		mockStripe.prices.list.mockResolvedValue({ data: [] });

		const mockNotify = vi.fn().mockResolvedValue(undefined);
		const mockNotificationHub = { getByName: vi.fn().mockReturnValue({ notify: mockNotify }) };

		const request = new Request('http://example.com/products/prod_123', {
			method: 'DELETE',
			headers: { Origin: 'https://example.com' },
		});
		const env = {
			STRIPE_SECRET_KEY: 'sk_test_123',
			ALLOWED_ORIGINS: 'https://example.com',
			NOTIFICATION_HUB: mockNotificationHub,
		} as unknown as Env;
		const response = await handleDeleteProduct(mockStripe as Stripe, request, env, 'https://example.com');
		expect(response.status).toBe(200);
		expect(mockNotify).toHaveBeenCalledWith({ type: 'product-deleted', productId: 'prod_123' });
	});

	it('swallows product-deleted notification failure', async () => {
		mockStripe.products.retrieve.mockResolvedValue({ id: 'prod_123', active: true, name: 'Test' });
		mockStripe.products.del.mockResolvedValue({ id: 'prod_123', deleted: true });

		const mockNotify = vi.fn().mockRejectedValue(new Error('DO offline'));
		const mockNotificationHub = { getByName: vi.fn().mockReturnValue({ notify: mockNotify }) };

		const request = new Request('http://example.com/products/prod_123', {
			method: 'DELETE',
			headers: { Origin: 'https://example.com' },
		});
		const env = {
			STRIPE_SECRET_KEY: 'sk_test_123',
			ALLOWED_ORIGINS: 'https://example.com',
			NOTIFICATION_HUB: mockNotificationHub,
		} as unknown as Env;
		const response = await handleDeleteProduct(mockStripe as Stripe, request, env, 'https://example.com');
		expect(response.status).toBe(200);
		expect(mockNotify).toHaveBeenCalled();
	});

	it('handles default price error when archiving prices during fallback', async () => {
		const mockProduct = { id: 'prod_123', active: true, name: 'Test Product', default_price: 'price_1' };
		mockStripe.products.retrieve.mockResolvedValue(mockProduct);
		mockStripe.products.del.mockRejectedValue({ code: 'invalid_request_error', statusCode: 400, message: 'has prices' });
		mockStripe.products.update.mockResolvedValue({ id: 'prod_123', active: false, name: 'Test Product' });

		mockStripe.prices.list.mockResolvedValue({
			data: [
				{ id: 'price_1', active: true },
				{ id: 'price_2', active: true },
			],
		});

		// First call to archive price_1 fails with default price error;
		// after clearing default_price, retries succeed.
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
		expect(body.ok).toBe(true);
		expect(body.data.archived).toBe(true);
		expect(body.data.archived_product.active).toBe(false);
		expect(body.data.archived_prices.length).toBeGreaterThan(0);
	});

	it('archives product with no active prices during fallback', async () => {
		const mockProduct = { id: 'prod_123', active: true, name: 'Test Product', default_price: null };
		mockStripe.products.retrieve.mockResolvedValue(mockProduct);
		mockStripe.products.del.mockRejectedValue({ code: 'invalid_request_error', statusCode: 400, message: 'has prices' });
		mockStripe.products.update.mockResolvedValue({ id: 'prod_123', active: false, name: 'Test Product' });
		mockStripe.prices.list.mockResolvedValue({ data: [] });

		const request = new Request('http://example.com/products/prod_123', {
			method: 'DELETE',
			headers: { Origin: 'https://example.com' },
		});
		const env = { STRIPE_SECRET_KEY: 'sk_test_123', ALLOWED_ORIGINS: 'https://example.com' } as Env;
		const response = await handleDeleteProduct(mockStripe as Stripe, request, env, 'https://example.com');
		expect(response.status).toBe(200);
		const body = (await response.json()) as any;
		expect(body.ok).toBe(true);
		expect(body.data.archived).toBe(true);
		expect(body.data.archived_product.active).toBe(false);
		expect(body.data.archived_prices).toEqual([]);
		expect(body.data.archived_prices_count).toBe(0);
	});

	it('surfaces Stripe errors from the archive fallback', async () => {
		mockStripe.products.retrieve.mockResolvedValue({ id: 'prod_123', active: true, default_price: null });
		mockStripe.products.del.mockRejectedValue({ code: 'invalid_request_error', statusCode: 400, message: 'has prices' });
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
		expect(body.ok).toBe(false);
		expect(body.error.code).toBe('INTERNAL');
	});

	it('returns 401-mapped error with invalid Stripe API key', async () => {
		mockStripe.products.retrieve.mockRejectedValue({ statusCode: 401, message: 'Invalid API Key' });

		const request = new Request('http://example.com/products/prod_123', {
			method: 'DELETE',
			headers: { Origin: 'https://example.com' },
		});
		const env = { STRIPE_SECRET_KEY: 'invalid_key', ALLOWED_ORIGINS: 'https://example.com' } as Env;
		const response = await handleDeleteProduct(mockStripe as Stripe, request, env, 'https://example.com');
		expect(response.status).toBe(400);
		const body = (await response.json()) as any;
		expect(body.ok).toBe(false);
		expect(body.error.code).toBe('BAD_REQUEST');
	});

	it('re-throws price archiving error that is not about default price', async () => {
		const mockProduct = { id: 'prod_123', active: true, name: 'Test Product', default_price: null };
		mockStripe.products.retrieve.mockResolvedValue(mockProduct);
		mockStripe.products.del.mockRejectedValue({ code: 'invalid_request_error', statusCode: 400, message: 'has prices' });
		mockStripe.products.update.mockResolvedValue({ id: 'prod_123', active: false, name: 'Test Product' });
		mockStripe.prices.list.mockResolvedValue({
			data: [{ id: 'price_1', active: true }],
		});
		mockStripe.prices.update.mockRejectedValue({ message: 'Some other Stripe error', statusCode: 400 });

		const request = new Request('http://example.com/products/prod_123', {
			method: 'DELETE',
			headers: { Origin: 'https://example.com' },
		});
		const env = { STRIPE_SECRET_KEY: 'sk_test_123', ALLOWED_ORIGINS: 'https://example.com' } as Env;
		const response = await handleDeleteProduct(mockStripe as Stripe, request, env, 'https://example.com');
		expect(response.status).toBe(400);
		const body = (await response.json()) as any;
		expect(body.ok).toBe(false);
		expect(body.error.code).toBe('BAD_REQUEST');
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
