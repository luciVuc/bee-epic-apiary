import { withStripeHandler, jsonResponse } from '../../utils';
import Stripe from 'stripe';

interface IUpdateOrderBody {
	metadata?: Record<string, string>;
	collected_information?: Stripe.Checkout.SessionUpdateParams.CollectedInformation;
}

export async function handleUpdateOrder(stripe: Stripe, request: Request, env: Env, origin: string | null): Promise<Response> {
	try {
		const url = new URL(request.url);
		const orderIdMatch = url.pathname.match(/\/orders\/([^/]+)/);
		const orderId = orderIdMatch ? orderIdMatch[1] : null;

		if (!orderId) {
			return jsonResponse({ error: 'Order ID is required' }, 400, origin, env);
		}

		const body = (await request.json()) as IUpdateOrderBody;

		const updateParams: Stripe.Checkout.SessionUpdateParams = {};
		if (body.metadata) {
			updateParams.metadata = body.metadata;
		}
		if (body.collected_information) {
			updateParams.collected_information = body.collected_information;
		}

		const session = await stripe.checkout.sessions.update(orderId, updateParams);

		if (body.metadata?.order_status === 'new') {
			try {
				const stub = env.NOTIFICATION_HUB.getByName('default');
				await stub.notify(orderId);
			} catch (error) {
				console.error('Failed to send admin notification on status update:', error);
			}
		}

		return jsonResponse(session, 200, origin, env);
	} catch (error: unknown) {
		const err = error as { statusCode?: number; message?: string };
		console.error('Update order error:', err);
		const statusCode = err.statusCode || 500;
		const message = statusCode < 500 ? err.message || 'An error occurred' : 'An error occurred';
		return jsonResponse({ error: message }, statusCode, origin, env);
	}
}

export default {
	fetch: withStripeHandler('PUT', handleUpdateOrder, { requireAuth: true }),
} satisfies ExportedHandler<Env>;
