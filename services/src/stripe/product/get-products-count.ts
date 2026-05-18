import { withStripeHandler } from '../../utils';
import Stripe from 'stripe';
import { jsonResponse } from '../../utils';

const CACHE_TTL = 1;

/**
 * Fetch all active products from Stripe, with pagination handling.
 */
async function fetchAllActiveProducts(stripe: Stripe): Promise<Stripe.Product[]> {
	const allProducts: Stripe.Product[] = [];
	let hasMore = true;
	let startingAfter: string | undefined;

	while (hasMore) {
		const params: Stripe.ProductListParams = {
			active: true,
			limit: 100,
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

export async function handleGetProductsCount(stripe: Stripe, request: Request, env: Env, origin: string | null): Promise<Response> {
	try {
		const url = new URL(request.url);

		const cache = caches.default;
		const cacheKey = new Request(url.toString(), { method: 'GET' });
		const cachedResponse = await cache.match(cacheKey);
		if (cachedResponse) {
			return cachedResponse;
		}

		const search = url.searchParams.get('search') || '';
		const category = url.searchParams.get('category') || '';

		let totalCount = 0;

		if (search || (category && category !== 'ALL')) {
			// Filter applied: fetch all products and count matching ones
			const allProducts = await fetchAllActiveProducts(stripe);
			totalCount = allProducts.filter((p) => {
				return matchesSearch(p, search) && matchesCategory(p, category);
			}).length;
		} else {
			// No filters: count all active products efficiently
			const firstPage = await stripe.products.list({
				active: true,
				limit: 100,
			});

			totalCount = firstPage.data.length;

			let hasMore = firstPage.has_more;
			let lastId = firstPage.data[firstPage.data.length - 1]?.id;

			while (hasMore && lastId) {
				const nextPage = await stripe.products.list({
					active: true,
					limit: 100,
					starting_after: lastId,
				});

				totalCount += nextPage.data.length;
				hasMore = nextPage.has_more;
				lastId = nextPage.data[nextPage.data.length - 1]?.id;
			}
		}

		const responseData = { total: totalCount };
		const response = jsonResponse(responseData, 200, origin, env);

		response.headers.set('Cache-Control', `public, max-age=${CACHE_TTL}`);
		const responseToCache = response.clone();
		await cache.put(cacheKey, responseToCache);

		return response;
	} catch (error: any) {
		console.error('Get products count error:', error);
		const statusCode = error.statusCode || 500;
		const message = statusCode < 500 ? error.message || 'An error occurred' : 'An error occurred';
		return jsonResponse({ error: message }, statusCode, origin, env);
	}
}

/**
 * Export default fetch handler for GET /products/count endpoint
 * Returns the total count of active products in Stripe
 *
 * @type {ExportedHandler<Env>}
 */
export default {
	fetch: withStripeHandler('GET', handleGetProductsCount),
} satisfies ExportedHandler<Env>;
