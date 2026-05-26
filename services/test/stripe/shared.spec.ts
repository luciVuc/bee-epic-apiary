import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchAllActiveProducts, matchesSearch, matchesCategory, matchesTag, paginateArray } from '../../src/stripe/product/shared';
import Stripe from 'stripe';

describe('fetchAllActiveProducts', () => {
	let mockStripe: any;

	beforeEach(() => {
		mockStripe = {
			products: {
				list: vi.fn(),
			},
		};
	});

	it('fetches single page of products', async () => {
		const products = [{ id: 'prod_1', name: 'Product 1' }];
		mockStripe.products.list.mockResolvedValue({
			data: products,
			has_more: false,
		});

		const result = await fetchAllActiveProducts(mockStripe as Stripe);
		expect(result).toEqual(products);
		expect(mockStripe.products.list).toHaveBeenCalledWith(expect.objectContaining({ active: true, limit: 100 }));
	});

	it('fetches multiple pages of products', async () => {
		const page1 = [
			{ id: 'prod_1', name: 'Product 1' },
			{ id: 'prod_2', name: 'Product 2' },
		];
		const page2 = [{ id: 'prod_3', name: 'Product 3' }];

		mockStripe.products.list.mockResolvedValueOnce({ data: page1, has_more: true }).mockResolvedValueOnce({ data: page2, has_more: false });

		const result = await fetchAllActiveProducts(mockStripe as Stripe);
		expect(result).toEqual([...page1, ...page2]);
		expect(mockStripe.products.list).toHaveBeenCalledTimes(2);
	});

	it('fetches with expand parameter', async () => {
		mockStripe.products.list.mockResolvedValue({
			data: [{ id: 'prod_1' }],
			has_more: false,
		});

		await fetchAllActiveProducts(mockStripe as Stripe, ['default_price']);
		expect(mockStripe.products.list).toHaveBeenCalledWith(expect.objectContaining({ expand: ['default_price'] }));
	});

	it('passes starting_after for subsequent pages', async () => {
		const page1 = [
			{ id: 'prod_1', name: 'Product 1' },
			{ id: 'prod_2', name: 'Product 2' },
		];
		const page2 = [{ id: 'prod_3', name: 'Product 3' }];

		mockStripe.products.list.mockResolvedValueOnce({ data: page1, has_more: true }).mockResolvedValueOnce({ data: page2, has_more: false });

		await fetchAllActiveProducts(mockStripe as Stripe);

		expect(mockStripe.products.list).toHaveBeenNthCalledWith(2, expect.objectContaining({ starting_after: 'prod_2' }));
	});

	it('handles empty result', async () => {
		mockStripe.products.list.mockResolvedValue({
			data: [],
			has_more: false,
		});

		const result = await fetchAllActiveProducts(mockStripe as Stripe);
		expect(result).toEqual([]);
	});
});

describe('matchesSearch', () => {
	const baseProduct = {
		id: 'prod_1',
		name: 'Wildflower Honey',
		description: 'Pure wildflower honey from local bees',
		metadata: {
			longDescription: 'A delicious honey with floral notes',
			tags: 'organic, raw, wildflower',
		},
		active: true,
	} as Stripe.Product;

	it('returns true for empty search string', () => {
		expect(matchesSearch(baseProduct, '')).toBe(true);
	});

	it('matches product name', () => {
		expect(matchesSearch(baseProduct, 'Honey')).toBe(true);
	});

	it('matches product description', () => {
		expect(matchesSearch(baseProduct, 'local bees')).toBe(true);
	});

	it('matches longDescription in metadata', () => {
		expect(matchesSearch(baseProduct, 'floral notes')).toBe(true);
	});

	it('matches tags in metadata', () => {
		expect(matchesSearch(baseProduct, 'organic')).toBe(true);
	});

	it('is case insensitive', () => {
		expect(matchesSearch(baseProduct, 'WILDFLOWER')).toBe(true);
	});

	it('returns false when no match found', () => {
		expect(matchesSearch(baseProduct, 'nonexistent')).toBe(false);
	});

	it('handles undefined description gracefully', () => {
		const product = { ...baseProduct, description: undefined } as Stripe.Product;
		expect(matchesSearch(product, 'undefined')).toBe(false);
	});

	it('handles undefined metadata gracefully', () => {
		const product = { ...baseProduct, metadata: undefined } as Stripe.Product;
		expect(matchesSearch(product, 'organic')).toBe(false);
	});

	it('handles null metadata gracefully', () => {
		const product = { ...baseProduct, metadata: null as unknown as Stripe.Metadata } as Stripe.Product;
		expect(matchesSearch(product, 'organic')).toBe(false);
	});
});

