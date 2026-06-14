import Stripe from 'stripe';
import { handleCORS, isAllowedOrigin, jsonResponse, RateLimiter, checkAuth } from '.';
import type { HttpMethod } from './handleCORS';
import { IAPIResponseError } from '../types';

let stripeInstance: Stripe | null = null;

/**
 * Gets or initializes a lazy singleton Stripe client instance.
 * Uses `STRIPE_SECRET_KEY` from env and a fixed API version.
 */
function getStripeInstance(env: Env): Stripe {
	if (!stripeInstance) {
		stripeInstance = new Stripe(env.STRIPE_SECRET_KEY, {
			apiVersion: '2026-05-27.dahlia',
			httpClient: Stripe.createFetchHttpClient(),
		});
	}
	return stripeInstance;
}

/** Handler function type for Stripe endpoints. Receives an initialized Stripe client, request, env bindings, and the CORS origin. */
export type StripeHandler = (stripe: Stripe, request: Request, env: Env, origin: string | null) => Promise<Response>;

/** Options for configuring the withStripeHandler wrapper. */
export interface IWithStripeHandlerOptions {
	/** If true, requires a valid API key via Authorization: Bearer <token>. */
	requireAuth?: boolean;
}

/**
 * Wraps a Stripe handler function with common middleware:
 * CORS preflight, method validation, origin validation, optional API key auth, KV rate limiting, and Stripe client initialization.
 *
 * @param method - Allowed HTTP method for the route
 * @param handler - The Stripe handler function to wrap
 * @param options - Optional configuration (e.g., requireAuth)
 * @returns A fetch-compatible function (request, env) => Promise<Response>
 */
export function withStripeHandler(method: HttpMethod, handler: StripeHandler, options?: IWithStripeHandlerOptions) {
	return async (request: Request, env: Env): Promise<Response> => {
		if (request.method === 'OPTIONS') {
			return handleCORS(request, env, method);
		}

		if (request.method !== method) {
			return jsonResponse({ error: 'Method not allowed' }, 405);
		}

		const origin = request.headers.get('Origin');
		if (!isAllowedOrigin(origin, env)) {
			return jsonResponse({ error: 'Forbidden' }, 403, origin, env);
		}

		if (options?.requireAuth) {
			const auth = checkAuth(request, env);
			if (!auth.authenticated) return auth.error!;
		}

		if (env.RATE_LIMIT_KV) {
			const url = new URL(request.url);
			const clientIP =
				(request as Request<unknown, IncomingRequestCfProperties>).cf?.connectingIp || request.headers.get('CF-Connecting-IP') || 'unknown';
			const rateLimiter = new RateLimiter(env.RATE_LIMIT_KV, {
				maxRequests: parseInt(env.RATE_LIMIT_MAX, 10),
				windowSeconds: parseInt(env.RATE_LIMIT_WINDOW, 10),
			});
			const result = await rateLimiter.check(`${clientIP}:${method}:${url.pathname}`);
			if (!result.allowed) {
				return jsonResponse({ error: 'Rate limit exceeded' }, 429, origin, env);
			}
		}

		try {
			const stripe = getStripeInstance(env);
			return await handler(stripe, request, env, origin);
		} catch (error: unknown) {
			const err = error as IAPIResponseError;
			console.error('Stripe error:', err);
			const statusCode = err.statusCode || 500;
			return jsonResponse({ error: 'An error occurred' }, statusCode, origin, env);
		}
	};
}

export default withStripeHandler;
