import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleUpdateOrder } from '../../src/stripe/order/update-order';
import Stripe from 'stripe';

describe('handleUpdateOrder', () => {
	let mockStripe: any;

	beforeEach(() => {
		vi.restoreAllMocks();

		mockStripe = {
			checkout: {
				sessions: {
					update: vi.fn(),
				},
			},
		};
	});

	it('returns 400 when order ID is missing', async () => {
		const request = new Request('http://example.com/orders/', {
			method: 'PUT',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ metadata: { key: 'value' } }),
		});
		const env = { STRIPE_SECRET_KEY: 'sk_test_123', ALLOWED_ORIGINS: 'https://example.com' } as Env;
		const response = await handleUpdateOrder(mockStripe as Stripe, request, env, 'https://example.com');
		expect(response.status).toBe(400);

		const body = (await response.json()) as any;
		expect(body.error).toBe('Order ID is required');
	});

	it('updates metadata successfully', async () => {
		const mockSession = { id: 'cs_test_123', metadata: { key: 'value' } };
		mockStripe.checkout.sessions.update.mockResolvedValue(mockSession);

		const request = new Request('http://example.com/orders/cs_test_123', {
			method: 'PUT',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ metadata: { key: 'value' } }),
		});
		const env = { STRIPE_SECRET_KEY: 'sk_test_123', ALLOWED_ORIGINS: 'https://example.com' } as Env;
		const response = await handleUpdateOrder(mockStripe as Stripe, request, env, 'https://example.com');
		expect(response.status).toBe(200);

		const body = (await response.json()) as any;
		expect(body.metadata.key).toBe('value');
		expect(mockStripe.checkout.sessions.update).toHaveBeenCalledWith('cs_test_123', { metadata: { key: 'value' } });
	});

	it('calls update with empty params when no metadata provided', async () => {
		const mockSession = { id: 'cs_test_123' };
		mockStripe.checkout.sessions.update.mockResolvedValue(mockSession);

		const request = new Request('http://example.com/orders/cs_test_123', {
			method: 'PUT',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({}),
		});
		const env = { STRIPE_SECRET_KEY: 'sk_test_123', ALLOWED_ORIGINS: 'https://example.com' } as Env;
		const response = await handleUpdateOrder(mockStripe as Stripe, request, env, 'https://example.com');
		expect(response.status).toBe(200);

		expect(mockStripe.checkout.sessions.update).toHaveBeenCalledWith('cs_test_123', {});
	});

	it('returns Stripe error message on 4xx Stripe failure', async () => {
		mockStripe.checkout.sessions.update.mockRejectedValue({ statusCode: 400, message: 'No such checkout session' });

		const request = new Request('http://example.com/orders/cs_bad', {
			method: 'PUT',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ metadata: { key: 'value' } }),
		});
		const env = { STRIPE_SECRET_KEY: 'sk_test_123', ALLOWED_ORIGINS: 'https://example.com' } as Env;
		const response = await handleUpdateOrder(mockStripe as Stripe, request, env, 'https://example.com');
		expect(response.status).toBe(400);

		const body = (await response.json()) as any;
		expect(body.error).toBe('No such checkout session');
	});

	it('returns 500 and generic error for unexpected errors', async () => {
		mockStripe.checkout.sessions.update.mockRejectedValue(new Error('Unexpected'));

		const request = new Request('http://example.com/orders/cs_test_123', {
			method: 'PUT',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ metadata: { key: 'value' } }),
		});
		const env = { STRIPE_SECRET_KEY: 'sk_test_123', ALLOWED_ORIGINS: 'https://example.com' } as Env;
		const response = await handleUpdateOrder(mockStripe as Stripe, request, env, 'https://example.com');
		expect(response.status).toBe(500);

		const body = (await response.json()) as any;
		expect(body.error).toBe('An error occurred');
	});

	it('notifies NotificationHub when order_status is set to new', async () => {
		const mockSession = { id: 'cs_test_123', metadata: { order_status: 'new' } };
		mockStripe.checkout.sessions.update.mockResolvedValue(mockSession);

		const mockNotify = vi.fn().mockResolvedValue(undefined);
		const mockStub = { notify: mockNotify };
		const mockNotificationHub = { getByName: vi.fn().mockReturnValue(mockStub) };

		const request = new Request('http://example.com/orders/cs_test_123', {
			method: 'PUT',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ metadata: { order_status: 'new' } }),
		});
		const env = {
			STRIPE_SECRET_KEY: 'sk_test_123',
			ALLOWED_ORIGINS: 'https://example.com',
			NOTIFICATION_HUB: mockNotificationHub,
		} as unknown as Env;
		const response = await handleUpdateOrder(mockStripe as Stripe, request, env, 'https://example.com');
		expect(response.status).toBe(200);

		const body = (await response.json()) as any;
		expect(body.metadata.order_status).toBe('new');
		expect(mockNotificationHub.getByName).toHaveBeenCalledWith('default');
		expect(mockNotify).toHaveBeenCalledWith('cs_test_123');
	});

	it('does not notify NotificationHub when order_status is not new', async () => {
		const mockSession = { id: 'cs_test_123', metadata: { order_status: 'pending' } };
		mockStripe.checkout.sessions.update.mockResolvedValue(mockSession);

		const mockNotify = vi.fn();
		const mockStub = { notify: mockNotify };
		const mockNotificationHub = { getByName: vi.fn().mockReturnValue(mockStub) };

		const request = new Request('http://example.com/orders/cs_test_123', {
			method: 'PUT',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ metadata: { order_status: 'pending' } }),
		});
		const env = {
			STRIPE_SECRET_KEY: 'sk_test_123',
			ALLOWED_ORIGINS: 'https://example.com',
			NOTIFICATION_HUB: mockNotificationHub,
		} as unknown as Env;
		const response = await handleUpdateOrder(mockStripe as Stripe, request, env, 'https://example.com');
		expect(response.status).toBe(200);

		expect(mockNotify).not.toHaveBeenCalled();
	});

	it('updates with empty metadata object', async () => {
		const mockSession = { id: 'cs_test_123', metadata: {} };
		mockStripe.checkout.sessions.update.mockResolvedValue(mockSession);

		const request = new Request('http://example.com/orders/cs_test_123', {
			method: 'PUT',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ metadata: {} }),
		});
		const env = { STRIPE_SECRET_KEY: 'sk_test_123', ALLOWED_ORIGINS: 'https://example.com' } as Env;
		const response = await handleUpdateOrder(mockStripe as Stripe, request, env, 'https://example.com');
		expect(response.status).toBe(200);
		expect(mockStripe.checkout.sessions.update).toHaveBeenCalledWith('cs_test_123', { metadata: {} });
	});

	it('updates collected_information with shipping details', async () => {
		const mockSession = {
			id: 'cs_test_123',
			metadata: { order_status: 'pending' },
			shipping_details: { name: 'Alice', address: { line1: '123 Main St', city: 'Springfield', country: 'US' } },
		};
		mockStripe.checkout.sessions.update.mockResolvedValue(mockSession);

		const request = new Request('http://example.com/orders/cs_test_123', {
			method: 'PUT',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				metadata: { order_status: 'pending' },
				collected_information: {
					shipping_details: {
						name: 'Alice',
						address: { line1: '123 Main St', city: 'Springfield', country: 'US' },
					},
				},
			}),
		});
		const env = { STRIPE_SECRET_KEY: 'sk_test_123', ALLOWED_ORIGINS: 'https://example.com' } as Env;
		const response = await handleUpdateOrder(mockStripe as Stripe, request, env, 'https://example.com');
		expect(response.status).toBe(200);
		expect(mockStripe.checkout.sessions.update).toHaveBeenCalledWith('cs_test_123', {
			metadata: { order_status: 'pending' },
			collected_information: {
				shipping_details: {
					name: 'Alice',
					address: { line1: '123 Main St', city: 'Springfield', country: 'US' },
				},
			},
		});
	});

	it('updates with only collected_information and no metadata', async () => {
		const mockSession = { id: 'cs_test_123', shipping_details: { name: 'Bob' } };
		mockStripe.checkout.sessions.update.mockResolvedValue(mockSession);

		const request = new Request('http://example.com/orders/cs_test_123', {
			method: 'PUT',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				collected_information: {
					shipping_details: { name: 'Bob' },
				},
			}),
		});
		const env = { STRIPE_SECRET_KEY: 'sk_test_123', ALLOWED_ORIGINS: 'https://example.com' } as Env;
		const response = await handleUpdateOrder(mockStripe as Stripe, request, env, 'https://example.com');
		expect(response.status).toBe(200);
		expect(mockStripe.checkout.sessions.update).toHaveBeenCalledWith('cs_test_123', {
			collected_information: {
				shipping_details: { name: 'Bob' },
			},
		});
	});
});
