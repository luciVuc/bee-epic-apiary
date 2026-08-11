import Stripe from 'stripe';
import { EStaffRole } from '@bee-epic/shared';
import { jsonOk, jsonErr, withStripeHandler, stripeErrorResponse } from '../../utils';

/**
 * POST /prices — create a Stripe price for a product (requires MANAGER).
 *
 * Validates the required `product`, a positive `unit_amount`, and `currency`
 * (plus an optional string `lookup_key`) before calling Stripe. Returns 201.
 */
export async function handleCreatePrice(stripe: Stripe, request: Request, env: Env, origin: string | null): Promise<Response> {
	const priceData = (await request.json()) as Stripe.PriceCreateParams;

	if (!priceData.product || typeof priceData.product !== 'string') {
		return jsonErr({ code: 'VALIDATION_FAILED', fields: { product: 'Product ID is required' } }, origin, env);
	}
	if (!priceData.unit_amount || priceData.unit_amount <= 0) {
		return jsonErr({ code: 'VALIDATION_FAILED', fields: { unit_amount: 'Valid unit_amount is required' } }, origin, env);
	}
	if (!priceData.currency || typeof priceData.currency !== 'string') {
		return jsonErr({ code: 'VALIDATION_FAILED', fields: { currency: 'Currency is required' } }, origin, env);
	}
	if (priceData.lookup_key && typeof priceData.lookup_key !== 'string') {
		return jsonErr({ code: 'VALIDATION_FAILED', fields: { lookup_key: 'lookup_key must be a string' } }, origin, env);
	}

	try {
		const price = await stripe.prices.create(priceData);
		return jsonOk(price, origin, env, 201);
	} catch (error) {
		return stripeErrorResponse(error, origin, env);
	}
}

export default {
	fetch: withStripeHandler('POST', handleCreatePrice, { requiredRole: EStaffRole.MANAGER }),
} satisfies ExportedHandler<Env>;
