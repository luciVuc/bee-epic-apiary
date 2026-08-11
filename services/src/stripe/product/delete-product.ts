import Stripe from 'stripe';
import { EStaffRole, ENotificationType } from '@bee-epic/shared';
import { jsonOk, jsonErr, withStripeHandler, stripeErrorResponse } from '../../utils';
import { IApiUpstreamError } from '../../types';
import { invalidateProductCountCache } from './shared';
import { invalidateProductStatsCache } from './get-products-stats';

/**
 * Archive a product and all of its active prices (soft delete). Used as the
 * fallback when Stripe refuses a permanent delete — a product that has a price
 * with transaction history cannot be deleted, only archived. Returns the list
 * of archived price IDs.
 */
export async function archiveProduct(
	stripe: Stripe,
	productId: string,
): Promise<{ archivedProduct: Stripe.Product; archivedPrices: string[] }> {
	// default_price must be cleared before its price can be archived.
	const product = await stripe.products.retrieve(productId);
	if (product.default_price) {
		await stripe.products.update(productId, { default_price: null as unknown as string });
	}

	const activePrices = await stripe.prices.list({ product: productId, active: true, limit: 100 });

	const archivedPrices: string[] = [];
	for (const price of activePrices.data) {
		try {
			const archivedPrice = await stripe.prices.update(price.id, { active: false });
			archivedPrices.push(archivedPrice.id);
		} catch (priceError: unknown) {
			const priceErr = priceError as IApiUpstreamError;
			if (priceErr.message?.includes('default price')) {
				await stripe.products.update(productId, { default_price: null as unknown as string });
				const archivedPrice = await stripe.prices.update(price.id, { active: false });
				archivedPrices.push(archivedPrice.id);
			} else {
				throw priceError;
			}
		}
	}

	const archivedProduct = await stripe.products.update(productId, { active: false });
	return { archivedProduct, archivedPrices };
}

/**
 * DELETE /products/:id — permanently delete a product on Stripe.
 *
 * Stripe only allows deleting a product that has no price with transaction
 * history; otherwise `products.del` throws. We attempt the hard delete first
 * and, when Stripe refuses, fall back to archiving (active=false) so the
 * product is still removed from the storefront. The response reports which
 * path was taken via `deleted` / `archived` flags.
 */
export async function handleDeleteProduct(stripe: Stripe, request: Request, env: Env, origin: string | null): Promise<Response> {
	const url = new URL(request.url);
	const productIdMatch = url.pathname.match(/\/products\/([^/]+)/);
	const productId = productIdMatch ? productIdMatch[1] : null;

	if (!productId) {
		return jsonErr({ code: 'VALIDATION_FAILED', fields: { id: 'Product ID is required' } }, origin, env);
	}

	let product: Stripe.Product;
	try {
		product = await stripe.products.retrieve(productId);
	} catch (error: unknown) {
		const retrieveErr = error as IApiUpstreamError;
		if (retrieveErr.code === 'resource_missing') {
			return jsonErr({ code: 'NOT_FOUND', resource: `product:${productId}` }, origin, env);
		}
		return stripeErrorResponse(error, origin, env, `product:${productId}`);
	}

	try {
		// Try a permanent delete first.
		let deleted = false;
		let archivedProduct: Stripe.Product | undefined;
		let archivedPrices: string[] = [];

		try {
			const result = await stripe.products.del(productId);
			deleted = result.deleted === true;
			if (!deleted) {
				// Extremely unlikely, but be defensive: fall through to archive.
				throw new Error('Stripe returned deleted=false');
			}
		} catch (delError: unknown) {
			// Stripe won't delete products that have prices/transaction history.
			// A 400/invalid_request here means "can't delete" → archive instead.
			// A 404 (already gone) should surface as NOT_FOUND, not an archive.
			const delErr = delError as IApiUpstreamError;
			if (delErr.code === 'resource_missing') {
				return jsonErr({ code: 'NOT_FOUND', resource: `product:${productId}` }, origin, env);
			}
			if (!product.active) {
				// Already archived and can't be hard-deleted — nothing left to do.
				return jsonOk({ deleted: false, archived: true, product, message: 'Product was already archived' }, origin, env);
			}
			const result = await archiveProduct(stripe, productId);
			archivedProduct = result.archivedProduct;
			archivedPrices = result.archivedPrices;
		}

		await invalidateProductCountCache(env);
		await invalidateProductStatsCache(env);

		try {
			const stub = env.NOTIFICATION_HUB.getByName('default');
			await stub.notify({ type: ENotificationType.PRODUCT_DELETED, productId });
		} catch (error) {
			console.error('Failed to send product-deleted notification:', error);
		}

		if (deleted) {
			return jsonOk({ deleted: true, archived: false, id: productId, message: 'Product permanently deleted' }, origin, env);
		}

		return jsonOk(
			{
				deleted: false,
				archived: true,
				archived_product: archivedProduct,
				archived_prices: archivedPrices,
				archived_prices_count: archivedPrices.length,
				message: 'Product could not be permanently deleted (it has transaction history) and was archived instead.',
			},
			origin,
			env,
		);
	} catch (error) {
		return stripeErrorResponse(error, origin, env, `product:${productId}`);
	}
}

export default {
	fetch: withStripeHandler('DELETE', handleDeleteProduct, { requiredRole: EStaffRole.MANAGER }),
} satisfies ExportedHandler<Env>;
