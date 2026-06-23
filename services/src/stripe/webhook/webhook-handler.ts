import Stripe from 'stripe';
import { jsonResponse } from '../../utils';
import { confirmOrder } from '../order/confirm-order';

export async function handleWebhook(request: Request, env: Env): Promise<Response> {
	if (request.method !== 'POST') {
		return jsonResponse({ error: 'Method not allowed' }, 405);
	}

	const signature = request.headers.get('stripe-signature');
	if (!signature) {
		return jsonResponse({ error: 'Missing stripe-signature header' }, 400);
	}

	const webhookSecret = env.STRIPE_WEBHOOK_SECRET;
	if (!webhookSecret) {
		return jsonResponse({ error: 'Webhook secret not configured' }, 500);
	}

	const stripe = new Stripe(env.STRIPE_SECRET_KEY, {
		apiVersion: '2026-05-27.dahlia',
		httpClient: Stripe.createFetchHttpClient(),
	});

	const body = await request.text();

	let event: Stripe.Event;
	try {
		event = await stripe.webhooks.constructEventAsync(body, signature, webhookSecret);
	} catch (err) {
		console.error('Webhook signature verification failed:', err);
		return jsonResponse({ error: 'Invalid signature' }, 401);
	}

	switch (event.type) {
		case 'checkout.session.completed': {
			const session = event.data.object as Stripe.Checkout.Session;
			await confirmOrder(session.id, stripe, env);
			break;
		}
	}

	return jsonResponse({ received: true }, 200);
}

export default {
	fetch: handleWebhook,
} satisfies ExportedHandler<Env>;
