import Stripe from 'stripe';
import { handleCORS, isAllowedOrigin, jsonResponse, RateLimiter } from '.';
import type { HttpMethod } from './handleCORS';

const RATE_LIMIT_MAX = 100; // requests
const RATE_LIMIT_WINDOW = 60; // seconds (1 minute)

// Cache Stripe instance per worker instance
let stripeInstance: Stripe | null = null;

function getStripeInstance(secretKey: string): Stripe {
	if (!stripeInstance) {
		stripeInstance = new Stripe(secretKey, {
			apiVersion: '2026-04-22.dahlia',
			httpClient: Stripe.createFetchHttpClient(),
		});
	}
	return stripeInstance;
}

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
			// Get or create Stripe instance (cached in module scope)
			const stripe = getStripeInstance(env.STRIPE_SECRET_KEY);

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
