import { withStripeHandler, jsonResponse } from '../../utils';
import Stripe from 'stripe';

export async function handleUpdateOrder(stripe: Stripe, request: Request, env: Env, origin: string | null): Promise<Response> {
	try {
		const url = new URL(request.url);
		const orderIdMatch = url.pathname.match(/\/orders\/([^/]+)/);
		const orderId = orderIdMatch ? orderIdMatch[1] : null;

		if (!orderId) {
			return jsonResponse({ error: 'Order ID is required' }, 400, origin, env);
		}

		const body = (await request.json()) as { metadata?: Record<string, string> };

		const updateParams: Stripe.Checkout.SessionUpdateParams = {};
		if (body.metadata) {
			updateParams.metadata = body.metadata;
		}

		const session = await stripe.checkout.sessions.update(orderId, updateParams);
		return jsonResponse(session, 200, origin, env);
	} catch (error: unknown) {
		const err = error as { statusCode?: number; message?: string };
		console.error('Update order error:', err);
		const statusCode = err.statusCode || 500;
		return jsonResponse({ error: 'An error occurred' }, statusCode, origin, env);
	}
}

export default {
	fetch: withStripeHandler('PUT', handleUpdateOrder, { requireAuth: true }),
} satisfies ExportedHandler<Env>;
