import { withStripeHandler, jsonOk, stripeErrorResponse } from '../../utils';
import { EStaffRole } from '@bee-epic/shared';
import Stripe from 'stripe';
import { paginateArray } from '../../utils';

/** Upper bound on Checkout Sessions walked per request — caps unbounded Stripe paging. */
const MAX_SESSIONS = 1000;

/** Case-insensitive match over a session's customer email, name, or session id. Empty search matches all. */
function matchesSearch(session: Stripe.Checkout.Session, search: string): boolean {
	if (!search) return true;
	const q = search.toLowerCase();
	const email = (session.customer_details?.email || session.customer_email || '').toLowerCase();
	const name = (session.customer_details?.name || '').toLowerCase();
	const id = session.id.toLowerCase();
	return email.includes(q) || name.includes(q) || id.includes(q);
}

/** Match on Stripe session `status`. Empty or `'ALL'` matches all. */
function matchesStatus(session: Stripe.Checkout.Session, status: string): boolean {
	if (!status || status === 'ALL') return true;
	return session.status === status;
}

/** Match on Stripe session `payment_status`. Empty or `'ALL'` matches all. */
function matchesPaymentStatus(session: Stripe.Checkout.Session, paymentStatus: string): boolean {
	if (!paymentStatus || paymentStatus === 'ALL') return true;
	return session.payment_status === paymentStatus;
}

/** Match on the app-defined `order_status` session metadata. Empty or `'ALL'` matches all. */
function matchesOrderStatus(session: Stripe.Checkout.Session, orderStatus: string): boolean {
	if (!orderStatus || orderStatus === 'ALL') return true;
	const metadata = session.metadata as Record<string, string> | undefined;
	return metadata?.order_status === orderStatus;
}

/** Pages Checkout Sessions (100/page) up to `max`, so filtering/pagination can run over the batch in-memory. */
async function fetchCappedSessions(stripe: Stripe, max: number = MAX_SESSIONS): Promise<Stripe.Checkout.Session[]> {
	const allSessions: Stripe.Checkout.Session[] = [];
	let hasMore = true;
	let startingAfter: string | undefined;

	while (hasMore && allSessions.length < max) {
		const batchSize = Math.min(100, max - allSessions.length);
		const params: Stripe.Checkout.SessionListParams = { limit: batchSize };
		if (startingAfter) params.starting_after = startingAfter;
		const page = await stripe.checkout.sessions.list(params);
		allSessions.push(...page.data);
		hasMore = page.has_more;
		startingAfter = page.data[page.data.length - 1]?.id;
	}

	return allSessions;
}

/**
 * GET /orders and GET /orders/:id — list or retrieve Checkout Sessions as
 * orders (requires EMPLOYEE).
 *
 * With an id it returns the expanded session plus its line items. Otherwise it
 * lists orders; when any `search` / `status` / `payment_status` / `order_status`
 * filter is present it walks the capped session set and filters in-memory,
 * then paginates. Unfiltered listing paginates the capped set directly.
 */
export async function handleGetOrders(stripe: Stripe, request: Request, env: Env, origin: string | null): Promise<Response> {
	const url = new URL(request.url);
	const orderIdMatch = url.pathname.match(/\/orders\/([^/]+)/);
	const orderId = orderIdMatch ? orderIdMatch[1] : null;

	const search = url.searchParams.get('search') || '';
	const status = url.searchParams.get('status') || '';
	const paymentStatus = url.searchParams.get('payment_status') || '';
	const orderStatus = url.searchParams.get('order_status') || '';

	try {
		if (orderId) {
			const retrieveParams: Stripe.Checkout.SessionRetrieveParams = { expand: ['customer', 'payment_intent'] };
			const session = await stripe.checkout.sessions.retrieve(orderId, retrieveParams);
			const lineItems = await stripe.checkout.sessions.listLineItems(orderId, { limit: 100, expand: ['data.price.product'] });
			return jsonOk({ session, line_items: lineItems.data }, origin, env);
		}

		const limit = parseInt(url.searchParams.get('limit') || '10', 10);
		const startingAfter = url.searchParams.get('starting_after') || undefined;

		let resultData: Record<string, unknown>;

		if (search || (status && status !== 'ALL') || (paymentStatus && paymentStatus !== 'ALL') || (orderStatus && orderStatus !== 'ALL')) {
			const allSessions = await fetchCappedSessions(stripe);
			const filtered = allSessions.filter(
				(s) =>
					matchesSearch(s, search) &&
					matchesStatus(s, status) &&
					matchesPaymentStatus(s, paymentStatus) &&
					matchesOrderStatus(s, orderStatus),
			);
			const paginated = paginateArray(filtered, limit, startingAfter);
			resultData = { data: paginated.data, has_more: paginated.hasMore, total_count: filtered.length };
		} else {
			const allSessions = await fetchCappedSessions(stripe);
			const paginated = paginateArray(allSessions, limit, startingAfter);
			resultData = { data: paginated.data, has_more: paginated.hasMore, total_count: allSessions.length };
		}

		return jsonOk(resultData, origin, env);
	} catch (error) {
		return stripeErrorResponse(error, origin, env, orderId ? `order:${orderId}` : 'orders');
	}
}

export default {
	fetch: withStripeHandler('GET', handleGetOrders, { requiredRole: EStaffRole.EMPLOYEE }),
} satisfies ExportedHandler<Env>;
