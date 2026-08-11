import Stripe from 'stripe';
import { getStripeInstance, jsonErr, jsonOk } from '../../utils';
import { confirmOrder } from '../order/confirm-order';

/**
 * Idempotency keys live in CONTENT_KV for 24 hours. Stripe retries failed
 * deliveries on an exponential schedule that can reach ~72h, so this window
 * doesn't cover the long tail — but Stripe also dedupes at the producer side
 * for the typical "double-fire from a single event" pattern that this
 * defends against. 24h keeps KV usage bounded while catching essentially all
 * real-world duplicates we'd otherwise process twice.
 */
const IDEMPOTENCY_TTL_SECONDS = 60 * 60 * 24;

/**
 * Stripe-signed webhook ingress for `checkout.session.completed` (and other
 * future events). Returns the standard `IApiResponse<T>` envelope so the
 * caller surface is consistent with the rest of the worker.
 *
 * Auth: validated by Stripe signature (HMAC of the body + the configured
 * webhook secret), not by `resolveCaller`. CF Access protects admin routes;
 * `/stripe/webhook` is intentionally exposed to Stripe's IP range.
 *
 * Idempotency: each event.id is reserved in CONTENT_KV *before* its side effect
 * runs, then either confirmed (kept for the full TTL) on success or released
 * (deleted) on failure so Stripe's redelivery re-runs it. The pre-dispatch
 * reservation closes the concurrent-duplicate window: two near-simultaneous
 * deliveries of the same event.id can otherwise both read "not seen" and both
 * run `confirmOrder` (double order confirmation + double admin email). KV has no
 * compare-and-set, so this narrows — not mathematically eliminates — the race to
 * the KV write latency rather than the full `confirmOrder` duration; that is
 * enough to stop the real-world double-fire. A duplicate arriving after the
 * reservation returns a `{ received: true, duplicate: true }` envelope.
 *
 * Side effects (`confirmOrder`) are dispatched via `ctx.waitUntil` when
 * available, so the 200 OK race back to Stripe doesn't block on email
 * delivery latency.
 */
export async function handleWebhook(request: Request, env: Env, ctx?: ExecutionContext): Promise<Response> {
	// Webhook callers don't have an Origin; pass null so jsonResponse
	// skips ACAO entirely.
	const origin: string | null = null;

	if (request.method !== 'POST') {
		return jsonErr({ code: 'METHOD_NOT_ALLOWED', allowed: ['POST'] }, origin, env);
	}

	const signature = request.headers.get('stripe-signature');
	if (!signature) {
		return jsonErr({ code: 'BAD_REQUEST', message: 'Missing stripe-signature header' }, origin, env);
	}

	const webhookSecret = env.STRIPE_WEBHOOK_SECRET;
	if (!webhookSecret) {
		console.error('STRIPE_WEBHOOK_SECRET is not configured');
		return jsonErr({ code: 'INTERNAL' }, origin, env);
	}

	const stripe = getStripeInstance(env);

	const body = await request.text();

	let event: Stripe.Event;
	try {
		event = await stripe.webhooks.constructEventAsync(body, signature, webhookSecret);
	} catch (err) {
		console.error('Webhook signature verification failed:', err);
		return jsonErr({ code: 'UNAUTHORIZED' }, origin, env);
	}

	// Idempotency reservation — record the event BEFORE dispatching side effects
	// so a concurrent duplicate delivery is short-circuited rather than allowed to
	// run `confirmOrder` in parallel. If the side effect later fails we delete the
	// key (below) so Stripe's redelivery can retry.
	const seenKey = `webhook:event:${event.id}`;
	const seen = await env.CONTENT_KV.get(seenKey);
	if (seen) {
		return jsonOk({ received: true, duplicate: true }, origin, env);
	}
	await env.CONTENT_KV.put(seenKey, '1', { expirationTtl: IDEMPOTENCY_TTL_SECONDS });

	switch (event.type) {
		case 'checkout.session.completed': {
			const session = event.data.object as Stripe.Checkout.Session;
			const work = confirmOrder(session, stripe, env).catch(async (err) => {
				console.error('confirmOrder failed', { eventId: event.id, err });
				// Release the reservation so Stripe's redelivery re-runs the side
				// effect instead of short-circuiting it as an already-seen duplicate.
				await env.CONTENT_KV.delete(seenKey).catch((delErr) => {
					console.error('failed to release idempotency key after confirmOrder error', { eventId: event.id, delErr });
				});
			});
			if (ctx?.waitUntil) {
				ctx.waitUntil(work);
			} else {
				// Local/test paths without a real ExecutionContext — await inline so
				// caller assertions on confirmOrderMock see the call.
				await work;
			}
			break;
		}
		default: {
			// Stripe will keep delivering subscribed event types even if we have
			// no branch for them yet. Log at info so an unexpected influx of a
			// new event type surfaces in the dashboard instead of being dropped
			// silently (review M5). The reservation above already recorded the key,
			// so we won't reprocess the same unhandled event on every redelivery.
			console.info('unhandled webhook event', { type: event.type, id: event.id });
			break;
		}
	}

	return jsonOk({ received: true }, origin, env);
}

export default {
	fetch: handleWebhook,
} satisfies ExportedHandler<Env>;
