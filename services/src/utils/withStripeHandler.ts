import Stripe from 'stripe';
import { EStaffRole } from '@bee-epic/shared';
import { jsonErr } from '.';
import { safeStripeMessage } from './stripeErrorResponse';
import { withAuthHandler } from './withAuthHandler';
import type { HttpMethod } from './handleCORS';
import type { ICaller } from './resolveCaller';
import { IApiUpstreamError } from '../types';

let stripeInstance: Stripe | null = null;

/**
 * Returns true when running under a vitest worker. Used to gate
 * `setStripeInstance` so accidental imports of this seam from production
 * code can't poison the shared Stripe singleton.
 *
 * Vitest sets `globalThis.__vitest_worker__` in all of its execution
 * contexts (Node and `@cloudflare/vitest-pool-workers`). `process.env.NODE_ENV`
 * is NOT a reliable signal in the workers pool — it's undefined there.
 */
function isVitestWorker(): boolean {
	return typeof (globalThis as { __vitest_worker__?: unknown }).__vitest_worker__ !== 'undefined';
}

/**
 * Test-only seam for swapping the Stripe singleton. No-ops when called
 * outside a vitest worker, so an accidental import from production code
 * can't replace the real client with a fake.
 */
export function setStripeInstance(mock: Stripe | null): void {
	if (!isVitestWorker()) {
		// Deliberately silent: production callers shouldn't see noise; the
		// no-op behaviour is the contract.
		return;
	}
	stripeInstance = mock;
}

/**
 * Returns a memoised Stripe client. The instance is reused across requests
 * within the worker isolate (Workers reuse isolates for many requests),
 * sparing the per-request setup of a fresh HTTP client and TLS handshakes
 * on the first call. The webhook handler shares this singleton so signature
 * verification and any follow-up Stripe API calls use the same client.
 */
export function getStripeInstance(env: Env): Stripe {
	if (!stripeInstance) {
		stripeInstance = new Stripe(env.STRIPE_SECRET_KEY, {
			apiVersion: '2026-05-27.dahlia',
			httpClient: Stripe.createFetchHttpClient(),
		});
	}
	return stripeInstance;
}

/** Handler function type for Stripe endpoints. */
export type StripeHandler = (stripe: Stripe, request: Request, env: Env, origin: string | null, caller?: ICaller) => Promise<Response>;

/** Options for configuring the withStripeHandler wrapper. */
export interface IWithStripeHandlerOptions {
	/** Minimum role required to call this endpoint. If omitted, no auth check is performed. */
	requiredRole?: EStaffRole;
}

/**
 * Thin Stripe-flavoured adapter over `withAuthHandler`. Delegates the entire
 * CORS / method / origin / auth / rate-limit chain to the generic wrapper,
 * layering on Stripe-specific behaviour:
 *   1) Instantiates the memoised Stripe client and passes it to the handler.
 *   2) Wraps handler invocation in a Stripe-error try/catch that maps
 *      `IApiUpstreamError` (statusCode<500 → BAD_REQUEST, ≥500 → INTERNAL).
 *
 * The Stripe try/catch lives INSIDE the AuthHandler closure, not around
 * `withAuthHandler`. `withAuthHandler` has its own generic top-level
 * try/catch that returns `INTERNAL`; if Stripe errors bubbled past this
 * inner catch they'd be swallowed by the generic one and lose their
 * BAD_REQUEST mapping. Catching at the innermost boundary preserves the
 * upstream-error shape.
 *
 * Options mapping:
 *   - `requiredRole` passes through unchanged.
 *   - When `requiredRole` is undefined the wrapper opts into `public: true`
 *     on the delegate. Existing Stripe routes without `requiredRole`
 *     (checkout, product listing) are intentionally public — the
 *     write-method floor introduced in Phase 6.2 would otherwise regress
 *     `POST /checkout` from unauthenticated to EMPLOYEE-gated.
 */
export function withStripeHandler(method: HttpMethod, handler: StripeHandler, options?: IWithStripeHandlerOptions) {
	const authHandler = async (request: Request, env: Env, origin: string | null, caller?: ICaller): Promise<Response> => {
		try {
			const stripe = getStripeInstance(env);
			return await handler(stripe, request, env, origin, caller);
		} catch (error: unknown) {
			const err = error as IApiUpstreamError;
			console.error('Stripe error:', err);
			const statusCode = err.statusCode || 500;
			if (statusCode < 500) {
				return jsonErr({ code: 'BAD_REQUEST', message: safeStripeMessage(err) }, origin, env);
			}
			return jsonErr({ code: 'INTERNAL' }, origin, env);
		}
	};

	return withAuthHandler(method, authHandler, {
		requiredRole: options?.requiredRole,
		public: options?.requiredRole === undefined,
	});
}

export default withStripeHandler;
