// workers/update-product.ts
import { withStripeHandler } from '../../utils';
import Stripe from 'stripe';
import { jsonResponse, isValidUrl } from '../../utils';
import { invalidateProductCaches } from './cache';

/**
 * Stripe Product Update Handler
 *
 * Handles PUT /products/:id requests to update an existing Stripe product.
 * Requires authentication if API_SECRET_KEY is set.
 *
 * @module update-product
 */

/**
 * Inner handler for updating products.
 * Exported for testing with mocked Stripe instances.
 */
export async function handleUpdateProduct(stripe: Stripe, request: Request, env: Env, origin: string | null): Promise<Response> {
	try {
		// Extract product ID from URL using regex
		const url = new URL(request.url);
		const productIdMatch = url.pathname.match(/\/products\/([^/]+)/);
		const productId = productIdMatch ? productIdMatch[1] : null;

		if (!productId) {
			return jsonResponse({ error: 'Product ID is required' }, 400, origin, env);
		}

		const updates = (await request.json()) as Stripe.ProductUpdateParams;

		if (Object.keys(updates).length === 0) {
			return jsonResponse({ error: 'No update data provided' }, 400, origin, env);
		}

		// Validate URLs in update data
		if (updates.url && !isValidUrl(updates.url)) {
			return jsonResponse({ error: 'Invalid product URL' }, 400, origin, env);
		}

		if (updates.images && Array.isArray(updates.images)) {
			for (const imageUrl of updates.images) {
				if (!isValidUrl(imageUrl)) {
					return jsonResponse({ error: `Invalid image URL: ${imageUrl}` }, 400, origin, env);
				}
			}
		}

		const product = await stripe.products.update(productId, updates);
		await invalidateProductCaches(request);

		return jsonResponse(product, 200, origin, env);
	} catch (error: any) {
		console.error('Update product error:', error);
		const statusCode = error.statusCode || 500;
		const message = statusCode < 500 ? error.message || 'An error occurred' : 'An error occurred';
		return jsonResponse({ error: message }, statusCode, origin, env);
	}
}

/**
 * Export default fetch handler for PUT /products/:id endpoint
 * Updates a Stripe product with validation for URLs
 *
 * @type {ExportedHandler<Env>}
 * @param {Stripe} stripe - Initialized Stripe client
 * @param {Request} request - Incoming HTTP request with update data
 * @param {Env} env - Cloudflare Worker environment variables
 * @param {string | null} origin - Request origin for CORS headers
 * @returns {Promise<Response>} JSON response with updated product
 *
 * @example
 * // Request body:
 * // {
 * //   "name": "Updated Product Name",
 * //   "description": "Updated description"
 * // }
 */
export default {
	fetch: withStripeHandler('PUT', handleUpdateProduct),
} satisfies ExportedHandler<Env>;
