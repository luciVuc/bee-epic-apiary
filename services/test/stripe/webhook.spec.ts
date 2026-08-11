import { describe, it, expect, vi, beforeEach } from 'vitest';
import Stripe from 'stripe';
import webhookHandler, { handleWebhook } from '../../src/stripe/webhook/webhook-handler';
import { setStripeInstance } from '../../src/utils/withStripeHandler';

// `confirmOrder` does real side effects (email, KV reads). Stub the module so
// the webhook test only asserts the *dispatch contract*, not order-confirmation
// logic. (That logic has its own coverage in test/stripe/get-orders.spec.ts
// and update-order.spec.ts.)
const confirmOrderMock = vi.fn();
vi.mock('../../src/stripe/order/confirm-order', () => ({
	confirmOrder: (...args: unknown[]) => confirmOrderMock(...args),
}));

interface IEnvOverrides {
	STRIPE_SECRET_KEY?: string;
	STRIPE_WEBHOOK_SECRET?: string;
	ALLOWED_ORIGINS?: string;
	CONTENT_KV?: KVNamespace;
}

function makeKv(): KVNamespace {
	const store = new Map<string, string>();
	return {
		get: async (k: string) => store.get(k) ?? null,
		put: async (k: string, v: string) => {
			store.set(k, v);
		},
		delete: async (k: string) => {
			store.delete(k);
		},
	} as unknown as KVNamespace;
}

function makeEnv(overrides: IEnvOverrides = {}): Env {
	return {
		STRIPE_SECRET_KEY: 'sk_test_x',
		STRIPE_WEBHOOK_SECRET: 'whsec_x',
		ALLOWED_ORIGINS: '*',
		CONTENT_KV: makeKv(),
		...overrides,
	} as unknown as Env;
}

/**
 * Attaches a stripe.webhooks.constructEventAsync stub to the global Stripe
 * mock from test/setup.ts. Returns the spy so tests can change behaviour
 * per-case.
 */
function stubConstructEvent(): ReturnType<typeof vi.fn> {
	const spy = vi.fn();
	const StripeMock = Stripe as unknown as ReturnType<typeof vi.fn>;
	const baseInstance = StripeMock.getMockImplementation()?.call({}) as Record<string, unknown> | undefined;
	const next = {
		...(baseInstance ?? {}),
		webhooks: { constructEventAsync: spy },
	};
	StripeMock.mockImplementation(function (this: unknown) {
		return next;
	});
	return spy;
}

function makeCtx(): ExecutionContext {
	return { waitUntil: (p: Promise<unknown>) => void p, passThroughOnException: () => {} } as unknown as ExecutionContext;
}

