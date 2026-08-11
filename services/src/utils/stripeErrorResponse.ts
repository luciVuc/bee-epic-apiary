import { jsonErr } from './jsonResponse';
import type { IApiUpstreamError } from '../types';

/**
 * Stripe error `type`s whose `message` is safe to relay verbatim to the client.
 * These describe bad *caller input* (invalid params, declined card) — the
 * message is meant to be shown to an end user and carries no internal/config
 * detail. Every other type (StripeAuthenticationError, StripeAPIError,
 * StripeConnectionError, StripeRateLimitError, StripePermissionError,
 * StripeIdempotencyError, …) can leak keys, account state, or infrastructure
 * details, so their messages are replaced with a generic string.
 *
 * See https://docs.stripe.com/api/errors — `type` is a stable, documented field.
 */
const CLIENT_SAFE_STRIPE_ERROR_TYPES: ReadonlySet<string> = new Set(['StripeInvalidRequestError', 'StripeCardError']);

/**
 * Resolve the client-facing message for a `< 500` Stripe error. Only genuine
 * input-validation / card errors surface their real message; anything else
 * (including errors with no `type`) falls back to a generic string so upstream
 * detail is never relayed to — potentially unauthenticated — callers (e.g.
 * `/checkout`). The full error is logged server-side by the caller/wrapper.
 */
export function safeStripeMessage(err: IApiUpstreamError): string {
	if (err.type && CLIENT_SAFE_STRIPE_ERROR_TYPES.has(err.type) && err.message) {
		return err.message;
	}
	return 'The payment provider rejected the request.';
}

/**
 * Maps a Stripe (or Stripe-shaped) error to an `IApiResponse` envelope.
 *
 * Mirrors the catch block in `withStripeHandler` — handlers that call this
 * directly are safe to invoke without the wrapper (e.g., from tests that import
 * `handleX` directly). The wrapper still has its own catch, so double-coverage
 * is harmless: the inner catch returns a Response, the outer one never sees a
 * throw.
 *
 * Status mapping:
 *   - 404      → `NOT_FOUND` (the requested Stripe resource doesn't exist)
 *   - `< 500`  → `BAD_REQUEST` (Stripe rejected the input; surface a *safe* message)
 *   - `>= 500` → `INTERNAL`    (something's wrong on Stripe's side; hide details)
 *   - missing  → 500           (defensive default)
 *
 * The `< 500` message is filtered through {@link safeStripeMessage}: only
 * input-validation / card-error types relay their real message; all others get
 * a generic string to avoid leaking upstream detail to clients.
 */
export function stripeErrorResponse(error: unknown, origin: string | null, env: Env, resourceHint?: string): Response {
	const err = error as IApiUpstreamError;
	const statusCode = err.statusCode ?? 500;
	if (statusCode === 404) {
		return jsonErr({ code: 'NOT_FOUND', resource: resourceHint ?? 'resource' }, origin, env);
	}
	if (statusCode < 500) {
		return jsonErr({ code: 'BAD_REQUEST', message: safeStripeMessage(err) }, origin, env);
	}
	return jsonErr({ code: 'INTERNAL' }, origin, env);
}
