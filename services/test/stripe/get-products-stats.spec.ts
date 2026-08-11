import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
	aggregateProductStats,
	handleGetProductsStats,
	invalidateProductStatsCache,
	PRODUCT_STATS_CACHE_KEY,
} from '../../src/stripe/product/get-products-stats';
import Stripe from 'stripe';

/**
 * The /products/stats endpoint is the server-side replacement for the
 * dashboard's `fetchProducts({ limit: 100 })` + in-memory aggregation
 * (review I12). Tests cover the pure aggregator, the KV cache happy and
 * miss paths, and the invalidation hook called from product CUD.
 */
describe('aggregateProductStats', () => {
	it('counts totalProducts as the array length', () => {
		const stats = aggregateProductStats([
			{ id: 'p1', metadata: {} } as any,
			{ id: 'p2', metadata: {} } as any,
			{ id: 'p3', metadata: {} } as any,
		]);
		expect(stats.totalProducts).toBe(3);
	});

	it('treats metadata.inStock !== "false" as in stock (default behaviour)', () => {
		const stats = aggregateProductStats([
			{ id: 'p1', metadata: {} } as any,
			{ id: 'p2', metadata: { inStock: 'true' } } as any,
			{ id: 'p3', metadata: { inStock: 'false' } } as any,
			{ id: 'p4', metadata: { inStock: '' } } as any,
		]);
		expect(stats.inStock).toBe(3); // p3 is the only out-of-stock
	});

	it('counts metadata.featured === "true" exactly', () => {
		const stats = aggregateProductStats([
			{ id: 'p1', metadata: { featured: 'true' } } as any,
			{ id: 'p2', metadata: { featured: 'false' } } as any,
			{ id: 'p3', metadata: {} } as any,
			{ id: 'p4', metadata: { featured: 'TRUE' } } as any, // strict — only lowercase 'true' counts
		]);
		expect(stats.featured).toBe(1);
	});

	it('groups by metadata.category, defaulting to UNCATEGORIZED', () => {
		const stats = aggregateProductStats([
			{ id: 'p1', metadata: { category: 'HONEY' } } as any,
			{ id: 'p2', metadata: { category: 'HONEY' } } as any,
			{ id: 'p3', metadata: { category: 'BEESWAX' } } as any,
			{ id: 'p4', metadata: {} } as any,
		]);
		expect(stats.byCategory).toEqual({ HONEY: 2, BEESWAX: 1, UNCATEGORIZED: 1 });
	});

	it('returns zeros for an empty array', () => {
		expect(aggregateProductStats([])).toEqual({
			totalProducts: 0,
			inStock: 0,
			featured: 0,
			byCategory: {},
		});
	});
});

