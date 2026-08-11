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
					retrieve: vi.fn(),
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
		expect(body.ok).toBe(false);
		expect(body.error.code).toBe('VALIDATION_FAILED');
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
		expect(body.ok).toBe(true);
		expect(body.data.metadata.key).toBe('value');
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
		expect(body.ok).toBe(false);
		expect(body.error.code).toBe('BAD_REQUEST');
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
		expect(body.ok).toBe(false);
		expect(body.error.code).toBe('INTERNAL');
	});

	it('notifies NotificationHub when order_status is set to new', async () => {
		const mockSession = { id: 'cs_test_123', metadata: { order_status: 'new' } };
		mockStripe.checkout.sessions.update.mockResolvedValue(mockSession);
		mockStripe.checkout.sessions.retrieve.mockResolvedValue({ id: 'cs_test_123', metadata: { order_status: 'pending' } });

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
		expect(body.ok).toBe(true);
		expect(body.data.metadata.order_status).toBe('new');
		expect(mockNotificationHub.getByName).toHaveBeenCalledWith('default');
		expect(mockNotify).toHaveBeenCalledWith({ type: 'new-order', orderId: 'cs_test_123' });
	});

	it('fires order-status-changed when order_status transitions to a non-new value', async () => {
		mockStripe.checkout.sessions.update.mockResolvedValue({ id: 'cs_test_123', metadata: { order_status: 'fulfilled' } });
		mockStripe.checkout.sessions.retrieve.mockResolvedValue({ id: 'cs_test_123', metadata: { order_status: 'pending' } });

		const mockNotify = vi.fn().mockResolvedValue(undefined);
		const mockNotificationHub = { getByName: vi.fn().mockReturnValue({ notify: mockNotify }) };

		const request = new Request('http://example.com/orders/cs_test_123', {
			method: 'PUT',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ metadata: { order_status: 'fulfilled' } }),
		});
		const env = {
			STRIPE_SECRET_KEY: 'sk_test_123',
			ALLOWED_ORIGINS: 'https://example.com',
			NOTIFICATION_HUB: mockNotificationHub,
		} as unknown as Env;
		const response = await handleUpdateOrder(mockStripe as Stripe, request, env, 'https://example.com');
		expect(response.status).toBe(200);
		expect(mockNotify).toHaveBeenCalledWith({
			type: 'order-status-changed',
			orderId: 'cs_test_123',
			prevStatus: 'pending',
			nextStatus: 'fulfilled',
		});
	});

	it('does not fire order-status-changed when status did not actually change', async () => {
		mockStripe.checkout.sessions.update.mockResolvedValue({ id: 'cs_test_123', metadata: { order_status: 'fulfilled' } });
		mockStripe.checkout.sessions.retrieve.mockResolvedValue({ id: 'cs_test_123', metadata: { order_status: 'fulfilled' } });

		const mockNotify = vi.fn().mockResolvedValue(undefined);
		const mockNotificationHub = { getByName: vi.fn().mockReturnValue({ notify: mockNotify }) };

		const request = new Request('http://example.com/orders/cs_test_123', {
			method: 'PUT',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ metadata: { order_status: 'fulfilled' } }),
		});
		const env = {
			STRIPE_SECRET_KEY: 'sk_test_123',
			ALLOWED_ORIGINS: 'https://example.com',
			NOTIFICATION_HUB: mockNotificationHub,
		} as unknown as Env;
		await handleUpdateOrder(mockStripe as Stripe, request, env, 'https://example.com');
		expect(mockNotify).not.toHaveBeenCalled();
	});

	it('fires order-status-changed with prevStatus=null when prior fetch fails', async () => {
		mockStripe.checkout.sessions.update.mockResolvedValue({ id: 'cs_test_123', metadata: { order_status: 'fulfilled' } });
		mockStripe.checkout.sessions.retrieve.mockRejectedValue(new Error('Network blip'));

		const mockNotify = vi.fn().mockResolvedValue(undefined);
		const mockNotificationHub = { getByName: vi.fn().mockReturnValue({ notify: mockNotify }) };

		const request = new Request('http://example.com/orders/cs_test_123', {
			method: 'PUT',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ metadata: { order_status: 'fulfilled' } }),
		});
		const env = {
			STRIPE_SECRET_KEY: 'sk_test_123',
			ALLOWED_ORIGINS: 'https://example.com',
			NOTIFICATION_HUB: mockNotificationHub,
		} as unknown as Env;
		const response = await handleUpdateOrder(mockStripe as Stripe, request, env, 'https://example.com');
		expect(response.status).toBe(200);
		expect(mockNotify).toHaveBeenCalledWith({
			type: 'order-status-changed',
			orderId: 'cs_test_123',
			prevStatus: null,
			nextStatus: 'fulfilled',
		});
	});

	it('swallows NotificationHub failures without affecting the response', async () => {
		mockStripe.checkout.sessions.update.mockResolvedValue({ id: 'cs_test_123', metadata: { order_status: 'new' } });
		mockStripe.checkout.sessions.retrieve.mockResolvedValue({ id: 'cs_test_123', metadata: {} });

		const mockNotify = vi.fn().mockRejectedValue(new Error('DO unreachable'));
		const mockNotificationHub = { getByName: vi.fn().mockReturnValue({ notify: mockNotify }) };

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
		expect(mockNotify).toHaveBeenCalled();
	});

	it('does not notify NotificationHub when order_status is not provided', async () => {
		const mockSession = { id: 'cs_test_123', metadata: { foo: 'bar' } };
		mockStripe.checkout.sessions.update.mockResolvedValue(mockSession);

		const mockNotify = vi.fn();
		const mockStub = { notify: mockNotify };
		const mockNotificationHub = { getByName: vi.fn().mockReturnValue(mockStub) };

		const request = new Request('http://example.com/orders/cs_test_123', {
			method: 'PUT',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ metadata: { foo: 'bar' } }),
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

	describe('Zod body validation (review I14)', () => {
		// Strict-mode Zod schemas reject unknown fields so a future Stripe API
		// addition can't be smuggled through this endpoint without a deliberate
		// code change.

		it('rejects unknown top-level fields with VALIDATION_FAILED', async () => {
			const request = new Request('http://example.com/orders/cs_test_123', {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					metadata: { ok: 'yes' },
					expires_at: 9999999999, // not allow-listed
				}),
			});
			const env = { STRIPE_SECRET_KEY: 'sk_test_123', ALLOWED_ORIGINS: 'https://example.com' } as Env;
			const response = await handleUpdateOrder(mockStripe as Stripe, request, env, 'https://example.com');
			expect(response.status).toBe(400);
			const body = (await response.json()) as { ok: boolean; error: { code: string } };
			expect(body.ok).toBe(false);
			expect(body.error.code).toBe('VALIDATION_FAILED');
		});

		it('rejects unknown fields nested in collected_information.shipping_details.address', async () => {
			const request = new Request('http://example.com/orders/cs_test_123', {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					collected_information: {
						shipping_details: {
							address: { line1: '1 Main', secret_field: 'no' },
						},
					},
				}),
			});
			const env = { STRIPE_SECRET_KEY: 'sk_test_123', ALLOWED_ORIGINS: 'https://example.com' } as Env;
			const response = await handleUpdateOrder(mockStripe as Stripe, request, env, 'https://example.com');
			expect(response.status).toBe(400);
		});

		it('accepts a well-formed allow-listed payload', async () => {
			mockStripe.checkout.sessions.update.mockResolvedValueOnce({ id: 'cs_test_123' });
			const request = new Request('http://example.com/orders/cs_test_123', {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					metadata: { order_status: 'fulfilled' },
					collected_information: {
						shipping_details: {
							name: 'Alice',
							address: { line1: '123 Main', city: 'Springfield', country: 'US' },
						},
					},
				}),
			});
			const env = {
				STRIPE_SECRET_KEY: 'sk_test_123',
				ALLOWED_ORIGINS: 'https://example.com',
				NOTIFICATION_HUB: { getByName: () => ({ notify: vi.fn() }) },
			} as unknown as Env;
			const response = await handleUpdateOrder(mockStripe as Stripe, request, env, 'https://example.com');
			expect(response.status).toBe(200);
		});
	});

	describe('metadata.order_status whitelist (review I15)', () => {
		// Stripe metadata is a free-form Record<string, string>. The admin filters
		// and dashboard counts treat `order_status` as a closed enum — accepting
		// arbitrary values would silently corrupt those views.
		const VALID = ['new', 'pending', 'fulfilled'];

		for (const value of VALID) {
			it(`accepts metadata.order_status="${value}"`, async () => {
				mockStripe.checkout.sessions.update.mockResolvedValueOnce({ id: 'cs_test_123' });
				const request = new Request('http://example.com/orders/cs_test_123', {
					method: 'PUT',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ metadata: { order_status: value } }),
				});
				const env = {
					STRIPE_SECRET_KEY: 'sk_test_123',
					ALLOWED_ORIGINS: 'https://example.com',
					NOTIFICATION_HUB: { getByName: () => ({ notify: vi.fn() }) },
				} as unknown as Env;
				const response = await handleUpdateOrder(mockStripe as Stripe, request, env, 'https://example.com');
				expect(response.status).toBe(200);
			});
		}

		it('rejects metadata.order_status="shipped" (not in the whitelist)', async () => {
			const request = new Request('http://example.com/orders/cs_test_123', {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ metadata: { order_status: 'shipped' } }),
			});
			const env = { STRIPE_SECRET_KEY: 'sk_test_123', ALLOWED_ORIGINS: 'https://example.com' } as Env;
			const response = await handleUpdateOrder(mockStripe as Stripe, request, env, 'https://example.com');
			expect(response.status).toBe(400);
			const body = (await response.json()) as { ok: boolean; error: { code: string } };
			expect(body.ok).toBe(false);
			expect(body.error.code).toBe('VALIDATION_FAILED');
		});

		it('rejects arbitrary string injection (e.g. metadata.order_status="<script>")', async () => {
			const request = new Request('http://example.com/orders/cs_test_123', {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ metadata: { order_status: '<script>alert(1)</script>' } }),
			});
			const env = { STRIPE_SECRET_KEY: 'sk_test_123', ALLOWED_ORIGINS: 'https://example.com' } as Env;
			const response = await handleUpdateOrder(mockStripe as Stripe, request, env, 'https://example.com');
			expect(response.status).toBe(400);
		});

		it('allows metadata without an order_status key (partial updates)', async () => {
			mockStripe.checkout.sessions.update.mockResolvedValueOnce({ id: 'cs_test_123' });
			const request = new Request('http://example.com/orders/cs_test_123', {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ metadata: { description: 'Free-form admin note' } }),
			});
			const env = {
				STRIPE_SECRET_KEY: 'sk_test_123',
				ALLOWED_ORIGINS: 'https://example.com',
				NOTIFICATION_HUB: { getByName: () => ({ notify: vi.fn() }) },
			} as unknown as Env;
			const response = await handleUpdateOrder(mockStripe as Stripe, request, env, 'https://example.com');
			expect(response.status).toBe(200);
		});
	});
});
