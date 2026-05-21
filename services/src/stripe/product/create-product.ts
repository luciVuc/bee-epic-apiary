import { withStripeHandler } from '../../utils';
import Stripe from 'stripe';
import { jsonResponse, isValidUrl } from '../../utils';

export async function handleCreateProduct(stripe: Stripe, request: Request, env: Env, origin: string | null): Promise<Response> {
	try {
		const productData = (await request.json()) as Stripe.ProductCreateParams;

		if (!productData.name || typeof productData.name !== 'string' || productData.name.trim() === '') {
			return jsonResponse({ error: 'Product name is required and must be a non-empty string' }, 400, origin, env);
		}

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
	} catch (error: any) {
		console.error('Create product error:', error);
		const statusCode = error.statusCode || 500;
		const message = statusCode < 500 ? error.message || 'An error occurred' : 'An error occurred';
		return jsonResponse({ error: message }, statusCode, origin, env);
	}
}

export default {
	fetch: withStripeHandler('POST', handleCreateProduct, { requireAuth: true }),
} satisfies ExportedHandler<Env>;
