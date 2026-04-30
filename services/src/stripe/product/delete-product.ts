// workers/delete-product.ts
import Stripe from 'stripe';
import { handleCORS, isAllowedOrigin, jsonResponse } from '../../utils';

export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		// Handle CORS preflight
		if (request.method === 'OPTIONS') {
			return handleCORS(request, env, 'DELETE');
		}

		// Only allow DELETE
		if (request.method !== 'DELETE') {
			return jsonResponse({ error: 'Method not allowed' }, 405);
		}

		// Validate origin
		const origin = request.headers.get('Origin');
		if (!isAllowedOrigin(origin, env)) {
			return jsonResponse({ error: 'Forbidden' }, 403);
		}

		try {
			// Extract product ID from URL
			const url = new URL(request.url);
			const pathParts = url.pathname.split('/');
			const productId = pathParts[pathParts.length - 1];

			// Initialize Stripe
			const stripe = new Stripe(env.STRIPE_SECRET_KEY, {
				apiVersion: '2026-04-22.dahlia',
				httpClient: Stripe.createFetchHttpClient(),
			});

			if (!productId) {
				return jsonResponse({ error: 'Product ID is required' }, 400);
			}

			const deleted = await stripe.products.del(productId);

			// Return session URL
			return jsonResponse(deleted, 200, origin, env);
		} catch (error: any) {
			console.error('Stripe error:', error);

			return jsonResponse(
				{
					error: error.message || 'Failed to delete product',
				},
				error.statusCode || 400,
				origin,
				env,
			);
		}
	},
};
