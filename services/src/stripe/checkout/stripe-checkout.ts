import Stripe from 'stripe';
import { isValidUrl, jsonResponse, withStripeHandler } from '../../utils';
import { IAPIResponseError } from '../../types';

/**
 * Stripe Checkout Session Handler
 *
 * Handles POST /checkout requests to create Stripe Checkout sessions.
 * Automatically separates recurring and one-time items into separate sessions.
 *
 * @module stripe-checkout
 */

/**
 * Inner handler for creating checkout sessions.
 * Exported for testing with mocked Stripe instances.
 */
export async function handleCheckout(stripe: Stripe, request: Request, env: Env, origin: string | null): Promise<Response> {
	try {
		// Parse request body
		const body = (await request.json()) as Stripe.Checkout.SessionCreateParams;

		// Validate required fields
		if (!body.line_items || !Array.isArray(body.line_items) || body.line_items.length === 0) {
			return jsonResponse({ error: 'line_items is required and must be a non-empty array' }, 400, origin, env);
		}

		if (!body.success_url || !body.cancel_url) {
			return jsonResponse({ error: 'success_url and cancel_url are required' }, 400, origin, env);
		}

		if (!isValidUrl(body.success_url) || !isValidUrl(body.cancel_url)) {
			return jsonResponse({ error: 'success_url and cancel_url must be valid URLs' }, 400, origin, env);
		}

		// Validate line items
		for (const item of body.line_items) {
			if (!item.price && !item.price_data) {
				return jsonResponse({ error: 'Each line item must have either price or price_data' }, 400, origin, env);
			}
			if (!item.quantity || item.quantity < 1) {
				return jsonResponse({ error: 'Each line item must have a quantity >= 1' }, 400, origin, env);
			}
		}

		// Fetch price details to determine which are recurring
		const pricePromises = body.line_items.map((item) => stripe.prices.retrieve(item.price as string));
		const prices = await Promise.all(pricePromises);

		// Separate recurring and one-time items
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

		const orderStatusField: Stripe.Checkout.SessionCreateParams.CustomField = {
			key: 'order_status',
			label: { custom: 'Order Status', type: 'custom' },
			type: 'dropdown',
			optional: true,
			dropdown: {
				options: [
					{ label: 'New', value: 'new' },
					{ label: 'Pending', value: 'pending' },
					{ label: 'Fulfilled', value: 'fulfilled' },
				],
			},
		};

		const customFields = body.custom_fields?.length ? body.custom_fields : [orderStatusField];

		// Create subscription session for recurring items
		if (recurringItems.length > 0) {
			const subscriptionSession = await stripe.checkout.sessions.create({
				mode: 'subscription',
				line_items: recurringItems.map((item) => ({
					price: item.price,
					quantity: item.quantity,
				})),
				metadata: body.metadata,
				custom_fields: customFields,
				success_url: `${body.success_url}?session_id={CHECKOUT_SESSION_ID}&type=subscription`,
				cancel_url: body.cancel_url,
				customer_email: body.customer_email,
				automatic_tax: {
					enabled: body.automatic_tax?.enabled || false,
				},
			});
			if (subscriptionSession.url) {
				sessions.push(subscriptionSession.url);
			}
		}

		// Create payment session for one-time items
		if (oneTimeItems.length > 0) {
			const paymentSession = await stripe.checkout.sessions.create({
				mode: 'payment',
				line_items: oneTimeItems.map((item) => ({
					price: item.price,
					quantity: item.quantity,
				})),
				metadata: body.metadata,
				custom_fields: customFields,
				success_url: `${body.success_url}?session_id={CHECKOUT_SESSION_ID}&type=payment`,
				cancel_url: body.cancel_url,
				customer_email: body.customer_email,
				automatic_tax: {
					enabled: body.automatic_tax?.enabled || false,
				},
			});
			if (paymentSession.url) {
				sessions.push(paymentSession.url);
			}
		}

		// Return session URL
		return jsonResponse(
			{
				sessions,
				message: sessions.length > 1 ? 'Multiple checkout sessions created' : 'Single checkout session created',
			},
			200,
			origin,
			env,
		);
	} catch (error: unknown) {
		const err = error as IAPIResponseError;
		console.error('Checkout error:', err);
		const statusCode = err.statusCode || 500;
		const message = statusCode < 500 ? err.message || 'An error occurred' : 'An error occurred';
		return jsonResponse({ error: message }, statusCode, origin, env);
	}
}

/**
 * Export default fetch handler for /checkout endpoint
 * Creates Stripe Checkout sessions for one-time payments and/or subscriptions
 *
 * @type {ExportedHandler<Env>}
 * @param {Stripe} stripe - Initialized Stripe client
 * @param {Request} request - Incoming HTTP request with line_items, success_url, cancel_url
 * @param {Env} env - Cloudflare Worker environment variables
 * @param {string | null} origin - Request origin for CORS headers
 * @returns {Promise<Response>} JSON response with session URLs
 *
 * @example
 * // Request body:
 * // {
 * //   "line_items": [{ "price": "price_123", "quantity": 1 }],
 * //   "success_url": "https://example.com/success",
 * //   "cancel_url": "https://example.com/cancel"
 * // }
 */
export default {
	fetch: withStripeHandler('POST', handleCheckout),
} satisfies ExportedHandler<Env>;
