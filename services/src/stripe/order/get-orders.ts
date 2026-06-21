import { withStripeHandler, jsonResponse, paginateArray } from '../../utils';
import Stripe from 'stripe';

const MAX_SESSIONS = 1000;

function matchesSearch(session: Stripe.Checkout.Session, search: string): boolean {
	if (!search) return true;
	const q = search.toLowerCase();
	const email = (session.customer_details?.email || session.customer_email || '').toLowerCase();
	const name = (session.customer_details?.name || '').toLowerCase();
	const id = session.id.toLowerCase();
	return email.includes(q) || name.includes(q) || id.includes(q);
}

function matchesStatus(session: Stripe.Checkout.Session, status: string): boolean {
	if (!status || status === 'ALL') return true;
	return session.status === status;
}

function matchesPaymentStatus(session: Stripe.Checkout.Session, paymentStatus: string): boolean {
	if (!paymentStatus || paymentStatus === 'ALL') return true;
	return session.payment_status === paymentStatus;
}

function matchesOrderStatus(session: Stripe.Checkout.Session, orderStatus: string): boolean {
	if (!orderStatus || orderStatus === 'ALL') return true;
	const metadata = session.metadata as Record<string, string> | undefined;
	return metadata?.order_status === orderStatus;
}

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

export async function handleGetOrders(stripe: Stripe, request: Request, env: Env, origin: string | null): Promise<Response> {
	try {
		const url = new URL(request.url);
		const orderIdMatch = url.pathname.match(/\/orders\/([^/]+)/);
		const orderId = orderIdMatch ? orderIdMatch[1] : null;

		const search = url.searchParams.get('search') || '';
		const status = url.searchParams.get('status') || '';
		const paymentStatus = url.searchParams.get('payment_status') || '';
		const orderStatus = url.searchParams.get('order_status') || '';

		if (orderId) {
			const retrieveParams: Stripe.Checkout.SessionRetrieveParams = {
				expand: ['customer', 'payment_intent'],
			};
			const session = await stripe.checkout.sessions.retrieve(orderId, retrieveParams);
			const lineItems = await stripe.checkout.sessions.listLineItems(orderId, { limit: 100, expand: ['data.price.product'] });
			return jsonResponse({ session, line_items: lineItems.data }, 200, origin, env);
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
			resultData = {
				data: paginated.data,
				has_more: paginated.hasMore,
				total_count: filtered.length,
			};
		} else {
			const allSessions = await fetchCappedSessions(stripe);
			const paginated = paginateArray(allSessions, limit, startingAfter);
			resultData = {
				data: paginated.data,
				has_more: paginated.hasMore,
				total_count: allSessions.length,
			};
		}

		return jsonResponse(resultData, 200, origin, env);
	} catch (error: unknown) {
		const err = error as { statusCode?: number; message?: string };
		console.error('Get orders error:', err);
		const statusCode = err.statusCode || 500;
		const message = statusCode < 500 ? err.message || 'An error occurred' : 'An error occurred';
		return jsonResponse({ error: message }, statusCode, origin, env);
	}
}

export default {
	fetch: withStripeHandler('GET', handleGetOrders, { requireAuth: true }),
} satisfies ExportedHandler<Env>;
