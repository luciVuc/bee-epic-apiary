import Stripe from 'stripe';
import { paginateArray } from '../../utils';

export { paginateArray };

/** Cache key kept in sync with get-products.ts. Exported only for tests. */
export const PRODUCT_COUNT_CACHE_KEY = 'products:count:v1';

/**
 * Drops the cached unfiltered product count after a CUD operation so the next
 * listing reflects the change immediately. Failures are swallowed (logged) —
 * stale count for up to 120s is preferable to a 500 on the CUD path itself.
 */
export async function invalidateProductCountCache(env: Env): Promise<void> {
	const kv = env.CONTENT_KV;
	if (!kv) return;
	try {
		await kv.delete(PRODUCT_COUNT_CACHE_KEY);
	} catch (err) {
		console.error('product-count cache invalidation failed', { err: String(err) });
	}
}

/**
 * Walks every page of active Stripe products (100 per page) and returns them
 * as a single array. Used by the filtered listing, count, stats, and cleanup
 * paths that must reason over the whole catalogue rather than one Stripe page.
 * `expand` is forwarded to each list call (list-form paths, e.g. `data.default_price`).
 */
export async function fetchAllActiveProducts(stripe: Stripe, expand?: string[]): Promise<Stripe.Product[]> {
	const allProducts: Stripe.Product[] = [];
	let hasMore = true;
	let startingAfter: string | undefined;

	while (hasMore) {
		const params: Stripe.ProductListParams = {
			active: true,
			limit: 100,
			expand,
		};
		if (startingAfter) {
			params.starting_after = startingAfter;
		}
		const page = await stripe.products.list(params);
		allProducts.push(...page.data);
		hasMore = page.has_more;
		startingAfter = page.data[page.data.length - 1]?.id;
	}

	return allProducts;
}

/**
 * Case-insensitive free-text match over a product's name, description, long
 * description, and tags metadata. Empty search matches everything.
 */
export function matchesSearch(product: Stripe.Product, search: string): boolean {
	if (!search) return true;
	const q = search.toLowerCase();
	return (
		product.name.toLowerCase().includes(q) ||
		(product.description || '').toLowerCase().includes(q) ||
		(product.metadata?.longDescription || '').toLowerCase().includes(q) ||
		(product.metadata?.tags || '').toLowerCase().includes(q)
	);
}

/**
 * Exact match on the product's `category` metadata. Empty or the sentinel
 * `'ALL'` matches everything.
 */
export function matchesCategory(product: Stripe.Product, category: string): boolean {
	if (!category || category === 'ALL') return true;
	return (product.metadata?.category || '') === category;
}

/**
 * Membership test against the product's comma-separated `tags` metadata (each
 * entry trimmed). Empty tag matches everything.
 */
export function matchesTag(product: Stripe.Product, tag: string): boolean {
	if (!tag) return true;
	const trimmedTag = tag.trim();
	const tags = (product.metadata?.tags || '')
		.split(',')
		.map((t) => t.trim())
		.filter(Boolean);
	return tags.includes(trimmedTag);
}
