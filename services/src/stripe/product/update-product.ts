import Stripe from 'stripe';
import { EStaffRole, ENotificationType, ProductUpdateRequestSchema } from '@bee-epic/shared';
import { jsonOk, jsonErr, withStripeHandler, stripeErrorResponse } from '../../utils';
import { invalidateProductStatsCache } from './get-products-stats';

/**
 * PUT /products/:id — update a Stripe product (requires MANAGER).
 *
 * Validates the body against `ProductUpdateRequestSchema` (strict-mode, so
 * unknown fields are rejected) and refuses empty updates. On success it
 * invalidates the product stats cache — inStock/featured/category edits feed
 * the dashboard aggregation — and fires a best-effort PRODUCT_UPDATED
 * notification so connected clients refresh.
 */
export async function handleUpdateProduct(stripe: Stripe, request: Request, env: Env, origin: string | null): Promise<Response> {
	const url = new URL(request.url);
	const productIdMatch = url.pathname.match(/\/products\/([^/]+)/);
	const productId = productIdMatch ? productIdMatch[1] : null;

	if (!productId) {
		return jsonErr({ code: 'VALIDATION_FAILED', fields: { id: 'Product ID is required' } }, origin, env);
	}

	const rawBody = (await request.json()) as unknown;
	const parsed = ProductUpdateRequestSchema.safeParse(rawBody);
	if (!parsed.success) {
		// Strict-mode rejects unknown fields so a future Stripe API addition can't
		// be smuggled through without a deliberate code change (review I14).
		// fieldErrors is Record<string, string[]>; the VALIDATION_FAILED envelope
		// wants Record<string, string>, so join each field's messages.
		const flat = parsed.error.flatten().fieldErrors as Record<string, string[] | undefined>;
		const fields = Object.fromEntries(Object.entries(flat).map(([k, v]) => [k, (v ?? []).join('; ')]));
		return jsonErr({ code: 'VALIDATION_FAILED', fields }, origin, env);
	}
	const updates = parsed.data;

	if (Object.keys(updates).length === 0) {
		return jsonErr({ code: 'VALIDATION_FAILED', fields: { body: 'No update data provided' } }, origin, env);
	}

	let product: Stripe.Product;
	try {
		product = await stripe.products.update(productId, updates as Stripe.ProductUpdateParams);
	} catch (error) {
		return stripeErrorResponse(error, origin, env, `product:${productId}`);
	}

	// Updates can change inStock/featured/category, all of which feed into the
	// /products/stats aggregation. Invalidate the cache so the next dashboard
	// load reflects the change (review I12).
	await invalidateProductStatsCache(env);

	try {
		const stub = env.NOTIFICATION_HUB.getByName('default');
		await stub.notify({ type: ENotificationType.PRODUCT_UPDATED, productId });
	} catch (error) {
		console.error('Failed to send product-updated notification:', error);
	}

	return jsonOk(product, origin, env);
}

export default {
	fetch: withStripeHandler('PUT', handleUpdateProduct, { requiredRole: EStaffRole.MANAGER }),
} satisfies ExportedHandler<Env>;
