import { withStripeHandler, jsonResponse } from '../../utils';
import Stripe from 'stripe';

const MAX_SESSIONS = 1000;

interface ICheckoutSessionSearchParams {
	query: string;
	limit: number;
	page?: string;
}

function matchesSearch(session: Stripe.Checkout.Session, search: string): boolean {
	if (!search) return true;
	const q = search.toLowerCase();
	const email = (session.customer_details?.email || session.customer_email || '').toLowerCase();
	const name = (session.customer_details?.name || '').toLowerCase();
	const id = session.id.toLowerCase();
	return email.includes(q) || name.includes(q) || id.includes(q);
}

function buildSearchQuery(search: string, status: string, paymentStatus: string): string {
	const conditions: string[] = [];
	if (status && status !== 'ALL') {
		conditions.push(`status:'${status}'`);
	}
	if (paymentStatus && paymentStatus !== 'ALL') {
		conditions.push(`payment_status:'${paymentStatus}'`);
	}
	if (search) {
		const escaped = search.replace(/'/g, "\\'");
		conditions.push(`(customer_details.email:'${escaped}' OR customer_details.name:'${escaped}' OR customer_email:'${escaped}')`);
	}
	return conditions.join(' AND ');
}

async function searchAllMatchingSessions(stripe: Stripe, query: string, max: number = MAX_SESSIONS): Promise<Stripe.Checkout.Session[]> {
	const allSessions: Stripe.Checkout.Session[] = [];
	let hasMore = true;
	let page: string | undefined;

	while (hasMore && allSessions.length < max) {
		const params: ICheckoutSessionSearchParams = {
			query,
			limit: Math.min(100, max - allSessions.length),
		};
		if (page) params.page = page;
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const sessionResource = stripe.checkout.sessions as any;
		const result = (await sessionResource.search(params)) as {
			data: Stripe.Checkout.Session[];
			has_more: boolean;
			next_page: string | null;
			total_details?: { total_count: number };
		};
		allSessions.push(...result.data);
		hasMore = result.has_more;
		page = result.next_page || undefined;
	}

	return allSessions;
}

function paginateArray<T extends { id: string }>(
	items: T[],
	limit: number,
	startingAfter?: string,
): { data: T[]; hasMore: boolean; lastId: string | null } {
	if (startingAfter) {
		const startIndex = items.findIndex((item) => item.id === startingAfter);
		if (startIndex !== -1) {
			const sliced = items.slice(startIndex + 1, startIndex + 1 + limit);
			return {
				data: sliced,
				hasMore: startIndex + 1 + limit < items.length,
				lastId: sliced[sliced.length - 1]?.id || null,
			};
		}
	}
	const sliced = items.slice(0, limit);
	return {
		data: sliced,
		hasMore: limit < items.length,
		lastId: sliced[sliced.length - 1]?.id || null,
	};
}

export async function handleGetOrders(stripe: Stripe, request: Request, env: Env, origin: string | null): Promise<Response> {
	try {
		const url = new URL(request.url);
		const orderIdMatch = url.pathname.match(/\/orders\/([^/]+)/);
		const orderId = orderIdMatch ? orderIdMatch[1] : null;

		const search = url.searchParams.get('search') || '';
		const status = url.searchParams.get('status') || '';
		const paymentStatus = url.searchParams.get('payment_status') || '';

		if (orderId) {
			const retrieveParams: Stripe.Checkout.SessionRetrieveParams = {
				expand: ['customer', 'payment_intent'],
			};
			const session = await stripe.checkout.sessions.retrieve(orderId, retrieveParams);
			const lineItems = await stripe.checkout.sessions.listLineItems(orderId, { limit: 100 });
			return jsonResponse({ session, line_items: lineItems.data }, 200, origin, env);
		}

		const limit = parseInt(url.searchParams.get('limit') || '10', 10);
		const startingAfter = url.searchParams.get('starting_after') || undefined;

		let resultData: Record<string, unknown>;

		if (search || (status && status !== 'ALL') || (paymentStatus && paymentStatus !== 'ALL')) {
			const query = buildSearchQuery(search, status, paymentStatus);
			const allSessions = await searchAllMatchingSessions(stripe, query);
			const filtered = search ? allSessions.filter((s) => matchesSearch(s, search)) : allSessions;
			const paginated = paginateArray(filtered, limit, startingAfter);
			resultData = {
				data: paginated.data,
				has_more: paginated.hasMore,
				total_count: filtered.length,
			};
		} else {
			const listParams: Stripe.Checkout.SessionListParams = { limit };
			if (startingAfter) listParams.starting_after = startingAfter;
			const stripeResult = await stripe.checkout.sessions.list(listParams);

			resultData = {
				...stripeResult,
				total_count: stripeResult.data.length,
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
