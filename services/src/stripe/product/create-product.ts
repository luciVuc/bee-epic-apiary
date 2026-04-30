// workers/create-product.ts
import Stripe from 'stripe';
import { handleCORS, isAllowedOrigin, jsonResponse } from '../../utils';

export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		// Handle CORS preflight
		if (request.method === 'OPTIONS') {
			return handleCORS(request, env, 'POST');
		}

		// Only allow POST
		if (request.method !== 'POST') {
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

			// Parse request body
			const productData = (await request.json()) as Stripe.ProductCreateParams;

			const product = await stripe.products.create(productData);

			return jsonResponse(product, 200, origin, env);
		} catch (error: any) {
			console.error('Stripe error:', error);

			return jsonResponse(
				{
					error: error.message || 'Failed to create product',
				},
				error.statusCode || 400,
				origin,
				env,
			);
		}
	},
} satisfies ExportedHandler<Env>;
