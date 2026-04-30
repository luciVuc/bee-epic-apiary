import Stripe from 'stripe';
import { handleCORS, isAllowedOrigin, jsonResponse } from '.';
import type { HttpMethod } from './handleCORS';

const RATE_LIMIT_MAX = 100; // requests
const RATE_LIMIT_WINDOW = 60; // seconds (1 minute)

export function withStripeHandler(
	method: HttpMethod,
	handler: (stripe: Stripe, request: Request, env: Env, origin: string | null) => Promise<Response>,
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
			const clientIP = request.headers.get('CF-Connecting-IP') || 'unknown';
			const kvKey = `rate_limit:${clientIP}:${method}`;
			const currentCountStr = await env.RATE_LIMIT_KV.get(kvKey);
			const currentCount = currentCountStr ? parseInt(currentCountStr, 10) : 0;

			if (currentCount >= RATE_LIMIT_MAX) {
				return jsonResponse({ error: 'Rate limit exceeded' }, 429, origin, env);
			}

			await env.RATE_LIMIT_KV.put(kvKey, (currentCount + 1).toString(), {
				expirationTtl: RATE_LIMIT_WINDOW,
			});
		}

		try {
			// Initialize Stripe
			const stripe = new Stripe(env.STRIPE_SECRET_KEY, {
				apiVersion: '2026-04-22.dahlia',
				httpClient: Stripe.createFetchHttpClient(),
			});

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
