import Stripe from 'stripe';
import { handleCORS, isAllowedOrigin, jsonResponse, RateLimiter, checkAuth } from '.';
import type { HttpMethod } from './handleCORS';
import { IAPIResponseError } from '../types';

let stripeInstance: Stripe | null = null;

function getStripeInstance(env: Env): Stripe {
	if (!stripeInstance) {
		stripeInstance = new Stripe(env.STRIPE_SECRET_KEY, {
			apiVersion: '2026-05-27.dahlia',
			httpClient: Stripe.createFetchHttpClient(),
		});
	}
	return stripeInstance;
}

export type StripeHandler = (stripe: Stripe, request: Request, env: Env, origin: string | null) => Promise<Response>;

export interface IWithStripeHandlerOptions {
	requireAuth?: boolean;
}

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