describe('matchesCategory', () => {
	const baseProduct = {
		id: 'prod_1',
		name: 'Wildflower Honey',
		metadata: { category: 'HONEY' },
		active: true,
	} as Stripe.Product;

	it('returns true for empty category', () => {
		expect(matchesCategory(baseProduct, '')).toBe(true);
	});

	it('returns true for ALL category', () => {
		expect(matchesCategory(baseProduct, 'ALL')).toBe(true);
	});

	it('returns true when category matches', () => {
		expect(matchesCategory(baseProduct, 'HONEY')).toBe(true);
	});

	it('returns false when category does not match', () => {
		expect(matchesCategory(baseProduct, 'BEESWAX')).toBe(false);
	});

	it('handles undefined metadata.category', () => {
		const product = { ...baseProduct, metadata: {} } as Stripe.Product;
		expect(matchesCategory(product, 'HONEY')).toBe(false);
	});

	it('handles null metadata', () => {
		const product = { ...baseProduct, metadata: null as unknown as Stripe.Metadata } as Stripe.Product;
		expect(matchesCategory(product, 'HONEY')).toBe(false);
	});
});

describe('matchesTag', () => {
	const baseProduct = {
		id: 'prod_1',
		name: 'Wildflower Honey',
		metadata: { tags: 'organic, raw, wildflower' },
		active: true,
	} as Stripe.Product;

	it('returns true for empty tag', () => {
		expect(matchesTag(baseProduct, '')).toBe(true);
	});

	it('returns true when tag matches', () => {
		expect(matchesTag(baseProduct, 'organic')).toBe(true);
	});

	it('returns true when tag matches with extra spaces', () => {
		expect(matchesTag(baseProduct, ' raw ')).toBe(true);
	});

	it('returns false when tag does not match', () => {
		expect(matchesTag(baseProduct, 'synthetic')).toBe(false);
	});

	it('is case sensitive (tags are exact match)', () => {
		expect(matchesTag(baseProduct, 'Organic')).toBe(false);
	});

	it('handles undefined metadata.tags', () => {
		const product = { ...baseProduct, metadata: {} } as Stripe.Product;
		expect(matchesTag(product, 'organic')).toBe(false);
	});

	it('handles null metadata', () => {
		const product = { ...baseProduct, metadata: null as unknown as Stripe.Metadata } as Stripe.Product;
		expect(matchesTag(product, 'organic')).toBe(false);
	});

	it('handles empty tags string', () => {
		const product = { ...baseProduct, metadata: { tags: '' } } as Stripe.Product;
		expect(matchesTag(product, 'organic')).toBe(false);
	});
});

describe('paginateArray', () => {
	const items = [
		{ id: 'a', name: 'A' },
		{ id: 'b', name: 'B' },
		{ id: 'c', name: 'C' },
		{ id: 'd', name: 'D' },
		{ id: 'e', name: 'E' },
	];

	it('returns first page when no starting_after', () => {
		const result = paginateArray(items, 2);
		expect(result.data).toEqual([
			{ id: 'a', name: 'A' },
			{ id: 'b', name: 'B' },
		]);
		expect(result.hasMore).toBe(true);
		expect(result.lastId).toBe('b');
	});

	it('returns page without hasMore when limit covers all items', () => {
		const result = paginateArray(items, 10);
		expect(result.data).toEqual(items);
		expect(result.hasMore).toBe(false);
		expect(result.lastId).toBe('e');
	});

	it('paginates after a given id', () => {
		const result = paginateArray(items, 2, 'b');
		expect(result.data).toEqual([
			{ id: 'c', name: 'C' },
			{ id: 'd', name: 'D' },
		]);
		expect(result.hasMore).toBe(true);
		expect(result.lastId).toBe('d');
	});

	it('returns empty data when starting after last item', () => {
		const result = paginateArray(items, 10, 'e');
		expect(result.data).toEqual([]);
		expect(result.hasMore).toBe(false);
		expect(result.lastId).toBe(null);
	});

	it('falls back to first page when starting_after id not found', () => {
		const result = paginateArray(items, 2, 'nonexistent');
		expect(result.data).toEqual([
			{ id: 'a', name: 'A' },
			{ id: 'b', name: 'B' },
		]);
		expect(result.hasMore).toBe(true);
		expect(result.lastId).toBe('b');
	});

	it('handles empty array', () => {
		const result = paginateArray([], 10);
		expect(result.data).toEqual([]);
		expect(result.hasMore).toBe(false);
		expect(result.lastId).toBe(null);
	});

	it('returns hasMore false when at end of array', () => {
		const result = paginateArray(items, 2, 'd');
		expect(result.data).toEqual([{ id: 'e', name: 'E' }]);
		expect(result.hasMore).toBe(false);
		expect(result.lastId).toBe('e');
	});
});
