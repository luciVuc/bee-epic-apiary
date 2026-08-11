import Stripe from 'stripe';
import { jsonOk, withStripeHandler, stripeErrorResponse } from '../../utils';
import { fetchAllActiveProducts, matchesSearch, matchesCategory, matchesTag } from './shared';

/**
 * GET /products/count — count active products matching optional filters.
 *
 * Unlike the KV-cached unfiltered count on `/products`, this endpoint accepts
 * `search` / `category` / `tag` query params and always walks the full active
 * product set to apply them, returning `{ total }`. No role gate (read-only).
 */
export async function handleGetProductsCount(stripe: Stripe, request: Request, env: Env, origin: string | null): Promise<Response> {
	const url = new URL(request.url);
	const search = url.searchParams.get('search') || '';
	const category = url.searchParams.get('category') || '';
	const tag = url.searchParams.get('tag') || '';

	try {
		const allProducts = await fetchAllActiveProducts(stripe);
		const totalCount = allProducts.filter((p) => matchesSearch(p, search) && matchesCategory(p, category) && matchesTag(p, tag)).length;

		return jsonOk({ total: totalCount }, origin, env);
	} catch (error) {
		return stripeErrorResponse(error, origin, env, 'products');
	}
}

export default {
	fetch: withStripeHandler('GET', handleGetProductsCount),
} satisfies ExportedHandler<Env>;
