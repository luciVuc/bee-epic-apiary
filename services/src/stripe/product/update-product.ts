import Stripe from 'stripe';
import { jsonResponse, isValidUrl, withStripeHandler } from '../../utils';
import { IAPIResponseError } from '../../types';

export async function handleUpdateProduct(stripe: Stripe, request: Request, env: Env, origin: string | null): Promise<Response> {
	try {
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

		if (updates.url && !isValidUrl(updates.url)) {
			return jsonResponse({ error: 'Invalid product URL' }, 400, origin, env);
		}

		if (updates.images && Array.isArray(updates.images)) {
			for (const imageUrl of updates.images) {
				if (!isValidUrl(imageUrl)) {
					return jsonResponse({ error: `Invalid image URL: ${imageUrl}` }, 400, origin, env);
				}
			}
		}

		const product = await stripe.products.update(productId, updates);

		return jsonResponse(product, 200, origin, env);
	} catch (error: unknown) {
		const err = error as IAPIResponseError;
		console.error('Update product error:', err);
		const statusCode = err.statusCode || 500;
		const message = statusCode < 500 ? err.message || 'An error occurred' : 'An error occurred';
		return jsonResponse({ error: message }, statusCode, origin, env);
	}
}

export default {
	fetch: withStripeHandler('PUT', handleUpdateProduct, { requireAuth: true }),
} satisfies ExportedHandler<Env>;
