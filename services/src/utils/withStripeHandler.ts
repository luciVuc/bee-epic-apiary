import Stripe from 'stripe';
import { handleCORS, isAllowedOrigin, jsonResponse, RateLimiter } from '.';
import type { HttpMethod } from './handleCORS';

const RATE_LIMIT_MAX = 100; // requests per minute
const RATE_LIMIT_WINDOW = 60; // seconds (1 minute)

// Cache Stripe instance per worker instance (module scope)
let stripeInstance: Stripe | null = null;

/**
 * Gets or creates a cached Stripe instance.
 * Reuses the same instance across requests to avoid unnecessary initialization.
 *
 * @param {string} secretKey - Stripe secret key for authentication
 * @returns {Stripe} Initialized Stripe client instance
 */
export function getStripeInstance(secretKey: string): Stripe {
	if (!stripeInstance) {
		stripeInstance = new Stripe(secretKey, {
			apiVersion: '2026-04-22.dahlia',
			httpClient: Stripe.createFetchHttpClient(),
		});
	}
	return stripeInstance;
}

/**
 * Type definition for Stripe handler functions that process requests after middleware.
 *
 * @typedef {Function} StripeHandler
 * @param {Stripe} stripe - Initialized Stripe client
 * @param {Request} request - Incoming HTTP request
 * @param {Env} env - Cloudflare Worker environment variables
 * @param {string | null} origin - Request origin for CORS headers
 * @returns {Promise<Response>} HTTP response from the handler
 */
type StripeHandler = (stripe: Stripe, request: Request, env: Env, origin: string | null) => Promise<Response>;

/**
 * Wrapper function for Stripe handlers that adds common middleware.
 * Handles CORS preflight, method validation, origin validation, rate limiting, and Stripe initialization.
 *
 * @param {HttpMethod} method - HTTP method this handler accepts
 * @param {StripeHandler} handler - The actual request handler to execute after middleware
 * @returns {Function} A fetch handler function that wraps the provided handler with middleware
 *
 * @example
 * export default {
 *   fetch: withStripeHandler('POST', async (stripe, request, env, origin) => {
 *     // Your handler logic here
 *     return jsonResponse({ success: true }, 200, origin, env);
 *   }),
 * } satisfies ExportedHandler<Env>;
 */
export function withStripeHandler(
	method: HttpMethod,
	handler: (stripe: Stripe, request: Request, env: Env, origin: string | null) => Promise<Response>,
	stripeInstance?: Stripe, // Optional: for testing
) {
	return async (request: Request, env: Env): Promise<Response> => {
		// Handle CORS preflight
		if (request.method === 'OPTIONS') {
			return handleCORS(request, env, method);
		}

		// Only allow specified method
		if (request.method !== method) {
			return jsonResponse({ error: 'Method not allowed' }, 405);
		}

		// Validate origin
		const origin = request.headers.get('Origin');
		if (!isAllowedOrigin(origin, env)) {
			return jsonResponse({ error: 'Forbidden' }, 403);
		}

		// Rate limiting (if KV binding is available)
		if (env.RATE_LIMIT_KV) {
			const clientIP = (request as any).cf?.connectingIp || request.headers.get('CF-Connecting-IP') || 'unknown';
			const rateLimiter = new RateLimiter(env.RATE_LIMIT_KV, {
				maxRequests: RATE_LIMIT_MAX,
				windowSeconds: RATE_LIMIT_WINDOW,
			});
			const result = await rateLimiter.check(`${clientIP}:${method}`);
			if (!result.allowed) {
				return jsonResponse({ error: 'Rate limit exceeded' }, 429, origin, env);
			}
		}

		try {
			// Get or create Stripe instance (use provided instance for testing)
			const stripe = stripeInstance || getStripeInstance(env.STRIPE_SECRET_KEY);

			return await handler(stripe, request, env, origin);
		} catch (error: any) {
			console.error('Stripe error:', error);
			const statusCode = error.statusCode || 500;
			const message = statusCode < 500 ? error.message || 'An error occurred' : 'An error occurred';
			return jsonResponse({ error: message }, statusCode, origin, env);
		}
	};
}

export default withStripeHandler;
