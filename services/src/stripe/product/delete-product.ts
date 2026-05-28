import Stripe from 'stripe';
import { jsonResponse, withStripeHandler } from '../../utils';
import { IAPIResponseError } from '../../types';

export async function handleDeleteProduct(stripe: Stripe, request: Request, env: Env, origin: string | null): Promise<Response> {
	try {
		const url = new URL(request.url);
		const productIdMatch = url.pathname.match(/\/products\/([^/]+)/);
		const productId = productIdMatch ? productIdMatch[1] : null;

		if (!productId) {
			return jsonResponse({ error: 'Product ID is required' }, 400, origin, env);
		}

		let product;
		try {
			product = await stripe.products.retrieve(productId);
		} catch (error: unknown) {
			const retrieveErr = error as IAPIResponseError;
			if (retrieveErr.code === 'resource_missing') {
				return jsonResponse({ error: 'Product not found' }, 404, origin, env);
			}
			throw error;
		}

		if (!product.active) {
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

		if (product.default_price) {
			await stripe.products.update(productId, { default_price: null as unknown as string });
		}

		const activePrices = await stripe.prices.list({
			product: productId,
			active: true,
			limit: 100,
		});

		const archivedPrices = [];
		for (const price of activePrices.data) {
			try {
				const archivedPrice = await stripe.prices.update(price.id, { active: false });
				archivedPrices.push(archivedPrice.id);
			} catch (priceError: unknown) {
				const priceErr = priceError as IAPIResponseError;
				if (priceErr.message?.includes('default price')) {
					await stripe.products.update(productId, { default_price: null as unknown as string });
					const archivedPrice = await stripe.prices.update(price.id, { active: false });
					archivedPrices.push(archivedPrice.id);
				} else {
					throw priceError;
				}
			}
		}

		const archivedProduct = await stripe.products.update(productId, {
			active: false,
		});

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
	} catch (error: unknown) {
		const archiveErr = error as IAPIResponseError;
		console.error('Archive product error:', { message: archiveErr.message, statusCode: archiveErr.statusCode, stack: archiveErr.stack });
		const statusCode = archiveErr.statusCode || archiveErr.status || 500;
		const message = statusCode < 500 ? archiveErr.message || 'An error occurred' : 'An error occurred';

		return jsonResponse({ error: message }, statusCode, origin, env);
	}
}

export default {
	fetch: withStripeHandler('DELETE', handleDeleteProduct, { requireAuth: true }),
} satisfies ExportedHandler<Env>;
