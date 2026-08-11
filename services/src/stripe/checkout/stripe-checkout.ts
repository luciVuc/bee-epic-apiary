import Stripe from 'stripe';
import { hostnameAllowed, isValidUrl, jsonOk, jsonErr, withStripeHandler, stripeErrorResponse } from '../../utils';

export async function handleCheckout(stripe: Stripe, request: Request, env: Env, origin: string | null): Promise<Response> {
	const body = (await request.json()) as Stripe.Checkout.SessionCreateParams;

	if (!body.line_items || !Array.isArray(body.line_items) || body.line_items.length === 0) {
		return jsonErr(
			{ code: 'VALIDATION_FAILED', fields: { line_items: 'line_items is required and must be a non-empty array' } },
			origin,
			env,
		);
	}
	if (!body.success_url || !body.cancel_url) {
		return jsonErr({ code: 'VALIDATION_FAILED', fields: { urls: 'success_url and cancel_url are required' } }, origin, env);
	}
	if (!isValidUrl(body.success_url) || !isValidUrl(body.cancel_url)) {
		return jsonErr({ code: 'VALIDATION_FAILED', fields: { urls: 'success_url and cancel_url must be valid URLs' } }, origin, env);
	}
	// Constrain the redirect target to ALLOWED_ORIGINS to prevent an open-redirect
	// through Stripe Checkout — a malicious caller could otherwise route paid
	// customers to an attacker-controlled "thank you" page (review I3).
	if (!hostnameAllowed(body.success_url, env.ALLOWED_ORIGINS) || !hostnameAllowed(body.cancel_url, env.ALLOWED_ORIGINS)) {
		return jsonErr({ code: 'VALIDATION_FAILED', fields: { urls: 'success_url and cancel_url must match an allowed origin' } }, origin, env);
	}
	for (const item of body.line_items) {
		// Reject caller-supplied inline `price_data`: it would let a client mint an
		// arbitrary amount/currency that bypasses server price verification. Every
		// line item must reference a Stripe price ID, which we retrieve and trust
		// below. (The handler only ever forwards `item.price` anyway, so a
		// price_data-only item would also crash `prices.retrieve(undefined)`.)
		if (item.price_data) {
			return jsonErr(
				{ code: 'VALIDATION_FAILED', fields: { line_items: 'Inline price_data is not accepted; use a Stripe price ID' } },
				origin,
				env,
			);
		}
		if (!item.price || typeof item.price !== 'string') {
			return jsonErr({ code: 'VALIDATION_FAILED', fields: { line_items: 'Each line item must reference a Stripe price ID' } }, origin, env);
		}
		if (!item.quantity || item.quantity < 1) {
			return jsonErr({ code: 'VALIDATION_FAILED', fields: { line_items: 'Each line item must have a quantity >= 1' } }, origin, env);
		}
	}

	try {
		const pricePromises = body.line_items.map((item) => stripe.prices.retrieve(item.price as string));
		const prices = await Promise.all(pricePromises);

		const recurringItems = [] as unknown as typeof body.line_items;
		const oneTimeItems = [] as unknown as typeof body.line_items;

		body.line_items.forEach((item, index) => {
			if (prices[index].recurring) {
				recurringItems.push(item);
			} else {
				oneTimeItems.push(item);
			}
		});

		const sessions: string[] = [];

		if (recurringItems.length > 0) {
			const subscriptionSession = await stripe.checkout.sessions.create({
				mode: 'subscription',
				line_items: recurringItems.map((item) => ({ price: item.price, quantity: item.quantity })),
				metadata: body.metadata,
				success_url: `${body.success_url}?session_id={CHECKOUT_SESSION_ID}&type=subscription`,
				cancel_url: body.cancel_url,
				customer_email: body.customer_email,
				automatic_tax: { enabled: body.automatic_tax?.enabled || false },
			});
			if (subscriptionSession.url) sessions.push(subscriptionSession.url);
		}

		if (oneTimeItems.length > 0) {
			const paymentSession = await stripe.checkout.sessions.create({
				mode: 'payment',
				line_items: oneTimeItems.map((item) => ({ price: item.price, quantity: item.quantity })),
				metadata: body.metadata,
				success_url: `${body.success_url}?session_id={CHECKOUT_SESSION_ID}&type=payment`,
				cancel_url: body.cancel_url,
				customer_email: body.customer_email,
				automatic_tax: { enabled: body.automatic_tax?.enabled || false },
			});
			if (paymentSession.url) sessions.push(paymentSession.url);
		}

		return jsonOk(
			{
				sessions,
				message: sessions.length > 1 ? 'Multiple checkout sessions created' : 'Single checkout session created',
			},
			origin,
			env,
		);
	} catch (error) {
		return stripeErrorResponse(error, origin, env, 'checkout');
	}
}

export default {
	fetch: withStripeHandler('POST', handleCheckout),
} satisfies ExportedHandler<Env>;