describe('handleGetProductsStats', () => {
	let mockStripe: any;
	let mockKv: { get: ReturnType<typeof vi.fn>; put: ReturnType<typeof vi.fn>; delete: ReturnType<typeof vi.fn> };

	beforeEach(() => {
		vi.restoreAllMocks();
		mockStripe = {
			products: {
				list: vi.fn(),
			},
		};
		mockKv = {
			get: vi.fn().mockResolvedValue(null),
			put: vi.fn().mockResolvedValue(undefined),
			delete: vi.fn().mockResolvedValue(undefined),
		};
	});

	function makeEnv(overrides: Partial<Env> = {}): Env {
		return {
			STRIPE_SECRET_KEY: 'sk_test_123',
			ALLOWED_ORIGINS: 'https://example.com',
			CONTENT_KV: mockKv,
			...overrides,
		} as unknown as Env;
	}

	it('serves stats from KV when warm (no Stripe call)', async () => {
		const cached = { totalProducts: 7, inStock: 5, featured: 2, byCategory: { HONEY: 5 } };
		mockKv.get.mockResolvedValueOnce(JSON.stringify(cached));
		const request = new Request('http://example.com/products/stats', { method: 'GET' });
		const response = await handleGetProductsStats(mockStripe as Stripe, request, makeEnv(), 'https://example.com');
		expect(response.status).toBe(200);
		const body = (await response.json()) as any;
		expect(body.ok).toBe(true);
		expect(body.data).toEqual(cached);
		expect(mockStripe.products.list).not.toHaveBeenCalled();
	});

	it('rebuilds and writes to KV on cache miss', async () => {
		mockKv.get.mockResolvedValueOnce(null);
		mockStripe.products.list.mockResolvedValueOnce({
			data: [
				{ id: 'p1', metadata: { category: 'HONEY', featured: 'true' } },
				{ id: 'p2', metadata: { category: 'BEESWAX', inStock: 'false' } },
			],
			has_more: false,
		});
		const request = new Request('http://example.com/products/stats', { method: 'GET' });
		const response = await handleGetProductsStats(mockStripe as Stripe, request, makeEnv(), 'https://example.com');
		expect(response.status).toBe(200);
		const body = (await response.json()) as any;
		expect(body.data.totalProducts).toBe(2);
		expect(body.data.inStock).toBe(1);
		expect(body.data.featured).toBe(1);
		expect(body.data.byCategory).toEqual({ HONEY: 1, BEESWAX: 1 });
		// Cached for the next request.
		expect(mockKv.put).toHaveBeenCalledWith(PRODUCT_STATS_CACHE_KEY, expect.any(String), expect.objectContaining({ expirationTtl: 120 }));
	});

	it('treats malformed cached JSON as a miss and recomputes', async () => {
		mockKv.get.mockResolvedValueOnce('{not json');
		mockStripe.products.list.mockResolvedValueOnce({ data: [], has_more: false });
		const request = new Request('http://example.com/products/stats', { method: 'GET' });
		const response = await handleGetProductsStats(mockStripe as Stripe, request, makeEnv(), 'https://example.com');
		expect(response.status).toBe(200);
		expect(mockStripe.products.list).toHaveBeenCalled();
	});

	it('tolerates a missing CONTENT_KV binding (live walk every time)', async () => {
		mockStripe.products.list.mockResolvedValueOnce({ data: [], has_more: false });
		const env = makeEnv({ CONTENT_KV: undefined as unknown as KVNamespace });
		const request = new Request('http://example.com/products/stats', { method: 'GET' });
		const response = await handleGetProductsStats(mockStripe as Stripe, request, env, 'https://example.com');
		expect(response.status).toBe(200);
	});

	it('returns a Stripe error envelope when the API fails', async () => {
		mockStripe.products.list.mockRejectedValueOnce({ statusCode: 500, message: 'Stripe down' });
		const request = new Request('http://example.com/products/stats', { method: 'GET' });
		const response = await handleGetProductsStats(mockStripe as Stripe, request, makeEnv(), 'https://example.com');
		expect(response.status).toBe(500);
		const body = (await response.json()) as any;
		expect(body.ok).toBe(false);
		expect(body.error.code).toBe('INTERNAL');
	});
});

describe('invalidateProductStatsCache', () => {
	it('deletes the cache key when KV is available', async () => {
		const del = vi.fn().mockResolvedValue(undefined);
		const env = {
			CONTENT_KV: { delete: del } as unknown as KVNamespace,
		} as Env;
		await invalidateProductStatsCache(env);
		expect(del).toHaveBeenCalledWith(PRODUCT_STATS_CACHE_KEY);
	});

	it('is a no-op when CONTENT_KV is absent', async () => {
		const env = { CONTENT_KV: undefined } as unknown as Env;
		await expect(invalidateProductStatsCache(env)).resolves.toBeUndefined();
	});

	it('swallows KV errors without throwing (cache-staleness is preferable to a 500 on the CUD path)', async () => {
		const env = {
			CONTENT_KV: {
				delete: vi.fn().mockRejectedValue(new Error('KV unreachable')),
			} as unknown as KVNamespace,
		} as Env;
		await expect(invalidateProductStatsCache(env)).resolves.toBeUndefined();
	});
});
