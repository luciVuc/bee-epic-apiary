// workers/delete-product.ts
import { withStripeHandler } from '../../utils';
import Stripe from 'stripe';
import { jsonResponse } from '../../utils';

/**
 * Stripe Product Delete Handler
 *
 * Handles DELETE /products/:id requests to delete a Stripe product.
 * Requires authentication if API_SECRET_KEY is set.
 *
 * @module delete-product
 */

/**
 * Inner handler for deleting products.
 * Exported for testing with mocked Stripe instances.
 */
export async function handleDeleteProduct(stripe: Stripe, request: Request, env: Env, origin: string | null): Promise<Response> {
	try {
		// Extract product ID from URL using regex
		const url = new URL(request.url);
		const productIdMatch = url.pathname.match(/\/products\/([^/]+)/);
		const productId = productIdMatch ? productIdMatch[1] : null;

		if (!productId) {
			return jsonResponse({ error: 'Product ID is required' }, 400, origin, env);
		}

		const deleted = await stripe.products.del(productId);
		return jsonResponse(deleted, 200, origin, env);
	} catch (error: any) {
		console.error('Delete product error:', error);
		const statusCode = error.statusCode || 500;
		const message = statusCode < 500 ? error.message || 'An error occurred' : 'An error occurred';
		return jsonResponse({ error: message }, statusCode, origin, env);
	}
}

/**
 * Export default fetch handler for DELETE /products/:id endpoint
 * Deletes a Stripe product by ID
 *
 * @type {ExportedHandler<Env>}
 * @param {Stripe} stripe - Initialized Stripe client
 * @param {Request} request - Incoming HTTP request
 * @param {Env} env - Cloudflare Worker environment variables
 * @param {string | null} origin - Request origin for CORS headers
 * @returns {Promise<Response>} JSON response with deletion confirmation
 */
export default {
	fetch: withStripeHandler('DELETE', handleDeleteProduct),
} satisfies ExportedHandler<Env>;
