import Stripe from 'stripe';
import { jsonResponse, withStripeHandler } from '../../utils';

export async function handleCreatePrice(stripe: Stripe, request: Request, env: Env, origin: string | null): Promise<Response> {
	try {
		const priceData = (await request.json()) as Stripe.PriceCreateParams;

		if (!priceData.product || typeof priceData.product !== 'string') {
			return jsonResponse({ error: 'Product ID is required' }, 400, origin, env);
		}

		if (!priceData.unit_amount || priceData.unit_amount <= 0) {
			return jsonResponse({ error: 'Valid unit_amount is required' }, 400, origin, env);
		}

		if (!priceData.currency || typeof priceData.currency !== 'string') {
			return jsonResponse({ error: 'Currency is required' }, 400, origin, env);
		}

		if (priceData.lookup_key && typeof priceData.lookup_key !== 'string') {
			return jsonResponse({ error: 'lookup_key must be a string' }, 400, origin, env);
		}

		const price = await stripe.prices.create(priceData);
		return jsonResponse(price, 201, origin, env);
	} catch (error: any) {
		console.error('Create price error:', error);
		const statusCode = error.statusCode || 500;
		const message = statusCode < 500 ? error.message || 'An error occurred' : 'An error occurred';
		return jsonResponse({ error: message }, statusCode, origin, env);
	}
}

export default {
	fetch: withStripeHandler('POST', handleCreatePrice, { requireAuth: true }),
} satisfies ExportedHandler<Env>;
