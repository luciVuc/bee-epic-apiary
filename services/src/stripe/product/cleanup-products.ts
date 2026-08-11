import Stripe from 'stripe';
import { EStaffRole, ENotificationType } from '@bee-epic/shared';
import { jsonOk, withStripeHandler, stripeErrorResponse } from '../../utils';
import { IApiUpstreamError } from '../../types';
import { fetchAllActiveProducts, invalidateProductCountCache } from './shared';
import { invalidateProductStatsCache } from './get-products-stats';
import { archiveProduct } from './delete-product';

interface ICleanupCandidate {
	id: string;
	name: string;
}

/** Products with no default_price are never sellable — the storefront drops them. */
async function findUnpricedProducts(stripe: Stripe): Promise<ICleanupCandidate[]> {
	const products = await fetchAllActiveProducts(stripe, ['data.default_price']);
	return products.filter((p) => !p.default_price).map((p) => ({ id: p.id, name: p.name }));
}

/**
 * POST /products/cleanup — remove un-priced (unsellable) products.
 *
 * `?dryRun=true` returns the candidate list without deleting, powering the
 * admin preview step. Otherwise each candidate is permanently deleted, falling
 * back to archive when Stripe refuses (transaction history), mirroring the
 * single-product delete handler.
 */
export async function handleCleanupProducts(stripe: Stripe, request: Request, env: Env, origin: string | null): Promise<Response> {
	const url = new URL(request.url);
	const dryRun = url.searchParams.get('dryRun') === 'true';

	try {
		const candidates = await findUnpricedProducts(stripe);

		if (dryRun) {
			return jsonOk({ dry_run: true, candidates, count: candidates.length }, origin, env);
		}

		const deleted: string[] = [];
		const archived: string[] = [];
		const failed: { id: string; error: string }[] = [];

		for (const candidate of candidates) {
			try {
				const result = await stripe.products.del(candidate.id);
				if (result.deleted === true) {
					deleted.push(candidate.id);
					continue;
				}
				// Fall through to archive on an unexpected shape.
				await archiveProduct(stripe, candidate.id);
				archived.push(candidate.id);
			} catch (delError: unknown) {
				const delErr = delError as IApiUpstreamError;
				if (delErr.code === 'resource_missing') {
					// Already gone (deleted concurrently) — treat as success.
					deleted.push(candidate.id);
					continue;
				}
				try {
					await archiveProduct(stripe, candidate.id);
					archived.push(candidate.id);
				} catch (archiveError: unknown) {
					const archiveErr = archiveError as IApiUpstreamError;
					failed.push({ id: candidate.id, error: archiveErr.message || 'archive failed' });
				}
			}
		}

		if (deleted.length > 0 || archived.length > 0) {
			await invalidateProductCountCache(env);
			await invalidateProductStatsCache(env);

			try {
				const stub = env.NOTIFICATION_HUB.getByName('default');
				// One representative notification is enough to trigger a client refresh.
				await stub.notify({ type: ENotificationType.PRODUCT_DELETED, productId: deleted[0] ?? archived[0] });
			} catch (error) {
				console.error('Failed to send product-deleted notification:', error);
			}
		}

		return jsonOk(
			{
				dry_run: false,
				deleted,
				archived,
				failed,
				deleted_count: deleted.length,
				archived_count: archived.length,
				failed_count: failed.length,
				message: `Cleanup complete: ${deleted.length} deleted, ${archived.length} archived, ${failed.length} failed.`,
			},
			origin,
			env,
		);
	} catch (error) {
		return stripeErrorResponse(error, origin, env, 'products:cleanup');
	}
}

export default {
	fetch: withStripeHandler('POST', handleCleanupProducts, { requiredRole: EStaffRole.MANAGER }),
} satisfies ExportedHandler<Env>;
