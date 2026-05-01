// workers/update-product.ts
import { withStripeHandler } from '../../utils';
import Stripe from 'stripe';
import { jsonResponse } from '../../utils';

export default {
	fetch: withStripeHandler('PUT', async (stripe: Stripe, request: Request, env: Env, origin: string | null) => {
		// Extract product ID from URL using regex
		const url = new URL(request.url);
		const productIdMatch = url.pathname.match(/\/products\/([^/]+)/);
		const productId = productIdMatch ? productIdMatch[1] : null;

		if (!productId) {
			return jsonResponse({ error: 'Product ID is required' }, 400, origin, env);
		}

		const updates = (await request.json()) as Stripe.ProductUpdateParams;

		if (Object.keys(updates).length === 0) {
			return jsonResponse({ error: 'No update data provided' }, 400, origin, env);
		}

		const product = await stripe.products.update(productId, updates);

		return jsonResponse(product, 200, origin, env);
	}),
} satisfies ExportedHandler<Env>;