describe('webhook — IApiResponse envelope (Task 10)', () => {
	beforeEach(() => {
		confirmOrderMock.mockReset();
		confirmOrderMock.mockResolvedValue(undefined);
		// Clear the cached singleton so each test sees the freshly stubbed
		// constructEventAsync via stubConstructEvent().
		setStripeInstance(null);
	});

	it('rejects non-POST methods with envelope METHOD_NOT_ALLOWED', async () => {
		const req = new Request('https://api.test/stripe/webhook', { method: 'GET' });
		const res = await handleWebhook(req, makeEnv());
		expect(res.status).toBe(405);
		const body = (await res.json()) as { ok: boolean; error: { code: string } };
		expect(body.ok).toBe(false);
		expect(body.error.code).toBe('METHOD_NOT_ALLOWED');
	});

	it('rejects requests missing the stripe-signature header with envelope BAD_REQUEST', async () => {
		const req = new Request('https://api.test/stripe/webhook', {
			method: 'POST',
			body: '{}',
		});
		const res = await handleWebhook(req, makeEnv());
		expect(res.status).toBe(400);
		const body = (await res.json()) as { ok: boolean; error: { code: string } };
		expect(body.ok).toBe(false);
		expect(['BAD_REQUEST', 'VALIDATION_FAILED']).toContain(body.error.code);
	});

	it('returns INTERNAL envelope when STRIPE_WEBHOOK_SECRET is unset', async () => {
		const req = new Request('https://api.test/stripe/webhook', {
			method: 'POST',
			body: '{}',
			headers: { 'stripe-signature': 'sig' },
		});
		const res = await handleWebhook(req, makeEnv({ STRIPE_WEBHOOK_SECRET: '' }));
		expect(res.status).toBe(500);
		const body = (await res.json()) as { ok: boolean; error: { code: string } };
		expect(body.ok).toBe(false);
		expect(body.error.code).toBe('INTERNAL');
	});

	it('returns UNAUTHORIZED envelope when signature verification fails', async () => {
		const construct = stubConstructEvent();
		construct.mockRejectedValueOnce(new Error('bad sig'));
		const req = new Request('https://api.test/stripe/webhook', {
			method: 'POST',
			body: '{}',
			headers: { 'stripe-signature': 'bad' },
		});
		const res = await handleWebhook(req, makeEnv());
		expect(res.status).toBe(401);
		const body = (await res.json()) as { ok: boolean; error: { code: string } };
		expect(body.ok).toBe(false);
		expect(body.error.code).toBe('UNAUTHORIZED');
	});

	it('returns ok envelope on accepted event', async () => {
		const construct = stubConstructEvent();
		construct.mockResolvedValueOnce({
			id: 'evt_ok_1',
			type: 'payment_intent.succeeded',
			data: { object: {} },
		});
		const req = new Request('https://api.test/stripe/webhook', {
			method: 'POST',
			body: '{}',
			headers: { 'stripe-signature': 'good' },
		});
		const res = await handleWebhook(req, makeEnv());
		expect(res.status).toBe(200);
		const body = (await res.json()) as { ok: boolean; data: { received: boolean } };
		expect(body.ok).toBe(true);
		expect(body.data.received).toBe(true);
	});

	it('default export exposes a fetch handler', () => {
		expect(typeof webhookHandler.fetch).toBe('function');
	});
});

