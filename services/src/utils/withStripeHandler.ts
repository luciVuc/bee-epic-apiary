import Stripe from 'stripe';
import { handleCORS, isAllowedOrigin, jsonResponse, RateLimiter, checkAuth } from '.';
import type { HttpMethod } from './handleCORS';

const RATE_LIMIT_MAX = 100;
const RATE_LIMIT_WINDOW = 60;

type StripeHandler = (stripe: Stripe, request: Request, env: Env, origin: string | null) => Promise<Response>;

interface WithStripeHandlerOptions {
	requireAuth?: boolean;
}

export function withStripeHandler(method: HttpMethod, handler: StripeHandler, options?: WithStripeHandlerOptions) {
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
			const clientIP = (request as any).cf?.connectingIp || request.headers.get('CF-Connecting-IP') || 'unknown';
			const rateLimiter = new RateLimiter(env.RATE_LIMIT_KV, {
				maxRequests: RATE_LIMIT_MAX,
				windowSeconds: RATE_LIMIT_WINDOW,
			});
			const result = await rateLimiter.check(`${clientIP}:${method}:${url.pathname}`);
			if (!result.allowed) {
				return jsonResponse({ error: 'Rate limit exceeded' }, 429, origin, env);
			}
		}

		try {
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
