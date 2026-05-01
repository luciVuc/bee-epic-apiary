// workers/get-products.ts
import { withStripeHandler } from '../../utils';
import Stripe from 'stripe';
import { jsonResponse } from '../../utils';

const CACHE_TTL = 300; // 5 minutes in seconds

export default {
	fetch: withStripeHandler('GET', async (stripe: Stripe, request: Request, env: Env, origin: string | null) => {
		// Extract product ID from URL using regex
		const url = new URL(request.url);
		const productIdMatch = url.pathname.match(/\/products\/([^/]+)/);
		const productId = productIdMatch ? productIdMatch[1] : null;

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
		if (productId) {
			// Get single product
			result = (await stripe.products.retrieve(productId)) as Stripe.Response<Stripe.Product>;
		} else {
			// Get all products
			result = (await stripe.products.list()) as Stripe.Response<Stripe.ApiList<Stripe.Product>>;
		}

		const response = jsonResponse(result, 200, origin, env);

		// Cache the response for GET all products
		if (!productId) {
			const cache = caches.default;
			const cacheKey = new Request(url.toString(), { method: 'GET' });
			// Clone the response before caching
			const responseToCache = response.clone();
			// Add cache headers
			responseToCache.headers.set('Cache-Control', `public, max-age=${CACHE_TTL}`);
			await cache.put(cacheKey, responseToCache);
		}

		return response;
	}),
} satisfies ExportedHandler<Env>;
