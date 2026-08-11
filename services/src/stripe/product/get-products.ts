import { withStripeHandler, stripeErrorResponse } from '../../utils';
import Stripe from 'stripe';
import { jsonOk, jsonErr } from '../../utils';
import { fetchAllActiveProducts, matchesSearch, matchesCategory, matchesTag, paginateArray, PRODUCT_COUNT_CACHE_KEY } from './shared';

const PRODUCT_COUNT_CACHE_TTL_SECONDS = 120;

/**
 * Returns the count of all active products, served from KV when warm.
 *
 * The unfiltered `/products` path used to re-walk every Stripe page on each
 * request just to populate `total_count`. With a short-TTL KV cache (120s,
 * since count changes are rare and admin actions invalidate via product CUD
 * hooks), traffic collapses from N+1 per request to amortized 1+1 (review I4).
 *
 * Falls back to a live full-walk if KV is unavailable or the cache misses;
 * stays silent on KV errors so a transient KV outage never 500s `/products`.
 */
async function getCachedActiveProductCount(env: Env, stripe: Stripe, expand: string[] | undefined): Promise<number> {
	const kv = env.CONTENT_KV;
	if (kv) {
		try {
			const cached = await kv.get(PRODUCT_COUNT_CACHE_KEY);
			if (cached !== null) {
				const n = Number(cached);
				if (Number.isFinite(n) && n >= 0) return n;
			}
		} catch (err) {
			console.error('product-count cache read failed; falling back to live count', { err: String(err) });
		}
	}
	const all = await fetchAllActiveProducts(stripe, expand);
	const n = all.length;
	if (kv) {
		try {
			await kv.put(PRODUCT_COUNT_CACHE_KEY, String(n), { expirationTtl: PRODUCT_COUNT_CACHE_TTL_SECONDS });
		} catch (err) {
			console.error('product-count cache write failed', { err: String(err) });
		}
	}
	return n;
}

export async function handleGetProducts(stripe: Stripe, request: Request, env: Env, origin: string | null): Promise<Response> {
	const url = new URL(request.url);
	const productIdMatch = url.pathname.match(/\/products\/([^/]+)/);
	const productId = productIdMatch ? productIdMatch[1] : null;

	const expandParams = url.searchParams.getAll('expand[]');
	const expand = expandParams.length > 0 ? expandParams : undefined;

	const search = url.searchParams.get('search') || '';
	const category = url.searchParams.get('category') || '';
	const tag = url.searchParams.get('tag') || '';

	try {
		if (productId) {
			let product: Stripe.Product;

			if (productId.startsWith('prod_')) {
				const retrieveParams: Stripe.ProductRetrieveParams = {};
				// products.retrieve returns a bare Product (no `data` wrapper), so the
				// list-form `data.default_price` expand path — valid for list/search
				// responses — is rejected here (400). Strip the `data.` prefix.
				if (expand) retrieveParams.expand = expand.map((e) => e.replace(/^data\./, ''));
				product = await stripe.products.retrieve(productId, retrieveParams);
			} else {
				const searchQuery = `metadata['slug']:'${productId.replace(/'/g, "''")}'`;
				// products.search returns a list envelope, so expand fields must carry the
				// `data.` prefix. Normalize either client form (`default_price` or
				// `data.default_price`) to the list form.
				const searchExpand = expand?.map((e) => (e.startsWith('data.') ? e : `data.${e}`));
				const searchParams: Stripe.ProductSearchParams = { query: searchQuery, limit: 1, expand: searchExpand };
				const result = await stripe.products.search(searchParams);
				if (result.data.length === 0) {
					return jsonErr({ code: 'NOT_FOUND', resource: `product:${productId}` }, origin, env);
				}
				product = result.data[0];
			}

			if (!product.active) {
				return jsonErr({ code: 'NOT_FOUND', resource: `product:${productId}` }, origin, env);
			}

			return jsonOk(product, origin, env);
		}

		const limit = parseInt(url.searchParams.get('limit') || '10', 10);
		const startingAfter = url.searchParams.get('starting_after') || undefined;

		let resultData: Record<string, unknown>;

		if (search || (category && category !== 'ALL') || tag) {
			const allProducts = await fetchAllActiveProducts(stripe, expand);
			const filtered = allProducts.filter((p) => matchesSearch(p, search) && matchesCategory(p, category) && matchesTag(p, tag));
			const paginated = paginateArray(filtered, limit, startingAfter);
			resultData = { data: paginated.data, has_more: paginated.hasMore, total_count: filtered.length };
		} else {
			const listParams: Stripe.ProductListParams = { active: true, limit };
			if (expand) listParams.expand = expand;
			if (startingAfter) listParams.starting_after = startingAfter;

			const stripeResult = await stripe.products.list(listParams);

			let totalCount = stripeResult.data.length;
			try {
				totalCount = await getCachedActiveProductCount(env, stripe, expand);
			} catch (error) {
				console.error('Failed to fetch full product list for total_count, falling back to first page count:', error);
			}

			resultData = { ...stripeResult, total_count: totalCount };
		}

		return jsonOk(resultData, origin, env);
	} catch (error) {
		return stripeErrorResponse(error, origin, env, productId ? `product:${productId}` : 'products');
	}
}

export default {
	fetch: withStripeHandler('GET', handleGetProducts),
} satisfies ExportedHandler<Env>;
