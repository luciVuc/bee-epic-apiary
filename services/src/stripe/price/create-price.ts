// workers/create-price.ts
import Stripe from 'stripe';
import { jsonResponse, isValidUrl, withStripeHandler } from '../../utils';

/**
 * Stripe Price Create Handler
 *
 * Handles POST /prices requests to create a new Stripe price for a product.
 * Requires authentication if API_SECRET_KEY is set.
 *
 * @module create-price
 */

/**
 * Inner handler for creating prices.
 * Exported for testing with mocked Stripe instances.
 */
export async function handleCreatePrice(stripe: Stripe, request: Request, env: Env, origin: string | null): Promise<Response> {
	try {
		// Parse request body
		const priceData = (await request.json()) as Stripe.PriceCreateParams;

		// Basic validation
		if (!priceData.product || typeof priceData.product !== 'string') {
			return jsonResponse({ error: 'Product ID is required' }, 400, origin, env);
		}

		if (!priceData.unit_amount || priceData.unit_amount <= 0) {
			return jsonResponse({ error: 'Valid unit_amount is required' }, 400, origin, env);
		}

		if (!priceData.currency || typeof priceData.currency !== 'string') {
			return jsonResponse({ error: 'Currency is required' }, 400, origin, env);
		}

		// Validate lookup_key if provided
		if (priceData.lookup_key && typeof priceData.lookup_key !== 'string') {
			return jsonResponse({ error: 'lookup_key must be a string' }, 400, origin, env);
		}

		const price = await stripe.prices.create(priceData);
		return jsonResponse(price, 201, origin, env);
	} catch (error: any) {
		console.error('Create price error:', error);
		const statusCode = error.statusCode || 500;
		const message = statusCode < 500 ? error.message || 'An error occurred' : 'An error occurred';
		return jsonResponse({ error: message }, statusCode, origin, env);
	}
}

/**
 * Export default fetch handler for POST /prices endpoint
 * Creates a new Stripe price with validation
 *
 * @type {ExportedHandler<Env>}
 * @param {Stripe} stripe - Initialized Stripe client
 * @param {Request} request - Incoming HTTP request with price data
 * @param {Env} env - Cloudflare Worker environment variables
 * @param {string | null} origin - Request origin for CORS headers
 * @returns {Promise<Response>} JSON response with created price
 *
 * @example
 * // Request body:
 * // {
 * //   "product": "prod_123",
 * //   "unit_amount": 2000,
 * //   "currency": "usd",
 * //   "lookup_key": "premium_monthly"
 * // }
 */
export default {
	fetch: withStripeHandler('POST', handleCreatePrice),
} satisfies ExportedHandler<Env>;
