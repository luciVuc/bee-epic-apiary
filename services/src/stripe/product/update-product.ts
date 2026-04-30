// workers/update-product.ts
import Stripe from 'stripe';
import { handleCORS, isAllowedOrigin, jsonResponse } from '../../utils';

export default {
	async fetch(request: Request, env: any): Promise<Response> {
		// Handle CORS preflight
		if (request.method === 'OPTIONS') {
			return handleCORS(request, env, 'PUT');
		}

		// Only allow PUT
		if (request.method !== 'PUT') {
			return jsonResponse({ error: 'Method not allowed' }, 405);
		}

		// Validate origin
		const origin = request.headers.get('Origin');
		if (!isAllowedOrigin(origin, env)) {
			return jsonResponse({ error: 'Forbidden' }, 403);
		}

		try {
			// Initialize Stripe
			const stripe = new Stripe(env.STRIPE_SECRET_KEY, {
				apiVersion: '2026-04-22.dahlia',
				httpClient: Stripe.createFetchHttpClient(),
			});

			// Extract product ID from URL
			const url = new URL(request.url);
			const pathParts = url.pathname.split('/');
			const productId = pathParts[pathParts.length - 1];

			if (!productId) {
				return new Response(JSON.stringify({ error: 'Product ID is required' }), {
					status: 400,
					headers: {
						'Content-Type': 'application/json',
						'Access-Control-Allow-Origin': '*',
					},
				});
			}

			const updates = (await request.json()) as Stripe.ProductUpdateParams;
			const product = await stripe.products.update(productId, updates);

			return new Response(JSON.stringify(product), {
				headers: {
					'Content-Type': 'application/json',
					'Access-Control-Allow-Origin': '*',
				},
			});
		} catch (error: any) {
			return new Response(JSON.stringify({ error: error.message }), {
				status: 400,
				headers: {
					'Content-Type': 'application/json',
					'Access-Control-Allow-Origin': '*',
				},
			});
		}
	},
};
