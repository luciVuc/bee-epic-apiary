import { withStripeHandler, jsonOk, jsonErr, stripeErrorResponse } from '../../utils';
import { EStaffRole, ENotificationType, OrderUpdateRequestSchema } from '@bee-epic/shared';
import Stripe from 'stripe';

/**
 * PUT /orders/:id — update a Checkout Session's order metadata (requires
 * EMPLOYEE).
 *
 * Validates the body against `OrderUpdateRequestSchema` (strict-mode). Before
 * writing it snapshots the prior `order_status` so the SSE event can carry the
 * transition. After the Stripe update it fires a best-effort notification:
 * NEW_ORDER when the status becomes `new`, otherwise ORDER_STATUS_CHANGED when
 * the status actually changed.
 */
export async function handleUpdateOrder(stripe: Stripe, request: Request, env: Env, origin: string | null): Promise<Response> {
	const url = new URL(request.url);
	const orderIdMatch = url.pathname.match(/\/orders\/([^/]+)/);
	const orderId = orderIdMatch ? orderIdMatch[1] : null;

	if (!orderId) {
		return jsonErr({ code: 'VALIDATION_FAILED', fields: { id: 'Order ID is required' } }, origin, env);
	}

	const rawBody = (await request.json()) as unknown;
	const parsed = OrderUpdateRequestSchema.safeParse(rawBody);
	if (!parsed.success) {
		// Strict-mode rejects unknown fields so a future Stripe API addition can't
		// be smuggled through without a deliberate code change (review I14).
		// fieldErrors is Record<string, string[]>; the VALIDATION_FAILED envelope
		// wants Record<string, string>, so join each field's messages.
		const flat = parsed.error.flatten().fieldErrors as Record<string, string[] | undefined>;
		const fields = Object.fromEntries(Object.entries(flat).map(([k, v]) => [k, (v ?? []).join('; ')]));
		return jsonErr({ code: 'VALIDATION_FAILED', fields }, origin, env);
	}
	const body = parsed.data;

	// Capture the previous order_status before updating so the SSE event can carry it.
	let prevStatus: string | null = null;
	if (body.metadata?.order_status) {
		try {
			const existing = await stripe.checkout.sessions.retrieve(orderId);
			prevStatus = (existing?.metadata?.order_status as string | undefined) ?? null;
		} catch (retrieveErr) {
			console.error('Failed to read prior order status:', retrieveErr);
		}
	}

	const updateParams: Stripe.Checkout.SessionUpdateParams = {};
	if (body.metadata) updateParams.metadata = body.metadata;
	if (body.collected_information)
		updateParams.collected_information = body.collected_information as Stripe.Checkout.SessionUpdateParams.CollectedInformation;

	let session: Stripe.Checkout.Session;
	try {
		session = await stripe.checkout.sessions.update(orderId, updateParams);
	} catch (error) {
		return stripeErrorResponse(error, origin, env, `order:${orderId}`);
	}

	const nextStatus = body.metadata?.order_status;
	if (nextStatus) {
		try {
			const stub = env.NOTIFICATION_HUB.getByName('default');
			if (nextStatus === 'new') {
				await stub.notify({ type: ENotificationType.NEW_ORDER, orderId });
			} else if (prevStatus !== nextStatus) {
				await stub.notify({ type: ENotificationType.ORDER_STATUS_CHANGED, orderId, prevStatus, nextStatus });
			}
		} catch (error) {
			console.error('Failed to send admin notification on status update:', error);
		}
	}

	return jsonOk(session, origin, env);
}

export default {
	fetch: withStripeHandler('PUT', handleUpdateOrder, { requiredRole: EStaffRole.EMPLOYEE }),
} satisfies ExportedHandler<Env>;
