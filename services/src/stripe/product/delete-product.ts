// workers/delete-product.ts
import { withStripeHandler } from '../../utils';
import Stripe from 'stripe';
import { jsonResponse } from '../../utils';

export default {
	fetch: withStripeHandler('DELETE', async (stripe: Stripe, request: Request, env: Env, origin: string | null) => {
		// Extract product ID from URL
		const url = new URL(request.url);
		const pathParts = url.pathname.split('/');
		const productId = pathParts[pathParts.length - 1];

		if (!productId) {
			return jsonResponse({ error: 'Product ID is required' }, 400, origin, env);
		}

		const deleted = await stripe.products.del(productId);
		return jsonResponse(deleted, 200, origin, env);
	}),
};
