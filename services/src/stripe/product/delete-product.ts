// workers/delete-product.ts
import { withStripeHandler } from '../../utils';
import Stripe from 'stripe';
import { jsonResponse } from '../../utils';
import { invalidateProductCaches } from './cache';

/**
 * Stripe Product Delete Handler
 *
 * Handles DELETE /products/:id requests to delete a Stripe product.
 * Requires authentication if API_SECRET_KEY is set.
 *
 * @module delete-product
 */

/**
 * Inner handler for archiving products.
 * Exported for testing with mocked Stripe instances.
 */
export async function handleDeleteProduct(stripe: Stripe, request: Request, env: Env, origin: string | null): Promise<Response> {
	try {
		// Extract product ID from URL using regex
		const url = new URL(request.url);
		const productIdMatch = url.pathname.match(/\/products\/([^/]+)/);
		const productId = productIdMatch ? productIdMatch[1] : null;

		if (!productId) {
			return jsonResponse({ error: 'Product ID is required' }, 400, origin, env);
		}

		// Step 1: Retrieve product to check if it exists
		let product;
		try {
			product = await stripe.products.retrieve(productId);
		} catch (error: any) {
			if (error.code === 'resource_missing') {
				return jsonResponse({ error: 'Product not found' }, 404, origin, env);
			}
			throw error;
		}

		// Step 2: Check if product is already archived
		if (!product.active) {
			await invalidateProductCaches(request);
			return jsonResponse(
				{
					message: 'Product was already archived',
					product: product,
				},
				200,
				origin,
				env,
			);
		}

		// Step 3: Remove default price if it exists (required before archiving prices)
		if (product.default_price) {
			await stripe.products.update(productId, { default_price: null } as any);
			// Re-fetch product to get updated state
			product = await stripe.products.retrieve(productId);
		}

		// Step 4: List all active prices for this product
		const activePrices = await stripe.prices.list({
			product: productId,
			active: true,
			limit: 100,
		});

		// Step 5: Archive all active prices first
		const archivedPrices = [];
		for (const price of activePrices.data) {
			try {
				const archivedPrice = await stripe.prices.update(price.id, { active: false });
				archivedPrices.push(archivedPrice.id);
			} catch (priceError: any) {
				// If price is default price, try removing default price and retry
				if (priceError.message?.includes('default price')) {
					await stripe.products.update(productId, { default_price: null } as any);
					const archivedPrice = await stripe.prices.update(price.id, { active: false });
					archivedPrices.push(archivedPrice.id);
				} else {
					throw priceError;
				}
			}
		}

		// Step 6: Archive the product
		const archivedProduct = await stripe.products.update(productId, {
			active: false,
		});

		await invalidateProductCaches(request);

		return jsonResponse(
			{
				archived_product: archivedProduct,
				archived_prices: archivedPrices,
				archived_prices_count: archivedPrices.length,
				message: 'Product and associated prices archived successfully. To permanently delete, use the Stripe Dashboard.',
			},
			200,
			origin,
			env,
		);
	} catch (error: any) {
		console.error('Archive product error:', JSON.stringify(error, null, 2));
		const statusCode = error.statusCode || error.status || 500;
		const message = statusCode < 500 ? error.message || 'An error occurred' : 'An error occurred';

		return jsonResponse(
			{
				error: message,
				details: error.message,
				code: error.code,
				type: error.type,
			},
			statusCode,
			origin,
			env,
		);
	}
}

/**
 * Export default fetch handler for DELETE /products/:id endpoint
 * Deletes a Stripe product by ID
 *
 * @type {ExportedHandler<Env>}
 * @param {Stripe} stripe - Initialized Stripe client
 * @param {Request} request - Incoming HTTP request
 * @param {Env} env - Cloudflare Worker environment variables
 * @param {string | null} origin - Request origin for CORS headers
 * @returns {Promise<Response>} JSON response with deletion confirmation
 */
export default {
	fetch: withStripeHandler('DELETE', handleDeleteProduct),
} satisfies ExportedHandler<Env>;
