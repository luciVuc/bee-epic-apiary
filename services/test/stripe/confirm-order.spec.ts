import { describe, it, expect, vi, beforeEach } from 'vitest';
import type Stripe from 'stripe';
import { confirmOrder } from '../../src/stripe/order/confirm-order';

/**
 * `confirmOrder` was previously called with `(sessionId, stripe, env)` and
 * re-`retrieve`d the full Checkout Session from Stripe — wasteful, since the
 * webhook handler already passes the full session in `event.data.object`. The
 * new contract takes the session object directly; the round-trip is gone.
 *
 * These tests pin the new behavior: no `stripe.checkout.sessions.retrieve()`
 * call when payment_status is "paid", and a defensive livemode warning when
 * environment and session disagree (review I8).
 */
describe('confirmOrder — reuse webhook session payload (review I8)', () => {
	type MockStripe = {
		checkout: { sessions: { update: ReturnType<typeof vi.fn>; retrieve: ReturnType<typeof vi.fn> } };
	};

	function makeStripe(): MockStripe {
		return {
			checkout: {
				sessions: {
					update: vi.fn().mockResolvedValue({}),
					retrieve: vi.fn(), // present so we can assert it's NOT called
				},
			},
		};
	}

	function makeEnv(): Env {
		const kv = {
			get: vi.fn().mockResolvedValue(null), // sendOrderNotificationEmail early-returns
			put: vi.fn(),
		};
		const notificationHub = {
			getByName: vi.fn().mockReturnValue({ notify: vi.fn().mockResolvedValue(undefined) }),
		};
		return {
			CONTENT_KV: kv as unknown as KVNamespace,
			NOTIFICATION_HUB: notificationHub,
			ENVIRONMENT: 'production',
			EMAIL: { send: vi.fn() },
		} as unknown as Env;
	}

	function makeSession(overrides: Partial<Stripe.Checkout.Session> = {}): Stripe.Checkout.Session {
		return {
			id: 'cs_test_1',
			payment_status: 'paid',
			livemode: true,
			customer_details: { email: 'jane@example.com', name: 'Jane' },
			amount_total: 4999,
			...overrides,
		} as unknown as Stripe.Checkout.Session;
	}

	beforeEach(() => {
		vi.restoreAllMocks();
	});

	it('does NOT call stripe.checkout.sessions.retrieve when given a session object', async () => {
		const stripe = makeStripe();
		const env = makeEnv();
		await confirmOrder(makeSession(), stripe as unknown as Stripe, env);
		expect(stripe.checkout.sessions.retrieve).not.toHaveBeenCalled();
	});

	it('stamps metadata.order_status = "new" via stripe.checkout.sessions.update', async () => {
		const stripe = makeStripe();
		const env = makeEnv();
		await confirmOrder(makeSession(), stripe as unknown as Stripe, env);
		expect(stripe.checkout.sessions.update).toHaveBeenCalledWith('cs_test_1', {
			metadata: { order_status: 'new' },
		});
	});

	it('skips side effects when payment_status is not "paid"', async () => {
		const stripe = makeStripe();
		const env = makeEnv();
		await confirmOrder(makeSession({ payment_status: 'unpaid' }), stripe as unknown as Stripe, env);
		expect(stripe.checkout.sessions.update).not.toHaveBeenCalled();
	});

	it('warns when livemode disagrees with ENVIRONMENT (defensive logging only)', async () => {
		const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
		const stripe = makeStripe();
		const env = { ...makeEnv(), ENVIRONMENT: 'production' } as Env;
		// production env + livemode:false → mismatch
		await confirmOrder(makeSession({ livemode: false }), stripe as unknown as Stripe, env);
		expect(warnSpy).toHaveBeenCalled();
		expect(String(warnSpy.mock.calls[0][0])).toMatch(/livemode/i);
		// Still proceeds with the update — the warning is observability, not enforcement.
		expect(stripe.checkout.sessions.update).toHaveBeenCalled();
		warnSpy.mockRestore();
	});

	it('does not warn when livemode matches ENVIRONMENT', async () => {
		const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
		const stripe = makeStripe();
		const env = { ...makeEnv(), ENVIRONMENT: 'production' } as Env;
		await confirmOrder(makeSession({ livemode: true }), stripe as unknown as Stripe, env);
		expect(warnSpy).not.toHaveBeenCalled();
		warnSpy.mockRestore();
	});
});
