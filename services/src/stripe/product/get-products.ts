import { withStripeHandler } from '../../utils';
import Stripe from 'stripe';
import { jsonResponse } from '../../utils';

const CACHE_TTL = 1;

async function fetchAllActiveProducts(stripe: Stripe, expand?: string[]): Promise<Stripe.Product[]> {
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
		const page = (await stripe.products.list(params)) as Stripe.Response<Stripe.ApiList<Stripe.Product>>;
		allProducts.push(...page.data);
		hasMore = page.has_more;
		startingAfter = page.data[page.data.length - 1]?.id;
	}

	return allProducts;
}

function matchesSearch(product: Stripe.Product, search: string): boolean {
	if (!search) return true;
	const q = search.toLowerCase();
	return (
		product.name.toLowerCase().includes(q) ||
		(product.description || '').toLowerCase().includes(q) ||
		(product.metadata?.longDescription || '').toLowerCase().includes(q) ||
		(product.metadata?.tags || '').toLowerCase().includes(q)
	);
}

function matchesCategory(product: Stripe.Product, category: string): boolean {
	if (!category || category === 'ALL') return true;
	return (product.metadata?.category || '') === category;
}

function paginateArray<T extends { id: string }>(
	items: T[],
	limit: number,
	startingAfter?: string,
): { data: T[]; hasMore: boolean; lastId: string | null } {
	if (startingAfter) {
		const startIndex = items.findIndex((item) => item.id === startingAfter);
		if (startIndex !== -1) {
			const sliced = items.slice(startIndex + 1, startIndex + 1 + limit);
			return {
				data: sliced,
				hasMore: startIndex + 1 + limit < items.length,
				lastId: sliced[sliced.length - 1]?.id || null,
			};
		}
	}
	const sliced = items.slice(0, limit);
	return {
		data: sliced,
		hasMore: limit < items.length,
		lastId: sliced[sliced.length - 1]?.id || null,
	};
}

export async function handleGetProducts(stripe: Stripe, request: Request, env: Env, origin: string | null): Promise<Response> {
	try {
		const url = new URL(request.url);
		const productIdMatch = url.pathname.match(/\/products\/([^/]+)/);
		const productId = productIdMatch ? productIdMatch[1] : null;

		const expandParams = url.searchParams.getAll('expand[]');
		const expand = expandParams.length > 0 ? expandParams : undefined;

		const search = url.searchParams.get('search') || '';
		const category = url.searchParams.get('category') || '';

		const cache = caches.default;
		const cacheKey = new Request(url.toString(), { method: 'GET' });

		// Try cache for list requests
		if (!productId) {
			const cachedResponse = await cache.match(cacheKey);
			if (cachedResponse) {
				return cachedResponse;
			}
		}

		// Single product
		if (productId) {
			const retrieveParams: Stripe.ProductRetrieveParams = {};
			if (expand) {
				retrieveParams.expand = expand;
			}
			const product = (await stripe.products.retrieve(productId, retrieveParams)) as Stripe.Response<Stripe.Product>;

			if (!product.active) {
				return jsonResponse({ error: 'Product not found' }, 404, origin, env);
			}

			return jsonResponse(product, 200, origin, env);
		}

		// List products
		const limit = parseInt(url.searchParams.get('limit') || '10', 10);
		const startingAfter = url.searchParams.get('starting_after') || undefined;

		let resultData: any;

		if (search || (category && category !== 'ALL')) {
			// Filtered: fetch all from Stripe, filter, then paginate
			const allProducts = await fetchAllActiveProducts(stripe, expand);
			const filtered = allProducts.filter((p) => {
				return matchesSearch(p, search) && matchesCategory(p, category);
			});
			const paginated = paginateArray(filtered, limit, startingAfter);
			resultData = {
				data: paginated.data,
				has_more: paginated.hasMore,
				total_count: filtered.length,
			};
		} else {
			// No filters: use Stripe pagination directly
			const listParams: Stripe.ProductListParams = { active: true, limit };
			if (expand) {
				listParams.expand = expand;
			}
			if (startingAfter) {
				listParams.starting_after = startingAfter;
			}

			const stripeResult = (await stripe.products.list(listParams)) as Stripe.Response<Stripe.ApiList<Stripe.Product>>;

			// Get total count of all active products
			let totalCount = stripeResult.data.length;
			try {
				const allProducts = await fetchAllActiveProducts(stripe, expand);
				totalCount = allProducts.length;
			} catch {
				// Fallback: just show what we loaded
			}

			resultData = {
				...stripeResult,
				total_count: totalCount,
			};
		}

		const response = jsonResponse(resultData, 200, origin, env);
		response.headers.set('Cache-Control', `public, max-age=${CACHE_TTL}`);
		const responseToCache = response.clone();
		await cache.put(cacheKey, responseToCache);

		return response;
	} catch (error: any) {
		console.error('Get products error:', error);
		const statusCode = error.statusCode || 500;
		const message = statusCode < 500 ? error.message || 'An error occurred' : 'An error occurred';
		return jsonResponse({ error: message }, statusCode, origin, env);
	}
}

export default {
	fetch: withStripeHandler('GET', handleGetProducts),
} satisfies ExportedHandler<Env>;
