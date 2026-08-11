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
				search: vi.fn(),
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
		expect(body.ok).toBe(true);
		expect(body.data.id).toBe('prod_123');
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
		expect(body.ok).toBe(false);
		expect(body.error.code).toBe('NOT_FOUND');
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
		expect(body.ok).toBe(true);
		expect(body.data.data).toHaveLength(2);
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
		expect(body.ok).toBe(false);
		expect(body.error.code).toBe('NOT_FOUND');
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
		expect(body.ok).toBe(false);
		expect(body.error.code).toBe('INTERNAL');
	});

	it('returns 401 with invalid Stripe API key for single product', async () => {
		mockStripe.products.retrieve.mockRejectedValue({ statusCode: 401, message: 'Invalid API Key' });

		const request = new Request('http://example.com/products/prod_123', {
			method: 'GET',
			headers: { Origin: 'https://example.com' },
		});
		const env = { STRIPE_SECRET_KEY: 'invalid_key', ALLOWED_ORIGINS: 'https://example.com' } as Env;
		const response = await handleGetProducts(mockStripe as Stripe, request, env, 'https://example.com');
		expect(response.status).toBe(400);
		const body = (await response.json()) as any;
		expect(body.ok).toBe(false);
		expect(body.error.code).toBe('BAD_REQUEST');
	});

	it('returns 401 with invalid Stripe API key for list', async () => {
		mockStripe.products.list.mockRejectedValue({ statusCode: 401, message: 'Invalid API Key' });

		const request = new Request('http://example.com/products', {
			method: 'GET',
			headers: { Origin: 'https://example.com' },
		});
		const env = { STRIPE_SECRET_KEY: 'invalid_key', ALLOWED_ORIGINS: 'https://example.com' } as Env;
		const response = await handleGetProducts(mockStripe as Stripe, request, env, 'https://example.com');
		expect(response.status).toBe(400);
		const body = (await response.json()) as any;
		expect(body.ok).toBe(false);
		expect(body.error.code).toBe('BAD_REQUEST');
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
		expect(body.ok).toBe(false);
		expect(body.error.code).toBe('INTERNAL');
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
		expect(body.ok).toBe(false);
		expect(body.error.code).toBe('NOT_FOUND');
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

	it('normalizes list-form expand (data.default_price) to default_price for prod_ retrieve', async () => {
		const mockProduct = { id: 'prod_123', name: 'Test Product', active: true };
		mockStripe.products.retrieve.mockResolvedValue(mockProduct);

		// The storefront sends the list-form expand path for both list and single fetches.
		// products.retrieve returns a bare object (no `data` wrapper), so Stripe 400s on
		// `data.default_price`. The handler must strip the `data.` prefix for retrieve.
		const request = new Request('http://example.com/products/prod_123?expand[]=data.default_price', {
			method: 'GET',
			headers: { Origin: 'https://example.com' },
		});
		const env = { STRIPE_SECRET_KEY: 'sk_test_123', ALLOWED_ORIGINS: 'https://example.com' } as Env;
		const response = await handleGetProducts(mockStripe as Stripe, request, env, 'https://example.com');
		expect(response.status).toBe(200);
		expect(mockStripe.products.retrieve).toHaveBeenCalledWith('prod_123', expect.objectContaining({ expand: ['default_price'] }));
	});

	it('keeps list-form expand (data.default_price) for slug-based search', async () => {
		mockStripe.products.search.mockResolvedValue({
			data: [{ id: 'prod_123', name: 'Test Product', active: true }],
		});

		// A slug (non prod_) routes to products.search, which returns a list envelope,
		// so the `data.` prefix is correct and must be preserved.
		const request = new Request('http://example.com/products/wildflower-honey?expand[]=data.default_price', {
			method: 'GET',
			headers: { Origin: 'https://example.com' },
		});
		const env = { STRIPE_SECRET_KEY: 'sk_test_123', ALLOWED_ORIGINS: 'https://example.com' } as Env;
		const response = await handleGetProducts(mockStripe as Stripe, request, env, 'https://example.com');
		expect(response.status).toBe(200);
		expect(mockStripe.products.search).toHaveBeenCalledWith(expect.objectContaining({ expand: ['data.default_price'] }));
	});

	it('adds data. prefix to bare expand (default_price) for slug-based search', async () => {
		mockStripe.products.search.mockResolvedValue({
			data: [{ id: 'prod_123', name: 'Test Product', active: true }],
		});

		// The storefront sends the retrieve-form `default_price`; the search path returns
		// a list envelope, so the handler must add the `data.` prefix.
		const request = new Request('http://example.com/products/wildflower-honey?expand[]=default_price', {
			method: 'GET',
			headers: { Origin: 'https://example.com' },
		});
		const env = { STRIPE_SECRET_KEY: 'sk_test_123', ALLOWED_ORIGINS: 'https://example.com' } as Env;
		const response = await handleGetProducts(mockStripe as Stripe, request, env, 'https://example.com');
		expect(response.status).toBe(200);
		expect(mockStripe.products.search).toHaveBeenCalledWith(expect.objectContaining({ expand: ['data.default_price'] }));
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
		expect(body.ok).toBe(true);
		expect(body.data.data).toHaveLength(1);
		expect(body.data.data[0].name).toBe('Wildflower Honey');
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
		expect(body.ok).toBe(true);
		expect(body.data.data).toHaveLength(1);
		expect(body.data.data[0].name).toBe('Honey');
	});

	it('filters products by tag', async () => {
		const allProducts = [
			{ id: 'prod_1', name: 'Organic Honey', active: true, description: null, metadata: { tags: 'organic,raw' } },
			{ id: 'prod_2', name: 'Candles', active: true, description: null, metadata: { tags: 'gift' } },
		];
		mockStripe.products.list.mockResolvedValue({ data: allProducts, has_more: false });

		const request = new Request('http://example.com/products?tag=organic', {
			method: 'GET',
			headers: { Origin: 'https://example.com' },
		});
		const env = { STRIPE_SECRET_KEY: 'sk_test_123', ALLOWED_ORIGINS: 'https://example.com' } as Env;
		const response = await handleGetProducts(mockStripe as Stripe, request, env, 'https://example.com');
		expect(response.status).toBe(200);
		const body = (await response.json()) as any;
		expect(body.ok).toBe(true);
		expect(body.data.data).toHaveLength(1);
		expect(body.data.data[0].name).toBe('Organic Honey');
		expect(body.data.total_count).toBe(1);
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
		expect(body.ok).toBe(true);
		expect(body.data.total_count).toBe(1);
		expect(body.data.data).toHaveLength(1);
	});

	describe('total_count caching for the unfiltered path (review I4)', () => {
		// Without a cache, every unfiltered /products page hit re-walks every product
		// page to compute total_count. KV at 120s TTL turns N+1 traffic into amortized 1+1.

		function makeKv() {
			const store = new Map<string, string>();
			return {
				get: vi.fn(async (k: string) => store.get(k) ?? null),
				put: vi.fn(async (k: string, v: string) => {
					store.set(k, v);
				}),
				delete: vi.fn(async (k: string) => {
					store.delete(k);
				}),
			};
		}

		it('serves cached total_count from KV on the second unfiltered call without re-fetching all products', async () => {
			const kv = makeKv();
			// First call: stripe.list returns one page; then fetchAllActiveProducts walks
			// the full list (also via stripe.products.list, no starting_after).
			mockStripe.products.list.mockResolvedValueOnce({ data: [{ id: 'prod_1', active: true }], has_more: false }).mockResolvedValueOnce({
				data: [
					{ id: 'prod_1', active: true },
					{ id: 'prod_2', active: true },
					{ id: 'prod_3', active: true },
				],
				has_more: false,
			});

			const env = {
				STRIPE_SECRET_KEY: 'sk_test_123',
				ALLOWED_ORIGINS: 'https://example.com',
				CONTENT_KV: kv as unknown as KVNamespace,
			} as Env;

			const req1 = new Request('http://example.com/products?limit=1', {
				method: 'GET',
				headers: { Origin: 'https://example.com' },
			});
			const r1 = await handleGetProducts(mockStripe as Stripe, req1, env, 'https://example.com');
			expect(r1.status).toBe(200);
			const b1 = (await r1.json()) as any;
			expect(b1.data.total_count).toBe(3);
			expect(kv.put).toHaveBeenCalledWith('products:count:v1', '3', expect.objectContaining({ expirationTtl: 120 }));

			// Second call: only the page list is hit; the full-fetch must NOT happen.
			mockStripe.products.list.mockResolvedValueOnce({ data: [{ id: 'prod_1', active: true }], has_more: false });
			const callsBefore = mockStripe.products.list.mock.calls.length;

			const req2 = new Request('http://example.com/products?limit=1', {
				method: 'GET',
				headers: { Origin: 'https://example.com' },
			});
			const r2 = await handleGetProducts(mockStripe as Stripe, req2, env, 'https://example.com');
			expect(r2.status).toBe(200);
			const b2 = (await r2.json()) as any;
			expect(b2.data.total_count).toBe(3);
			// Exactly one additional list call (the page fetch) — no full-walk.
			expect(mockStripe.products.list.mock.calls.length).toBe(callsBefore + 1);
		});

		it('skips the cache entirely when filters are present (filtered path already has the exact count for free)', async () => {
			const kv = makeKv();
			mockStripe.products.list.mockResolvedValue({
				data: [{ id: 'prod_1', name: 'Honey', active: true, description: null, metadata: { category: 'HONEY' } }],
				has_more: false,
			});

			const env = {
				STRIPE_SECRET_KEY: 'sk_test_123',
				ALLOWED_ORIGINS: 'https://example.com',
				CONTENT_KV: kv as unknown as KVNamespace,
			} as Env;
			const req = new Request('http://example.com/products?category=HONEY', {
				method: 'GET',
				headers: { Origin: 'https://example.com' },
			});
			const res = await handleGetProducts(mockStripe as Stripe, req, env, 'https://example.com');
			expect(res.status).toBe(200);
			const body = (await res.json()) as any;
			expect(body.data.total_count).toBe(1);
			// Filtered branch must not touch the unfiltered-count cache (no read or write).
			expect(kv.get).not.toHaveBeenCalled();
			expect(kv.put).not.toHaveBeenCalled();
		});

		it('continues to work when CONTENT_KV is unavailable (graceful degradation)', async () => {
			// Worker envs may transiently lose KV access; we fall back to the previous
			// double-fetch rather than 500ing.
			mockStripe.products.list
				.mockResolvedValueOnce({ data: [{ id: 'prod_1', active: true }], has_more: false })
				.mockResolvedValueOnce({ data: [{ id: 'prod_1', active: true }], has_more: false });

			const env = { STRIPE_SECRET_KEY: 'sk_test_123', ALLOWED_ORIGINS: 'https://example.com' } as Env;
			const req = new Request('http://example.com/products?limit=1', {
				method: 'GET',
				headers: { Origin: 'https://example.com' },
			});
			const res = await handleGetProducts(mockStripe as Stripe, req, env, 'https://example.com');
			expect(res.status).toBe(200);
			const body = (await res.json()) as any;
			expect(body.data.total_count).toBe(1);
		});
	});
});
