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
		expect(body.ok).toBe(false);
		expect(body.error.code).toBe('VALIDATION_FAILED');
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
		expect(body.ok).toBe(false);
		expect(body.error.code).toBe('VALIDATION_FAILED');
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
		expect(body.ok).toBe(false);
		expect(body.error.code).toBe('VALIDATION_FAILED');
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
		expect(body.ok).toBe(false);
		expect(body.error.code).toBe('VALIDATION_FAILED');
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
		expect(body.ok).toBe(true);
		expect(body.data.id).toBe('prod_123');
		expect(body.data.name).toBe('Updated Product');
	});

	it('fires product-updated notification on successful update', async () => {
		mockStripe.products.update.mockResolvedValue({ id: 'prod_123', name: 'Updated' });

		const mockNotify = vi.fn().mockResolvedValue(undefined);
		const mockNotificationHub = { getByName: vi.fn().mockReturnValue({ notify: mockNotify }) };

		const request = new Request('http://example.com/products/prod_123', {
			method: 'PUT',
			headers: { 'Content-Type': 'application/json', Origin: 'https://example.com' },
			body: JSON.stringify({ name: 'Updated' }),
		});
		const env = {
			STRIPE_SECRET_KEY: 'sk_test_123',
			ALLOWED_ORIGINS: 'https://example.com',
			NOTIFICATION_HUB: mockNotificationHub,
		} as unknown as Env;
		const response = await handleUpdateProduct(mockStripe as Stripe, request, env, 'https://example.com');
		expect(response.status).toBe(200);
		expect(mockNotificationHub.getByName).toHaveBeenCalledWith('default');
		expect(mockNotify).toHaveBeenCalledWith({ type: 'product-updated', productId: 'prod_123' });
	});

	it('swallows product-updated notification failure', async () => {
		mockStripe.products.update.mockResolvedValue({ id: 'prod_123', name: 'Updated' });

		const mockNotify = vi.fn().mockRejectedValue(new Error('DO offline'));
		const mockNotificationHub = { getByName: vi.fn().mockReturnValue({ notify: mockNotify }) };

		const request = new Request('http://example.com/products/prod_123', {
			method: 'PUT',
			headers: { 'Content-Type': 'application/json', Origin: 'https://example.com' },
			body: JSON.stringify({ name: 'Updated' }),
		});
		const env = {
			STRIPE_SECRET_KEY: 'sk_test_123',
			ALLOWED_ORIGINS: 'https://example.com',
			NOTIFICATION_HUB: mockNotificationHub,
		} as unknown as Env;
		const response = await handleUpdateProduct(mockStripe as Stripe, request, env, 'https://example.com');
		expect(response.status).toBe(200);
		expect(mockNotify).toHaveBeenCalled();
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
		expect(body.ok).toBe(false);
		expect(body.error.code).toBe('NOT_FOUND');
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
		expect(body.ok).toBe(true);
		expect(body.data.url).toBe('https://example.com/product');
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
		expect(response.status).toBe(400);
		const body = (await response.json()) as any;
		expect(body.ok).toBe(false);
		expect(body.error.code).toBe('BAD_REQUEST');
	});

	it('handles Stripe errors with statusCode >= 500', async () => {
		mockStripe.products.update.mockRejectedValue({ statusCode: 500, message: 'Internal Server Error' });

		const request = new Request('http://example.com/products/prod_123', {
			method: 'PUT',
			headers: { 'Content-Type': 'application/json', Origin: 'https://example.com' },
			body: JSON.stringify({ name: 'Updated Product' }),
		});
		const env = { STRIPE_SECRET_KEY: 'sk_test_123', ALLOWED_ORIGINS: 'https://example.com' } as Env;
		const response = await handleUpdateProduct(mockStripe as Stripe, request, env, 'https://example.com');
		expect(response.status).toBe(500);
		const body = (await response.json()) as any;
		expect(body.ok).toBe(false);
		expect(body.error.code).toBe('INTERNAL');
	});

	it('handles Stripe errors with missing message when statusCode < 500', async () => {
		mockStripe.products.update.mockRejectedValue({ statusCode: 400 }); // No message

		const request = new Request('http://example.com/products/prod_123', {
			method: 'PUT',
			headers: { 'Content-Type': 'application/json', Origin: 'https://example.com' },
			body: JSON.stringify({ name: 'Updated Product' }),
		});
		const env = { STRIPE_SECRET_KEY: 'sk_test_123', ALLOWED_ORIGINS: 'https://example.com' } as Env;
		const response = await handleUpdateProduct(mockStripe as Stripe, request, env, 'https://example.com');
		expect(response.status).toBe(400);
		const body = (await response.json()) as any;
		expect(body.ok).toBe(false);
		expect(body.error.code).toBe('BAD_REQUEST');
	});

	it('handles Stripe errors with undefined statusCode (defaults to 500)', async () => {
		mockStripe.products.update.mockRejectedValue({ message: 'Something failed' }); // No statusCode

		const request = new Request('http://example.com/products/prod_123', {
			method: 'PUT',
			headers: { 'Content-Type': 'application/json', Origin: 'https://example.com' },
			body: JSON.stringify({ name: 'Updated Product' }),
		});
		const env = { STRIPE_SECRET_KEY: 'sk_test_123', ALLOWED_ORIGINS: 'https://example.com' } as Env;
		const response = await handleUpdateProduct(mockStripe as Stripe, request, env, 'https://example.com');
		expect(response.status).toBe(500);
		const body = (await response.json()) as any;
		expect(body.ok).toBe(false);
		expect(body.error.code).toBe('INTERNAL');
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

	describe('Zod body validation (review I14)', () => {
		// Strict-mode Zod schemas reject unknown fields so a future Stripe API
		// addition can't be smuggled through this endpoint without a deliberate
		// code change.

		it('rejects unknown fields with VALIDATION_FAILED', async () => {
			const request = new Request('http://example.com/products/prod_x', {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json', Origin: 'https://example.com' },
				body: JSON.stringify({ name: 'OK', shippable: true }), // shippable is not allow-listed
			});
			const env = { STRIPE_SECRET_KEY: 'sk_test_123', ALLOWED_ORIGINS: 'https://example.com' } as Env;
			const response = await handleUpdateProduct(mockStripe as Stripe, request, env, 'https://example.com');
			expect(response.status).toBe(400);
			const body = (await response.json()) as { ok: boolean; error: { code: string } };
			expect(body.ok).toBe(false);
			expect(body.error.code).toBe('VALIDATION_FAILED');
		});

		it('rejects default_price that is not a Stripe Price id', async () => {
			const request = new Request('http://example.com/products/prod_x', {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json', Origin: 'https://example.com' },
				body: JSON.stringify({ default_price: 'not_a_price_id' }),
			});
			const env = { STRIPE_SECRET_KEY: 'sk_test_123', ALLOWED_ORIGINS: 'https://example.com' } as Env;
			const response = await handleUpdateProduct(mockStripe as Stripe, request, env, 'https://example.com');
			expect(response.status).toBe(400);
		});

		it('rejects images array longer than 8 (Stripe limit)', async () => {
			const tooMany = Array.from({ length: 9 }, (_, i) => `https://example.com/img/${i}.jpg`);
			const request = new Request('http://example.com/products/prod_x', {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json', Origin: 'https://example.com' },
				body: JSON.stringify({ images: tooMany }),
			});
			const env = { STRIPE_SECRET_KEY: 'sk_test_123', ALLOWED_ORIGINS: 'https://example.com' } as Env;
			const response = await handleUpdateProduct(mockStripe as Stripe, request, env, 'https://example.com');
			expect(response.status).toBe(400);
		});

		it('accepts a valid allow-listed update payload', async () => {
			mockStripe.products.update.mockResolvedValueOnce({ id: 'prod_x', name: 'New name' });
			const env = {
				STRIPE_SECRET_KEY: 'sk_test_123',
				ALLOWED_ORIGINS: 'https://example.com',
				NOTIFICATION_HUB: { getByName: () => ({ notify: vi.fn() }) },
			} as unknown as Env;
			const request = new Request('http://example.com/products/prod_x', {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json', Origin: 'https://example.com' },
				body: JSON.stringify({ name: 'New name', active: true, metadata: { category: 'HONEY' } }),
			});
			const response = await handleUpdateProduct(mockStripe as Stripe, request, env, 'https://example.com');
			expect(response.status).toBe(200);
		});
	});
});
