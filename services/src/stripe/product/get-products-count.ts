import { withStripeHandler } from '../../utils';
import Stripe from 'stripe';
import { jsonResponse } from '../../utils';
import { fetchAllActiveProducts, matchesSearch, matchesCategory, matchesTag } from './shared';

export async function handleGetProductsCount(stripe: Stripe, request: Request, env: Env, origin: string | null): Promise<Response> {
	try {
		const url = new URL(request.url);
		const search = url.searchParams.get('search') || '';
		const category = url.searchParams.get('category') || '';
		const tag = url.searchParams.get('tag') || '';

		let totalCount = 0;

		if (search || (category && category !== 'ALL') || tag) {
			const allProducts = await fetchAllActiveProducts(stripe);
			totalCount = allProducts.filter((p) => {
				return matchesSearch(p, search) && matchesCategory(p, category) && matchesTag(p, tag);
			}).length;
		} else {
			const allProducts = await fetchAllActiveProducts(stripe);
			totalCount = allProducts.length;
		}

		return jsonResponse({ total: totalCount }, 200, origin, env);
	} catch (error: any) {
		console.error('Get products count error:', error);
		const statusCode = error.statusCode || 500;
		const message = statusCode < 500 ? error.message || 'An error occurred' : 'An error occurred';
		return jsonResponse({ error: message }, statusCode, origin, env);
	}
}

export default {
	fetch: withStripeHandler('GET', handleGetProductsCount),
} satisfies ExportedHandler<Env>;
