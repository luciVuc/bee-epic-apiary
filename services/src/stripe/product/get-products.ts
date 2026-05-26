import { withStripeHandler } from '../../utils';
import Stripe from 'stripe';
import { jsonResponse } from '../../utils';
import { fetchAllActiveProducts, matchesSearch, matchesCategory, matchesTag, paginateArray } from './shared';

export async function handleGetProducts(stripe: Stripe, request: Request, env: Env, origin: string | null): Promise<Response> {
	try {
		const url = new URL(request.url);
		const productIdMatch = url.pathname.match(/\/products\/([^/]+)/);
		const productId = productIdMatch ? productIdMatch[1] : null;

		const expandParams = url.searchParams.getAll('expand[]');
		const expand = expandParams.length > 0 ? expandParams : undefined;

		const search = url.searchParams.get('search') || '';
		const category = url.searchParams.get('category') || '';
		const tag = url.searchParams.get('tag') || '';

		if (productId) {
			const retrieveParams: Stripe.ProductRetrieveParams = {};
			if (expand) {
				retrieveParams.expand = expand;
			}
			const product = (await stripe.products.retrieve(productId, retrieveParams)) as Stripe.Response<Stripe.Product>;

			if (!product.active) {
				return jsonResponse({ error: 'Product not found' }, 404, origin, env);
			}

			return jsonResponse(product, 200, origin, env);
		}

		const limit = parseInt(url.searchParams.get('limit') || '10', 10);
		const startingAfter = url.searchParams.get('starting_after') || undefined;

		let resultData: any;

		if (search || (category && category !== 'ALL') || tag) {
			const allProducts = await fetchAllActiveProducts(stripe, expand);
			const filtered = allProducts.filter((p) => {
				return matchesSearch(p, search) && matchesCategory(p, category) && matchesTag(p, tag);
			});
			const paginated = paginateArray(filtered, limit, startingAfter);
			resultData = {
				data: paginated.data,
				has_more: paginated.hasMore,
				total_count: filtered.length,
			};
		} else {
			const listParams: Stripe.ProductListParams = { active: true, limit };
			if (expand) {
				listParams.expand = expand;
			}
			if (startingAfter) {
				listParams.starting_after = startingAfter;
			}

			const stripeResult = (await stripe.products.list(listParams)) as Stripe.Response<Stripe.ApiList<Stripe.Product>>;

			let totalCount = stripeResult.data.length;
			try {
				const allProducts = await fetchAllActiveProducts(stripe, expand);
				totalCount = allProducts.length;
			} catch (error) {
				console.error('Failed to fetch full product list for total_count, falling back to first page count:', error);
			}

			resultData = {
				...stripeResult,
				total_count: totalCount,
			};
		}

		return jsonResponse(resultData, 200, origin, env);
	} catch (error: any) {
		console.error('Get products error:', error);
		const statusCode = error.statusCode || 500;
		const message = statusCode < 500 ? error.message || 'An error occurred' : 'An error occurred';
		return jsonResponse({ error: message }, statusCode, origin, env);
	}
}

export default {
	fetch: withStripeHandler('GET', handleGetProducts),
} satisfies ExportedHandler<Env>;
