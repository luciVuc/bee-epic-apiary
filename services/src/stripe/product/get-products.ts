// workers/get-products.ts
import { withStripeHandler } from '../../utils';
import Stripe from 'stripe';
import { jsonResponse } from '../../utils';

const CACHE_TTL = 300; // 5 minutes in seconds

/**
 * Stripe Product Retrieve Handler
 *
 * Handles GET /products (list all) and GET /products/:id (get single) requests.
 * GET /products responses are cached for 5 minutes.
 * Supports `expand` query parameter for expanding related objects (e.g., default_price).
 *
 * @module get-products
 */

/**
 * Inner handler for getting products.
 * Exported for testing with mocked Stripe instances.
 */
export async function handleGetProducts(stripe: Stripe, request: Request, env: Env, origin: string | null): Promise<Response> {
	try {
		// Extract product ID from URL using regex
		const url = new URL(request.url);
		const productIdMatch = url.pathname.match(/\/products\/([^/]+)/);
		const productId = productIdMatch ? productIdMatch[1] : null;

		// Parse expand parameter from query string
		const expandParam = url.searchParams.get('expand');
		const expand = expandParam ? expandParam.split(',').map((e) => e.trim()) : undefined;

		// Try to get from cache first (only for GET all products, not individual products)
		if (!productId) {
			const cache = caches.default;
			const cacheKey = new Request(url.toString(), { method: 'GET' });
			const cachedResponse = await cache.match(cacheKey);
			if (cachedResponse) {
				return cachedResponse;
			}
		}

		let result;
		const listParams: Stripe.ProductListParams = {};
		if (expand) {
			listParams.expand = expand;
		}

		if (productId) {
			// Get single product
			const retrieveParams: Stripe.ProductRetrieveParams = {};
			if (expand) {
				retrieveParams.expand = expand;
			}
			result = (await stripe.products.retrieve(productId, retrieveParams)) as Stripe.Response<Stripe.Product>;
		} else {
			// Get all products
			result = (await stripe.products.list(listParams)) as Stripe.Response<Stripe.ApiList<Stripe.Product>>;
		}

		const response = jsonResponse(result, 200, origin, env);

		// Cache the response for GET all products
		if (!productId) {
			const cache = caches.default;
			const cacheKey = new Request(url.toString(), { method: 'GET' });
			// Add cache headers to response
			response.headers.set('Cache-Control', `public, max-age=${CACHE_TTL}`);
			// Clone the response before caching
			const responseToCache = response.clone();
			await cache.put(cacheKey, responseToCache);
		}

		return response;
	} catch (error: any) {
		console.error('Get products error:', error);
		const statusCode = error.statusCode || 500;
		const message = statusCode < 500 ? error.message || 'An error occurred' : 'An error occurred';
		return jsonResponse({ error: message }, statusCode, origin, env);
	}
}

/**
 * Export default fetch handler for GET /products and GET /products/:id endpoints
 * Retrieves product(s) from Stripe with optional caching for list endpoint
 *
 * @type {ExportedHandler<Env>}
 * @param {Stripe} stripe - Initialized Stripe client
 * @param {Request} request - Incoming HTTP request
 * @param {Env} env - Cloudflare Worker environment variables
 * @param {string | null} origin - Request origin for CORS headers
 * @returns {Promise<Response>} JSON response with product(s)
 */
export default {
	fetch: withStripeHandler('GET', handleGetProducts),
} satisfies ExportedHandler<Env>;
