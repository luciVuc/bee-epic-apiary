// workers/create-product.ts
import { withStripeHandler } from '../../utils';
import Stripe from 'stripe';
import { jsonResponse } from '../../utils';

export default {
	fetch: withStripeHandler('POST', async (stripe: Stripe, request: Request, env: Env, origin: string | null) => {
		// Parse request body
		const productData = (await request.json()) as Stripe.ProductCreateParams;
		const product = await stripe.products.create(productData);
		return jsonResponse(product, 200, origin, env);
	}),
} satisfies ExportedHandler<Env>;
