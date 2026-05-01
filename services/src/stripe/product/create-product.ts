// workers/create-product.ts
import { withStripeHandler } from '../../utils';
import Stripe from 'stripe';
import { jsonResponse, isValidUrl } from '../../utils';

/**
 * Stripe Product Create Handler
 *
 * Handles POST /products requests to create a new Stripe product.
 * Requires authentication if API_SECRET_KEY is set.
 *
 * @module create-product
 */

/**
 * Export default fetch handler for POST /products endpoint
 * Creates a new Stripe product with validation for name and URLs
 *
 * @type {ExportedHandler<Env>}
 * @param {Stripe} stripe - Initialized Stripe client
 * @param {Request} request - Incoming HTTP request with product data
 * @param {Env} env - Cloudflare Worker environment variables
 * @param {string | null} origin - Request origin for CORS headers
 * @returns {Promise<Response>} JSON response with created product
 *
 * @example
 * // Request body:
 * // {
 * //   "name": "My Product",
 * //   "description": "Product description",
 * //   "images": ["https://example.com/image.png"],
 * //   "url": "https://example.com/product"
 * // }
 */
export default {
	fetch: withStripeHandler('POST', async (stripe: Stripe, request: Request, env: Env, origin: string | null) => {
		// Parse request body
		const productData = (await request.json()) as Stripe.ProductCreateParams;

		// Basic validation
		if (!productData.name || typeof productData.name !== 'string' || productData.name.trim() === '') {
			return jsonResponse({ error: 'Product name is required and must be a non-empty string' }, 400, origin, env);
		}

		// Validate URLs in product data
		if (productData.url && !isValidUrl(productData.url)) {
			return jsonResponse({ error: 'Invalid product URL' }, 400, origin, env);
		}

		if (productData.images && Array.isArray(productData.images)) {
			for (const imageUrl of productData.images) {
				if (!isValidUrl(imageUrl)) {
					return jsonResponse({ error: `Invalid image URL: ${imageUrl}` }, 400, origin, env);
				}
			}
		}

		const product = await stripe.products.create(productData);
		return jsonResponse(product, 200, origin, env);
	}),
} satisfies ExportedHandler<Env>;
