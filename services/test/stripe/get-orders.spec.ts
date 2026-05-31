import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleGetOrders } from '../../src/stripe/order/get-orders';
import Stripe from 'stripe';

function createMockSession(overrides: Record<string, unknown> = {}): Stripe.Checkout.Session {
	return {
		id: 'cs_test_123',
		object: 'checkout.session',
		created: 1700000000,
		status: 'open',
		payment_status: 'unpaid',
		mode: 'payment',
		amount_total: 2000,
		amount_subtotal: 2000,
		currency: 'usd',
		customer_details: { email: 'test@example.com', name: 'Test User' },
		customer_email: null,
		metadata: {},
		url: 'https://checkout.stripe.com/cs_test_123',
		...overrides,
	} as unknown as Stripe.Checkout.Session;
}

function createMockSearchResult(data: Stripe.Checkout.Session[], has_more = false, next_page: string | null = null) {
	return {
		data,
		has_more,
		next_page,
		total_details: { total_count: data.length },
	};
}

describe('handleGetOrders', () => {
	let mockStripe: any;

	beforeEach(() => {
		vi.restoreAllMocks();

		mockStripe = {
			checkout: {
				sessions: {
					retrieve: vi.fn(),
					list: vi.fn(),
					listLineItems: vi.fn(),
					update: vi.fn(),
					search: vi.fn(),
				},
			},
		};
	});

	it('returns 200 with single order and line items when order ID is provided', async () => {
		const mockSession = createMockSession();
		const mockLineItems = {
			data: [
				{
					id: 'li_1',
					description: 'Item 1',
					amount_total: 1000,
					amount_subtotal: 1000,
					currency: 'usd',
					quantity: 1,
					price: { id: 'price_1', unit_amount: 1000, currency: 'usd' },
				},
			],
		};

		mockStripe.checkout.sessions.retrieve.mockResolvedValue(mockSession);
		mockStripe.checkout.sessions.listLineItems.mockResolvedValue(mockLineItems);

		const request = new Request('http://example.com/orders/cs_test_123', { method: 'GET' });
		const env = { STRIPE_SECRET_KEY: 'sk_test_123', ALLOWED_ORIGINS: 'https://example.com' } as Env;
		const response = await handleGetOrders(mockStripe as Stripe, request, env, 'https://example.com');
		expect(response.status).toBe(200);

		const body = (await response.json()) as any;
		expect(body.session.id).toBe('cs_test_123');
		expect(body.line_items).toHaveLength(1);
		expect(body.line_items[0].id).toBe('li_1');
		expect(mockStripe.checkout.sessions.retrieve).toHaveBeenCalledWith('cs_test_123', { expand: ['customer', 'payment_intent'] });
	});

	it('returns paginated list without filters', async () => {
		const mockSessions = [createMockSession({ id: 'cs_1' }), createMockSession({ id: 'cs_2' })];
		mockStripe.checkout.sessions.list.mockResolvedValue({ data: mockSessions, has_more: false });

		const request = new Request('http://example.com/orders?limit=2', { method: 'GET' });
		const env = { STRIPE_SECRET_KEY: 'sk_test_123', ALLOWED_ORIGINS: 'https://example.com' } as Env;
		const response = await handleGetOrders(mockStripe as Stripe, request, env, 'https://example.com');
		expect(response.status).toBe(200);

		const body = (await response.json()) as any;
		expect(body.data).toHaveLength(2);
		expect(body.has_more).toBe(false);
		expect(body.total_count).toBe(2);
	});

	it('returns paginated list with starting_after param', async () => {
		mockStripe.checkout.sessions.list.mockResolvedValue({ data: [createMockSession({ id: 'cs_3' })], has_more: false });

		const request = new Request('http://example.com/orders?limit=1&starting_after=cs_2', { method: 'GET' });
		const env = { STRIPE_SECRET_KEY: 'sk_test_123', ALLOWED_ORIGINS: 'https://example.com' } as Env;
		const response = await handleGetOrders(mockStripe as Stripe, request, env, 'https://example.com');
		expect(response.status).toBe(200);

		expect(mockStripe.checkout.sessions.list).toHaveBeenCalledWith({ limit: 1, starting_after: 'cs_2' });
	});

	it('filters by status server-side via Search API', async () => {
		const sessions = [
			createMockSession({ id: 'cs_1', status: 'open' }),
			createMockSession({ id: 'cs_2', status: 'complete' }),
			createMockSession({ id: 'cs_3', status: 'open' }),
		];
		const openSessions = sessions.filter((s) => s.status === 'open');
		mockStripe.checkout.sessions.search.mockResolvedValue(createMockSearchResult(openSessions));

		const request = new Request('http://example.com/orders?status=open', { method: 'GET' });
		const env = { STRIPE_SECRET_KEY: 'sk_test_123', ALLOWED_ORIGINS: 'https://example.com' } as Env;
		const response = await handleGetOrders(mockStripe as Stripe, request, env, 'https://example.com');
		expect(response.status).toBe(200);

		const body = (await response.json()) as any;
		expect(body.data).toHaveLength(2);
		expect(body.data[0].id).toBe('cs_1');
		expect(body.data[1].id).toBe('cs_3');
		expect(mockStripe.checkout.sessions.search).toHaveBeenCalledWith(
			expect.objectContaining({ query: expect.stringContaining("status:'open'") }),
		);
	});

	it('filters by search term via Search API + client-side name/ID fallback', async () => {
		const sessions = [
			createMockSession({ id: 'cs_1', customer_details: { email: 'alice@test.com', name: 'Alice' } }),
			createMockSession({ id: 'cs_2', customer_details: { email: 'bob@test.com', name: 'Bob' } }),
		];
		mockStripe.checkout.sessions.search.mockResolvedValue(createMockSearchResult(sessions));

		const request = new Request('http://example.com/orders?search=alice', { method: 'GET' });
		const env = { STRIPE_SECRET_KEY: 'sk_test_123', ALLOWED_ORIGINS: 'https://example.com' } as Env;
		const response = await handleGetOrders(mockStripe as Stripe, request, env, 'https://example.com');
		expect(response.status).toBe(200);

		const body = (await response.json()) as any;
		expect(body.data).toHaveLength(1);
		expect(body.data[0].id).toBe('cs_1');
		expect(mockStripe.checkout.sessions.search).toHaveBeenCalledWith(
			expect.objectContaining({ query: expect.stringContaining("customer_details.email:'alice'") }),
		);
	});

	it('filters by payment status via Search API', async () => {
		const sessions = [
			createMockSession({ id: 'cs_1', payment_status: 'paid' }),
			createMockSession({ id: 'cs_2', payment_status: 'unpaid' }),
		];
		const paidSessions = sessions.filter((s) => s.payment_status === 'paid');
		mockStripe.checkout.sessions.search.mockResolvedValue(createMockSearchResult(paidSessions));

		const request = new Request('http://example.com/orders?payment_status=paid', { method: 'GET' });
		const env = { STRIPE_SECRET_KEY: 'sk_test_123', ALLOWED_ORIGINS: 'https://example.com' } as Env;
		const response = await handleGetOrders(mockStripe as Stripe, request, env, 'https://example.com');
		expect(response.status).toBe(200);

		const body = (await response.json()) as any;
		expect(body.data).toHaveLength(1);
		expect(body.data[0].id).toBe('cs_1');
	});

	it('returns empty data when no sessions match search', async () => {
		mockStripe.checkout.sessions.search.mockResolvedValue(createMockSearchResult([]));

		const request = new Request('http://example.com/orders?search=nonexistent', { method: 'GET' });
		const env = { STRIPE_SECRET_KEY: 'sk_test_123', ALLOWED_ORIGINS: 'https://example.com' } as Env;
		const response = await handleGetOrders(mockStripe as Stripe, request, env, 'https://example.com');
		expect(response.status).toBe(200);

		const body = (await response.json()) as any;
		expect(body.data).toHaveLength(0);
		expect(body.total_count).toBe(0);
	});

	it('returns Stripe error message for 4xx errors', async () => {
		mockStripe.checkout.sessions.retrieve.mockRejectedValue({ statusCode: 404, message: 'No such checkout session' });

		const request = new Request('http://example.com/orders/cs_invalid', { method: 'GET' });
		const env = { STRIPE_SECRET_KEY: 'sk_test_123', ALLOWED_ORIGINS: 'https://example.com' } as Env;
		const response = await handleGetOrders(mockStripe as Stripe, request, env, 'https://example.com');
		expect(response.status).toBe(404);

		const body = (await response.json()) as any;
		expect(body.error).toBe('No such checkout session');
	});

	it('returns 500 and generic error for unexpected errors', async () => {
		mockStripe.checkout.sessions.list.mockRejectedValue(new Error('Unexpected'));

		const request = new Request('http://example.com/orders', { method: 'GET' });
		const env = { STRIPE_SECRET_KEY: 'sk_test_123', ALLOWED_ORIGINS: 'https://example.com' } as Env;
		const response = await handleGetOrders(mockStripe as Stripe, request, env, 'https://example.com');
		expect(response.status).toBe(500);

		const body = (await response.json()) as any;
		expect(body.error).toBe('An error occurred');
	});

	it('caps sessions at MAX_SESSIONS limit via Search API', async () => {
		const manySessions = Array.from({ length: 100 }, (_, i) => createMockSession({ id: `cs_${i}` }));
		const searchResult = (hasMore: boolean, nextPage: string | null) => createMockSearchResult(manySessions, hasMore, nextPage);
		mockStripe.checkout.sessions.search
			.mockResolvedValueOnce(searchResult(true, 'page_1'))
			.mockResolvedValueOnce(searchResult(true, 'page_2'))
			.mockResolvedValueOnce(searchResult(true, 'page_3'))
			.mockResolvedValueOnce(searchResult(true, 'page_4'))
			.mockResolvedValueOnce(searchResult(true, 'page_5'))
			.mockResolvedValueOnce(searchResult(true, 'page_6'))
			.mockResolvedValueOnce(searchResult(true, 'page_7'))
			.mockResolvedValueOnce(searchResult(true, 'page_8'))
			.mockResolvedValueOnce(searchResult(true, 'page_9'))
			.mockResolvedValueOnce(searchResult(true, 'page_10'))
			.mockResolvedValue(searchResult(true, null));

		const request = new Request('http://example.com/orders?search=test', { method: 'GET' });
		const env = { STRIPE_SECRET_KEY: 'sk_test_123', ALLOWED_ORIGINS: 'https://example.com' } as Env;
		const response = await handleGetOrders(mockStripe as Stripe, request, env, 'https://example.com');
		expect(response.status).toBe(200);

		// Should have stopped fetching after 10 calls (1000 sessions = 10 * 100)
		expect(mockStripe.checkout.sessions.search).toHaveBeenCalledTimes(10);
	});

	it('filters with status ALL returns all sessions', async () => {
		const sessions = [createMockSession({ id: 'cs_1', status: 'open' }), createMockSession({ id: 'cs_2', status: 'complete' })];
		mockStripe.checkout.sessions.list.mockResolvedValue({ data: sessions, has_more: false });

		const request = new Request('http://example.com/orders?status=ALL', { method: 'GET' });
		const env = { STRIPE_SECRET_KEY: 'sk_test_123', ALLOWED_ORIGINS: 'https://example.com' } as Env;
		const response = await handleGetOrders(mockStripe as Stripe, request, env, 'https://example.com');
		expect(response.status).toBe(200);

		const body = (await response.json()) as any;
		expect(body.data).toHaveLength(2);
	});
});
