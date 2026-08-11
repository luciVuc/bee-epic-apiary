import Stripe from 'stripe';
import { EStaffRole } from '@bee-epic/shared';
import { jsonOk, jsonErr, isValidUrl, withStripeHandler, stripeErrorResponse } from '../../utils';
import { invalidateProductCountCache } from './shared';
import { invalidateProductStatsCache } from './get-products-stats';

/**
 * POST /products — create a Stripe product (requires MANAGER).
 *
 * Validates name and any URLs (product `url` + each `images[]` entry) up front
 * before touching Stripe, then invalidates the product count and stats caches
 * so the next listing/dashboard load reflects the new product. Returns 201.
 */
export async function handleCreateProduct(stripe: Stripe, request: Request, env: Env, origin: string | null): Promise<Response> {
	const productData = (await request.json()) as Stripe.ProductCreateParams;

	if (!productData.name || typeof productData.name !== 'string' || productData.name.trim() === '') {
		return jsonErr({ code: 'VALIDATION_FAILED', fields: { name: 'Product name is required' } }, origin, env);
	}

	if (productData.url && !isValidUrl(productData.url)) {
		return jsonErr({ code: 'VALIDATION_FAILED', fields: { url: 'Invalid product URL' } }, origin, env);
	}

	if (productData.images && Array.isArray(productData.images)) {
		for (const imageUrl of productData.images) {
			if (!isValidUrl(imageUrl)) {
				return jsonErr({ code: 'VALIDATION_FAILED', fields: { images: `Invalid image URL: ${imageUrl}` } }, origin, env);
			}
		}
	}

	try {
		const product = await stripe.products.create(productData);
		await invalidateProductCountCache(env);
		await invalidateProductStatsCache(env);
		return jsonOk(product, origin, env, 201);
	} catch (error) {
		return stripeErrorResponse(error, origin, env);
	}
}

export default {
	fetch: withStripeHandler('POST', handleCreateProduct, { requiredRole: EStaffRole.MANAGER }),
} satisfies ExportedHandler<Env>;
