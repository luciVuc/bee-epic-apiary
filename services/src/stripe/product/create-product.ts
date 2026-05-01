// workers/create-product.ts
import { withStripeHandler } from '../../utils';
import Stripe from 'stripe';
import { jsonResponse, isValidUrl } from '../../utils';

export default {
	fetch: withStripeHandler('POST', async (stripe: Stripe, request: Request, env: Env, origin: string | null) => {
		// Parse request body
		const productData = (await request.json()) as Stripe.ProductCreateParams;

		// Basic validation
		if (!productData.name || typeof productData.name !== 'string' || productData.name.trim() === '') {
			return jsonResponse({ error: 'Product name is required and must be a non-empty string' }, 400, origin, env);
		}

		// Validate URLs in product data
		if (productData.url && !isValidUrl(productData.url)) {
			return jsonResponse({ error: 'Invalid product URL' }, 400, origin, env);
		}

		if (productData.images && Array.isArray(productData.images)) {
			for (const imageUrl of productData.images) {
				if (!isValidUrl(imageUrl)) {
					return jsonResponse({ error: `Invalid image URL: ${imageUrl}` }, 400, origin, env);
				}
			}
		}

		const product = await stripe.products.create(productData);
		return jsonResponse(product, 200, origin, env);
	}),
} satisfies ExportedHandler<Env>;
