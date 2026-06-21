import Stripe from 'stripe';
import { paginateArray } from '../../utils';

export { paginateArray };

export async function fetchAllActiveProducts(stripe: Stripe, expand?: string[]): Promise<Stripe.Product[]> {
	const allProducts: Stripe.Product[] = [];
	let hasMore = true;
	let startingAfter: string | undefined;

	while (hasMore) {
		const params: Stripe.ProductListParams = {
			active: true,
			limit: 100,
			expand,
		};
		if (startingAfter) {
			params.starting_after = startingAfter;
		}
		const page = (await stripe.products.list(params)) as Stripe.Response<Stripe.ApiList<Stripe.Product>>;
		allProducts.push(...page.data);
		hasMore = page.has_more;
		startingAfter = page.data[page.data.length - 1]?.id;
	}

	return allProducts;
}

export function matchesSearch(product: Stripe.Product, search: string): boolean {
	if (!search) return true;
	const q = search.toLowerCase();
	return (
		product.name.toLowerCase().includes(q) ||
		(product.description || '').toLowerCase().includes(q) ||
		(product.metadata?.longDescription || '').toLowerCase().includes(q) ||
		(product.metadata?.tags || '').toLowerCase().includes(q)
	);
}

export function matchesCategory(product: Stripe.Product, category: string): boolean {
	if (!category || category === 'ALL') return true;
	return (product.metadata?.category || '') === category;
}

export function matchesTag(product: Stripe.Product, tag: string): boolean {
	if (!tag) return true;
	const trimmedTag = tag.trim();
	const tags = (product.metadata?.tags || '')
		.split(',')
		.map((t) => t.trim())
		.filter(Boolean);
	return tags.includes(trimmedTag);
}