describe('webhook — idempotency (Task 11)', () => {
	beforeEach(() => {
		confirmOrderMock.mockReset();
		confirmOrderMock.mockResolvedValue(undefined);
		setStripeInstance(null);
	});

	it('treats duplicate event.id as already-handled and skips confirmOrder', async () => {
		const construct = stubConstructEvent();
		construct.mockResolvedValue({
			id: 'evt_dupe_1',
			type: 'checkout.session.completed',
			data: { object: { id: 'cs_dupe_1' } },
		});

		const kvStore = new Map<string, string>();
		const env = {
			...makeEnv(),
			CONTENT_KV: {
				get: async (k: string) => kvStore.get(k) ?? null,
				put: async (k: string, v: string) => {
					kvStore.set(k, v);
				},
				delete: async (k: string) => {
					kvStore.delete(k);
				},
			} as unknown as KVNamespace,
		} as Env;

		const reqFor = () =>
			new Request('https://api.test/stripe/webhook', {
				method: 'POST',
				body: '{}',
				headers: { 'stripe-signature': 'good' },
			});

		const ctx = makeCtx();
		// Drain any waitUntil work between invocations so the idempotency key
		// is durably written before the second delivery.
		const waits: Promise<unknown>[] = [];
		const ctxRecording = {
			waitUntil: (p: Promise<unknown>) => waits.push(p),
			passThroughOnException: () => {},
		} as unknown as ExecutionContext;

		const res1 = await webhookHandler.fetch!(reqFor(), env, ctxRecording);
		await Promise.allSettled(waits);
		const res2 = await webhookHandler.fetch!(reqFor(), env, ctx);

		expect(res1.status).toBe(200);
		expect(res2.status).toBe(200);
		const body2 = (await res2.json()) as { ok: boolean; data: { duplicate?: boolean } };
		expect(body2.data.duplicate).toBe(true);
		expect(confirmOrderMock).toHaveBeenCalledTimes(1);
	});

	it('does not mark an event seen when confirmOrder fails, so redelivery retries it', async () => {
		const construct = stubConstructEvent();
		construct.mockResolvedValue({
			id: 'evt_retry_1',
			type: 'checkout.session.completed',
			data: { object: { id: 'cs_retry_1' } },
		});

		const kvStore = new Map<string, string>();
		const env = {
			...makeEnv(),
			CONTENT_KV: {
				get: async (k: string) => kvStore.get(k) ?? null,
				put: async (k: string, v: string) => {
					kvStore.set(k, v);
				},
				delete: async (k: string) => {
					kvStore.delete(k);
				},
			} as unknown as KVNamespace,
		} as Env;

		const reqFor = () =>
			new Request('https://api.test/stripe/webhook', {
				method: 'POST',
				body: '{}',
				headers: { 'stripe-signature': 'good' },
			});

		// Drain waitUntil work between deliveries so any idempotency write the
		// handler chose to make has settled before the redelivery.
		const waits: Promise<unknown>[] = [];
		const ctxRecording = {
			waitUntil: (p: Promise<unknown>) => waits.push(p),
			passThroughOnException: () => {},
		} as unknown as ExecutionContext;

		// First delivery: confirmOrder throws (transient Stripe/DO failure).
		confirmOrderMock.mockRejectedValueOnce(new Error('transient failure'));
		// Redelivery: confirmOrder succeeds.
		confirmOrderMock.mockResolvedValueOnce(undefined);

		const res1 = await webhookHandler.fetch!(reqFor(), env, ctxRecording);
		await Promise.allSettled(waits);
		const res2 = await webhookHandler.fetch!(reqFor(), env, ctxRecording);
		await Promise.allSettled(waits);

		// Both deliveries ack 200 (never surface the failure back to Stripe as a
		// hard error mid-retry-window).
		expect(res1.status).toBe(200);
		expect(res2.status).toBe(200);
		// The failed first delivery must NOT be treated as a duplicate on
		// redelivery — the event was never durably marked seen.
		const body2 = (await res2.json()) as { ok: boolean; data: { duplicate?: boolean } };
		expect(body2.data.duplicate).toBeUndefined();
		// confirmOrder ran on both the failed delivery and the successful retry.
		expect(confirmOrderMock).toHaveBeenCalledTimes(2);
	});

	it('marks an event seen only after confirmOrder succeeds, so a later redelivery is a duplicate', async () => {
		const construct = stubConstructEvent();
		construct.mockResolvedValue({
			id: 'evt_seen_after_ok_1',
			type: 'checkout.session.completed',
			data: { object: { id: 'cs_seen_after_ok_1' } },
		});

		const kvStore = new Map<string, string>();
		const env = {
			...makeEnv(),
			CONTENT_KV: {
				get: async (k: string) => kvStore.get(k) ?? null,
				put: async (k: string, v: string) => {
					kvStore.set(k, v);
				},
				delete: async (k: string) => {
					kvStore.delete(k);
				},
			} as unknown as KVNamespace,
		} as Env;

		const reqFor = () =>
			new Request('https://api.test/stripe/webhook', {
				method: 'POST',
				body: '{}',
				headers: { 'stripe-signature': 'good' },
			});

		const waits: Promise<unknown>[] = [];
		const ctxRecording = {
			waitUntil: (p: Promise<unknown>) => waits.push(p),
			passThroughOnException: () => {},
		} as unknown as ExecutionContext;

		const res1 = await webhookHandler.fetch!(reqFor(), env, ctxRecording);
		await Promise.allSettled(waits);
		const res2 = await webhookHandler.fetch!(reqFor(), env, ctxRecording);
		await Promise.allSettled(waits);

		expect(res1.status).toBe(200);
		expect(res2.status).toBe(200);
		const body2 = (await res2.json()) as { ok: boolean; data: { duplicate?: boolean } };
		expect(body2.data.duplicate).toBe(true);
		// Only the first delivery ran confirmOrder; the successful run recorded
		// the idempotency key so the redelivery short-circuits.
		expect(confirmOrderMock).toHaveBeenCalledTimes(1);
	});
});
