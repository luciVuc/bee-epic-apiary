import { withStripeHandler, jsonResponse } from '../../utils';
import Stripe from 'stripe';

interface IConfirmOrderBody {
	sessionId: string;
}

export async function handleConfirmOrder(stripe: Stripe, request: Request, env: Env, origin: string | null): Promise<Response> {
	try {
		const body = (await request.json()) as IConfirmOrderBody;

		if (!body.sessionId || typeof body.sessionId !== 'string') {
			return jsonResponse({ error: 'sessionId is required' }, 400, origin, env);
		}

		const session = await stripe.checkout.sessions.retrieve(body.sessionId);
		if (session.payment_status !== 'paid') {
			return jsonResponse({ error: 'Session not paid' }, 400, origin, env);
		}

		await stripe.checkout.sessions.update(body.sessionId, {
			metadata: { order_status: 'new' },
		});

		const notification = {
			sessionId: body.sessionId,
			timestamp: Date.now(),
		};

		await env.CONTENT_KV.put(`notifications:${body.sessionId}`, JSON.stringify(notification), { expirationTtl: 86400 });

		return jsonResponse({ success: true }, 200, origin, env);
	} catch (error: unknown) {
		const err = error as { statusCode?: number; message?: string };
		console.error('Confirm order error:', err);
		const statusCode = err.statusCode || 500;
		const message = statusCode < 500 ? err.message || 'An error occurred' : 'An error occurred';
		return jsonResponse({ error: message }, statusCode, origin, env);
	}
}

export default {
	fetch: withStripeHandler('POST', handleConfirmOrder),
} satisfies ExportedHandler<Env>;
