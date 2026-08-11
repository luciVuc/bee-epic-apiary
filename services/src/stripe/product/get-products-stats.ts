import Stripe from 'stripe';
import { jsonOk, withStripeHandler, stripeErrorResponse } from '../../utils';
import { EStaffRole } from '@bee-epic/shared';
import { fetchAllActiveProducts } from './shared';

/**
 * Aggregated product statistics for the admin dashboard. Replaces a
 * `/products?limit=100` round-trip that the admin used to make on every
 * dashboard load just to compute `byCategory` / `inStock` / `featured`
 * counts client-side (review I12). Server-side aggregation is one full walk
 * cached in KV for 120s — dashboard refreshes hit the cache, and product
 * CUD operations invalidate it via `invalidateProductStatsCache` (wired in
 * the same shape as `invalidateProductCountCache`).
 *
 * Response shape (under `IApiResponse<T>` envelope):
 *   { totalProducts, inStock, featured, byCategory: Record<string, number> }
 *
 * Caching strategy:
 *   - KV key `products:stats:v1`, TTL 120s
 *   - Schema versioned in the key so a future shape change can co-exist
 *     with the previous cached value during deploy.
 */

export const PRODUCT_STATS_CACHE_KEY = 'products:stats:v1';
const PRODUCT_STATS_CACHE_TTL_SECONDS = 120;

/** Aggregated product counts returned by GET /products/stats. */
export interface IProductStats {
	totalProducts: number;
	inStock: number;
	featured: number;
	byCategory: Record<string, number>;
}

/** Invalidates the cached product stats. Called from create/update/delete-product. */
export async function invalidateProductStatsCache(env: Env): Promise<void> {
	const kv = env.CONTENT_KV;
	if (!kv) return;
	try {
		await kv.delete(PRODUCT_STATS_CACHE_KEY);
	} catch (err) {
		console.error('product-stats cache invalidation failed', { err: String(err) });
	}
}

/** Pure aggregator — testable in isolation, independent of KV and Stripe. */
export function aggregateProductStats(products: Stripe.Product[]): IProductStats {
	let inStock = 0;
	let featured = 0;
	const byCategory: Record<string, number> = {};
	for (const p of products) {
		const md = p.metadata || {};
		if (md.inStock !== 'false') inStock++;
		if (md.featured === 'true') featured++;
		const cat = md.category || 'UNCATEGORIZED';
		byCategory[cat] = (byCategory[cat] ?? 0) + 1;
	}
	return {
		totalProducts: products.length,
		inStock,
		featured,
		byCategory,
	};
}

/**
 * GET /products/stats — aggregated product counts for the dashboard (requires
 * EMPLOYEE). Serves the KV-cached stats when warm; on a miss (or malformed
 * cached value) it does one full active-product walk, aggregates, caches for
 * 120s, and returns the result.
 */
export async function handleGetProductsStats(stripe: Stripe, _request: Request, env: Env, origin: string | null): Promise<Response> {
	const kv = env.CONTENT_KV;

	// Try cache first. A schema mismatch (or a malformed cached value from a
	// prior deploy) is treated like a miss — fall through and rebuild.
	if (kv) {
		try {
			const cached = await kv.get(PRODUCT_STATS_CACHE_KEY);
			if (cached !== null) {
				try {
					const parsed = JSON.parse(cached) as IProductStats;
					if (typeof parsed.totalProducts === 'number') {
						return jsonOk(parsed, origin, env);
					}
				} catch {
					// fall through to recompute
				}
			}
		} catch (err) {
			console.error('product-stats cache read failed; recomputing', { err: String(err) });
		}
	}

	try {
		const all = await fetchAllActiveProducts(stripe);
		const stats = aggregateProductStats(all);

		if (kv) {
			try {
				await kv.put(PRODUCT_STATS_CACHE_KEY, JSON.stringify(stats), {
					expirationTtl: PRODUCT_STATS_CACHE_TTL_SECONDS,
				});
			} catch (err) {
				console.error('product-stats cache write failed', { err: String(err) });
			}
		}

		return jsonOk(stats, origin, env);
	} catch (error) {
		return stripeErrorResponse(error, origin, env, 'products:stats');
	}
}

export default {
	fetch: withStripeHandler('GET', handleGetProductsStats, { requiredRole: EStaffRole.EMPLOYEE }),
} satisfies ExportedHandler<Env>;
