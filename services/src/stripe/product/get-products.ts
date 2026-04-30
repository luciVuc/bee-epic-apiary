// workers/get-products.ts
import Stripe from 'stripe';
import { handleCORS, isAllowedOrigin, jsonResponse } from '../../utils';

export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		// Handle CORS preflight
		if (request.method === 'OPTIONS') {
			return handleCORS(request, env, 'GET');
		}

		// Only allow GET
		if (request.method !== 'GET') {
			return jsonResponse({ error: 'Method not allowed' }, 405);
		}

		// Validate origin
		const origin = request.headers.get('Origin');
		if (!isAllowedOrigin(origin, env)) {
			return jsonResponse({ error: 'Forbidden' }, 403);
		}

		try {
			// Extract product ID from URL if present
			const url = new URL(request.url);
			const pathParts = url.pathname.split('/');
			const productId = pathParts[pathParts.length - 1];

			// Initialize Stripe
			const stripe = new Stripe(env.STRIPE_SECRET_KEY, {
				apiVersion: '2026-04-22.dahlia',
				httpClient: Stripe.createFetchHttpClient(),
			});

			let result;
			if (productId && productId !== 'products') {
				// Get single product
				result = (await stripe.products.retrieve(productId)) as Stripe.Response<Stripe.Product>;
			} else {
				// Get all products
				result = (await stripe.products.list()) as Stripe.Response<Stripe.ApiList<Stripe.Product>>;
			}

			return jsonResponse(result, 200, origin, env);
		} catch (error: any) {
			console.error('Stripe error:', error);

			return jsonResponse({ error: error.message }, 400, origin, env);
		}
	},
} satisfies ExportedHandler<Env>;
