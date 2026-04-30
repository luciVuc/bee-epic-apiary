// workers/create-product.ts
import Stripe from 'stripe';
import { handleCORS, isAllowedOrigin, isValidUrl, jsonResponse } from '../../utils';

export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		// Handle CORS preflight
		if (request.method === 'OPTIONS') {
			return handleCORS(request, env, 'POST');
		}

		// Only allow POST
		if (request.method !== 'POST') {
			return jsonResponse({ error: 'Method not allowed' }, 405);
		}

		// Validate origin
		const origin = request.headers.get('Origin');
		if (!isAllowedOrigin(origin, env)) {
			return jsonResponse({ error: 'Forbidden' }, 403);
		}

		try {
			// Parse request body
			const body = (await request.json()) as Stripe.Checkout.SessionCreateParams;

			// Validate required fields
			if (!body.line_items || !Array.isArray(body.line_items) || body.line_items.length === 0) {
				return jsonResponse({ error: 'line_items is required and must be a non-empty array' }, 400);
			}

			if (!body.success_url || !body.cancel_url) {
				return jsonResponse({ error: 'success_url and cancel_url are required' }, 400);
			}

			if (!isValidUrl(body.success_url) || !isValidUrl(body.cancel_url)) {
				return jsonResponse({ error: 'success_url and cancel_url must be valid URLs' }, 400);
			}

			// Validate line items
			for (const item of body.line_items) {
				if (!item.price && !item.price_data) {
					return jsonResponse({ error: 'Each line item must have either price or price_data' }, 400);
				}
				if (!item.quantity || item.quantity < 1) {
					return jsonResponse({ error: 'Each line item must have a quantity >= 1' }, 400);
				}
			}

			// Initialize Stripe
			const stripe = new Stripe(env.STRIPE_SECRET_KEY, {
				apiVersion: '2026-04-22.dahlia',
				httpClient: Stripe.createFetchHttpClient(),
			});

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

			// Create subscripti.LineItemon session for recurring items
			if (recurringItems.length > 0) {
				const subscriptionSession = await stripe.checkout.sessions.create({
					mode: 'subscription',
					line_items: recurringItems.map((item) => ({
						price: item.price,
						quantity: item.quantity,
					})),
					metadata: body.metadata,
					success_url: `${body.success_url}?session_id={CHECKOUT_SESSION_ID}&type=subscription`,
					cancel_url: body.cancel_url,
					customer_email: body.customer_email,
					automatic_tax: {
						enabled: body.automatic_tax?.enabled || false,
					}, // Enable if you use Stripe Tax
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
					success_url: `${body.success_url}?session_id={CHECKOUT_SESSION_ID}&type=payment`,
					cancel_url: body.cancel_url,
					customer_email: body.customer_email,
					automatic_tax: {
						enabled: body.automatic_tax?.enabled || false,
					}, // Enable if you use Stripe Tax
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
			);
		} catch (error: any) {
			console.error('Stripe error:', error);

			return jsonResponse(
				{
					error: error.message || 'Failed to create checkout session',
				},
				error.statusCode || 500,
				origin,
			);
		}
	},
} satisfies ExportedHandler<Env>;
