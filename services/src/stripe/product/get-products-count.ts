import { withStripeHandler } from '../../utils';
import Stripe from 'stripe';
import { jsonResponse } from '../../utils';

const CACHE_TTL = 1; // 300; // 5 minutes in seconds

/**
 * Stripe Product Count Handler
 *
 * Handles GET /products/count requests.
 * Returns the total count of active products in Stripe.
 * Responses are cached for 5 minutes.
 *
 * @module get-products-count
 */

/**
 * Inner handler for getting product count.
 * Exported for testing with mocked Stripe instances.
 */
export async function handleGetProductsCount(stripe: Stripe, request: Request, env: Env, origin: string | null): Promise<Response> {
	try {
		const url = new URL(request.url);

		// Try to get from cache first
		const cache = caches.default;
		const cacheKey = new Request(url.toString(), { method: 'GET' });
		const cachedResponse = await cache.match(cacheKey);
		if (cachedResponse) {
			return cachedResponse;
		}

		// Count all active products using pagination
		let totalCount = 0;

		// Start with first page
		const firstPage = await stripe.products.list({
			active: true,
			limit: 100,
		});

		totalCount = firstPage.data.length;

		// If there are more products, continue fetching
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

		const responseData = { total: totalCount };
		const response = jsonResponse(responseData, 200, origin, env);

		// Cache the response
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
