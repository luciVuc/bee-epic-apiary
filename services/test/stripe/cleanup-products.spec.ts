import { describe, it, expect, vi, beforeEach } from 'vitest';
import worker from '../../src/stripe/product/cleanup-products';
import { handleCleanupProducts } from '../../src/stripe/product/cleanup-products';
import Stripe from 'stripe';

describe('cleanup-products handler', () => {
	let mockStripe: any;

	beforeEach(() => {
		vi.restoreAllMocks();

		mockStripe = {
			products: {
				list: vi.fn(),
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

	/** Helper: one page of products (has_more=false). */
	function singlePage(products: any[]) {
		mockStripe.products.list.mockResolvedValue({ data: products, has_more: false });
	}

	it('dry-run returns un-priced candidates only, deletes nothing', async () => {
		singlePage([
			{ id: 'prod_priced', name: 'Real Honey', default_price: { id: 'price_1' } },
			{ id: 'prod_junk1', name: 'Test Product', default_price: null },
			{ id: 'prod_junk2', name: 'myproduct', default_price: null },
		]);

		const request = new Request('http://example.com/products/cleanup?dryRun=true', {
			method: 'POST',
			headers: { Origin: 'https://example.com' },
		});
		const env = { STRIPE_SECRET_KEY: 'sk_test_123', ALLOWED_ORIGINS: 'https://example.com' } as Env;
		const response = await handleCleanupProducts(mockStripe as Stripe, request, env, 'https://example.com');
		expect(response.status).toBe(200);
		const body = (await response.json()) as any;
		expect(body.ok).toBe(true);
		expect(body.data.dry_run).toBe(true);
		expect(body.data.count).toBe(2);
		expect(body.data.candidates).toEqual([
			{ id: 'prod_junk1', name: 'Test Product' },
			{ id: 'prod_junk2', name: 'myproduct' },
		]);
		expect(mockStripe.products.del).not.toHaveBeenCalled();
	});

	it('apply deletes un-priced products and leaves priced ones untouched', async () => {
		singlePage([
			{ id: 'prod_priced', name: 'Real Honey', default_price: { id: 'price_1' } },
			{ id: 'prod_junk1', name: 'Test Product', default_price: null },
			{ id: 'prod_junk2', name: 'myproduct', default_price: null },
		]);
		mockStripe.products.del.mockImplementation((id: string) => Promise.resolve({ id, deleted: true }));

		const request = new Request('http://example.com/products/cleanup', {
			method: 'POST',
			headers: { Origin: 'https://example.com' },
		});
		const env = { STRIPE_SECRET_KEY: 'sk_test_123', ALLOWED_ORIGINS: 'https://example.com' } as Env;
		const response = await handleCleanupProducts(mockStripe as Stripe, request, env, 'https://example.com');
		expect(response.status).toBe(200);
		const body = (await response.json()) as any;
		expect(body.data.dry_run).toBe(false);
		expect(body.data.deleted).toEqual(['prod_junk1', 'prod_junk2']);
		expect(body.data.deleted_count).toBe(2);
		expect(body.data.archived_count).toBe(0);
		expect(body.data.failed_count).toBe(0);
		// Priced product never touched.
		expect(mockStripe.products.del).not.toHaveBeenCalledWith('prod_priced');
	});

	it('falls back to archive when Stripe refuses to delete a candidate', async () => {
		singlePage([{ id: 'prod_junk1', name: 'Test Product', default_price: null }]);
		mockStripe.products.del.mockRejectedValue({ code: 'invalid_request_error', statusCode: 400, message: 'has prices' });
		// archiveProduct retrieves, then updates.
		mockStripe.products.retrieve.mockResolvedValue({ id: 'prod_junk1', active: true, default_price: null });
		mockStripe.products.update.mockResolvedValue({ id: 'prod_junk1', active: false });
		mockStripe.prices.list.mockResolvedValue({ data: [] });

		const request = new Request('http://example.com/products/cleanup', {
			method: 'POST',
			headers: { Origin: 'https://example.com' },
		});
		const env = { STRIPE_SECRET_KEY: 'sk_test_123', ALLOWED_ORIGINS: 'https://example.com' } as Env;
		const response = await handleCleanupProducts(mockStripe as Stripe, request, env, 'https://example.com');
		expect(response.status).toBe(200);
		const body = (await response.json()) as any;
		expect(body.data.deleted).toEqual([]);
		expect(body.data.archived).toEqual(['prod_junk1']);
		expect(body.data.archived_count).toBe(1);
	});

	it('records a failure when both delete and archive fail', async () => {
		singlePage([{ id: 'prod_junk1', name: 'Test Product', default_price: null }]);
		mockStripe.products.del.mockRejectedValue({ code: 'invalid_request_error', statusCode: 400, message: 'has prices' });
		mockStripe.products.retrieve.mockResolvedValue({ id: 'prod_junk1', active: true, default_price: null });
		mockStripe.prices.list.mockResolvedValue({ data: [] });
		mockStripe.products.update.mockRejectedValue({ message: 'archive boom' });

		const request = new Request('http://example.com/products/cleanup', {
			method: 'POST',
			headers: { Origin: 'https://example.com' },
		});
		const env = { STRIPE_SECRET_KEY: 'sk_test_123', ALLOWED_ORIGINS: 'https://example.com' } as Env;
		const response = await handleCleanupProducts(mockStripe as Stripe, request, env, 'https://example.com');
		expect(response.status).toBe(200);
		const body = (await response.json()) as any;
		expect(body.data.failed).toEqual([{ id: 'prod_junk1', error: 'archive boom' }]);
		expect(body.data.failed_count).toBe(1);
	});

	it('returns empty summary when nothing to clean up', async () => {
		singlePage([{ id: 'prod_priced', name: 'Real Honey', default_price: { id: 'price_1' } }]);

		const request = new Request('http://example.com/products/cleanup', {
			method: 'POST',
			headers: { Origin: 'https://example.com' },
		});
		const env = { STRIPE_SECRET_KEY: 'sk_test_123', ALLOWED_ORIGINS: 'https://example.com' } as Env;
		const response = await handleCleanupProducts(mockStripe as Stripe, request, env, 'https://example.com');
		expect(response.status).toBe(200);
		const body = (await response.json()) as any;
		expect(body.data.deleted_count).toBe(0);
		expect(body.data.archived_count).toBe(0);
		expect(mockStripe.products.del).not.toHaveBeenCalled();
	});

	it('fires product-deleted notification after a cleanup that changed something', async () => {
		singlePage([{ id: 'prod_junk1', name: 'Test Product', default_price: null }]);
		mockStripe.products.del.mockResolvedValue({ id: 'prod_junk1', deleted: true });

		const mockNotify = vi.fn().mockResolvedValue(undefined);
		const mockNotificationHub = { getByName: vi.fn().mockReturnValue({ notify: mockNotify }) };

		const request = new Request('http://example.com/products/cleanup', {
			method: 'POST',
			headers: { Origin: 'https://example.com' },
		});
		const env = {
			STRIPE_SECRET_KEY: 'sk_test_123',
			ALLOWED_ORIGINS: 'https://example.com',
			NOTIFICATION_HUB: mockNotificationHub,
		} as unknown as Env;
		const response = await handleCleanupProducts(mockStripe as Stripe, request, env, 'https://example.com');
		expect(response.status).toBe(200);
		expect(mockNotify).toHaveBeenCalledWith({ type: 'product-deleted', productId: 'prod_junk1' });
	});

	it('paginates across multiple product pages', async () => {
		mockStripe.products.list
			.mockResolvedValueOnce({ data: [{ id: 'prod_a', name: 'A', default_price: null }], has_more: true })
			.mockResolvedValueOnce({ data: [{ id: 'prod_b', name: 'B', default_price: { id: 'price_1' } }], has_more: false });

		const request = new Request('http://example.com/products/cleanup?dryRun=true', {
			method: 'POST',
			headers: { Origin: 'https://example.com' },
		});
		const env = { STRIPE_SECRET_KEY: 'sk_test_123', ALLOWED_ORIGINS: 'https://example.com' } as Env;
		const response = await handleCleanupProducts(mockStripe as Stripe, request, env, 'https://example.com');
		const body = (await response.json()) as any;
		expect(body.data.candidates).toEqual([{ id: 'prod_a', name: 'A' }]);
		expect(mockStripe.products.list).toHaveBeenCalledTimes(2);
	});

	// Middleware
	it('returns 405 for non-POST method', async () => {
		const request = new Request('http://example.com/products/cleanup', {
			method: 'GET',
			headers: { Origin: 'https://example.com' },
		});
		const env = { STRIPE_SECRET_KEY: 'sk_test_123', ALLOWED_ORIGINS: 'https://example.com' } as Env;
		const response = await worker.fetch(request, env);
		expect(response.status).toBe(405);
	});

	it('returns 403 for disallowed origin', async () => {
		const request = new Request('http://example.com/products/cleanup', {
			method: 'POST',
			headers: { Origin: 'https://evil.com' },
		});
		const env = { STRIPE_SECRET_KEY: 'sk_test_123', ALLOWED_ORIGINS: 'https://example.com' } as Env;
		const response = await worker.fetch(request, env);
		expect(response.status).toBe(403);
	});
});
