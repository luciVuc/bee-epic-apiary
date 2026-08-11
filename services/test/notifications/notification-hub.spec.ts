import { describe, it, expect, beforeEach, vi } from 'vitest';
import { env, runInDurableObject } from 'cloudflare:test';
import type { INotificationEvent } from '../../src/notifications/types';

/**
 * Direct-instance tests for the NotificationHub DO. Uses runInDurableObject so we
 * exercise the SQLite-backed storage and the actual fetch handler.
 *
 * Each test creates a fresh instance by hashing a unique name — DO storage is keyed
 * per instance, so tests are isolated even without explicit teardown.
 */

function newStub(name: string) {
	const id = env.NOTIFICATION_HUB.idFromName(name);
	return { stub: env.NOTIFICATION_HUB.get(id), id };
}

async function setReplayHours(value: number | null): Promise<void> {
	if (value === null) {
		await env.CONTENT_KV.delete('site');
	} else {
		await env.CONTENT_KV.put('site', JSON.stringify({ notificationReplayHours: value }));
	}
}

/**
 * Parse an SSE stream into a list of events.
 * Reads until either the stream closes or we get all expected events plus the
 * `connected` marker, then cancels the underlying reader. Cancellation aborts
 * any pending `reader.read()` immediately — important because the DO holds the
 * stream open after `connected`, and the test would otherwise hang on the
 * trailing read.
 */
async function readSseEvents(
	response: Response,
	options: { expected: number; timeoutMs?: number } = { expected: 0 },
): Promise<Array<{ id?: string; event: string; data: string }>> {
	const { expected, timeoutMs = 1_000 } = options;
	const reader = response.body!.getReader();
	const decoder = new TextDecoder();
	const events: Array<{ id?: string; event: string; data: string }> = [];
	let buffer = '';
	const deadline = Date.now() + timeoutMs;

	const flush = () => {
		const chunks = buffer.split('\n\n');
		buffer = chunks.pop() ?? '';
		for (const chunk of chunks) {
			if (!chunk.trim()) continue;
			if (chunk.startsWith(':')) continue; // heartbeat
			let id: string | undefined;
			let event = 'message';
			let data = '';
			for (const line of chunk.split('\n')) {
				if (line.startsWith('id: ')) id = line.slice(4);
				else if (line.startsWith('event: ')) event = line.slice(7);
				else if (line.startsWith('data: ')) data = line.slice(6);
			}
			events.push({ id, event, data });
		}
	};

	try {
		while (Date.now() < deadline) {
			const remaining = Math.max(0, deadline - Date.now());
			const timeoutHandle = { cancelled: false };
			const { value, done } = (await Promise.race([
				reader.read(),
				new Promise<{ done: true; value: undefined; __timeout: true }>((resolve) =>
					setTimeout(() => {
						timeoutHandle.cancelled = true;
						resolve({ done: true, value: undefined, __timeout: true });
					}, remaining),
				),
			])) as { done: boolean; value?: Uint8Array; __timeout?: boolean };

			// Timeout fired — bail out of the loop; cancellation happens in finally.
			if (timeoutHandle.cancelled) break;
			if (done) break;
			if (value) buffer += decoder.decode(value, { stream: true });
			flush();

			// `connected` is always last (after replay). If we hit it, and we've seen at least
			// the expected number of data events, we can bail.
			const dataEvents = events.filter((e) => e.event !== 'connected');
			const sawConnected = events.some((e) => e.event === 'connected');
			if (sawConnected && dataEvents.length >= expected) break;
		}
	} finally {
		// Always cancel — this aborts any pending read() and releases the underlying stream.
		try {
			await reader.cancel();
		} catch {
			// ignore
		}
	}
	return events;
}

/**
 * SSE-replay tests need `stub.fetch(...)` to deliver a streaming Response across
 * the DO RPC boundary. Local `vitest-pool-workers` doesn't fully implement that
 * (the stream never resolves on the test side); CI does. Skip these locally
 * unless explicitly opted in via `CF_WORKERS_SSE_LOCAL=1`. The non-SSE tests
 * (notify + storage assertions via `runInDurableObject`) run everywhere.
 */
const sseSupported = typeof process !== 'undefined' && (process.env.CI === 'true' || process.env.CF_WORKERS_SSE_LOCAL === '1');
const itSse = sseSupported ? it : it.skip;

describe('NotificationHub', () => {
	beforeEach(async () => {
		await env.CONTENT_KV.delete('site');
	});

	describe('notify + persistence', () => {
		itSse('persists a new-order event and broadcasts it to a fresh subscriber', async () => {
			const { stub } = newStub('hub-test-new-order');
			await stub.notify({ type: 'new-order', orderId: 'cs_test_1' });

			const response = await stub.fetch(new Request('https://hub.local/'));
			const events = await readSseEvents(response, { expected: 1 });

			const data = events.filter((e) => e.event === 'new-order');
			expect(data).toHaveLength(1);
			expect(JSON.parse(data[0].data)).toMatchObject({ type: 'new-order', orderId: 'cs_test_1' });
			expect(data[0].id).toBeDefined();

			// `connected` marker must appear after the replay.
			const connectedIdx = events.findIndex((e) => e.event === 'connected');
			const newOrderIdx = events.findIndex((e) => e.event === 'new-order');
			expect(connectedIdx).toBeGreaterThan(newOrderIdx);
		});

		it('writes the SQLite row visible through runInDurableObject', async () => {
			const { stub } = newStub('hub-test-sql');
			await stub.notify({ type: 'product-updated', productId: 'prod_42' });

			const rows = await runInDurableObject(stub, async (_instance, state) => {
				return state.storage.sql
					.exec<{ id: string; ts: number; type: string; payload: string }>('SELECT id, ts, type, payload FROM notifications')
					.toArray();
			});
			expect(rows).toHaveLength(1);
			expect(rows[0].type).toBe('product-updated');
			expect(JSON.parse(rows[0].payload)).toEqual({ productId: 'prod_42' });
		});

		itSse('handles each event type with the right payload shape', async () => {
			const { stub } = newStub('hub-test-all-types');
			await stub.notify({ type: 'new-order', orderId: 'o1' });
			await stub.notify({ type: 'order-status-changed', orderId: 'o1', prevStatus: 'new', nextStatus: 'shipped' });
			await stub.notify({ type: 'product-updated', productId: 'p1' });
			await stub.notify({ type: 'product-deleted', productId: 'p1' });

			const response = await stub.fetch(new Request('https://hub.local/'));
			const events = await readSseEvents(response, { expected: 4 });
			const dataByType = new Map(events.filter((e) => e.event !== 'connected').map((e) => [e.event, JSON.parse(e.data)]));

			expect(dataByType.get('new-order')).toMatchObject({ orderId: 'o1' });
			expect(dataByType.get('order-status-changed')).toMatchObject({ orderId: 'o1', prevStatus: 'new', nextStatus: 'shipped' });
			expect(dataByType.get('product-updated')).toMatchObject({ productId: 'p1' });
			expect(dataByType.get('product-deleted')).toMatchObject({ productId: 'p1' });
		});
	});

	describe('input validation', () => {
		it('drops a bad input shape without writing to SQLite or throwing', async () => {
			const { stub } = newStub('hub-test-invalid-input');
			const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

			// Caller forgot `orderId`. The hub used to happily persist this and
			// then crash on SSE replay; it must now log + drop instead.
			await stub.notify({ type: 'new-order' } as unknown as Parameters<typeof stub.notify>[0]);

			const rows = await runInDurableObject(stub, async (_instance, state) =>
				state.storage.sql.exec<{ id: string }>('SELECT id FROM notifications').toArray(),
			);
			expect(rows).toHaveLength(0);
			expect(errSpy).toHaveBeenCalled();
			errSpy.mockRestore();
		});

		it('drops an unknown event type', async () => {
			const { stub } = newStub('hub-test-bad-type');
			const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

			await stub.notify({ type: 'made-up', orderId: 'o1' } as unknown as Parameters<typeof stub.notify>[0]);

			const rows = await runInDurableObject(stub, async (_instance, state) =>
				state.storage.sql.exec<{ id: string }>('SELECT id FROM notifications').toArray(),
			);
			expect(rows).toHaveLength(0);
			expect(errSpy).toHaveBeenCalled();
			errSpy.mockRestore();
		});
	});

	describe('Last-Event-ID replay', () => {
		itSse('replays only events newer than the supplied Last-Event-ID', async () => {
			const { stub } = newStub('hub-test-last-event-id');
			await stub.notify({ type: 'new-order', orderId: 'a' });
			await stub.notify({ type: 'new-order', orderId: 'b' });
			await stub.notify({ type: 'new-order', orderId: 'c' });

			// First connection: collect ids.
			const first = await stub.fetch(new Request('https://hub.local/'));
			const firstEvents = await readSseEvents(first, { expected: 3 });
			const orderedIds = firstEvents.filter((e) => e.event === 'new-order').map((e) => e.id!);
			expect(orderedIds).toHaveLength(3);

			// Reconnect with Last-Event-ID set to the first event.
			const second = await stub.fetch(
				new Request('https://hub.local/', {
					headers: { 'Last-Event-ID': orderedIds[0] },
				}),
			);
			const secondEvents = await readSseEvents(second, { expected: 2 });
			const replayed = secondEvents.filter((e) => e.event === 'new-order').map((e) => JSON.parse(e.data).orderId);
			expect(replayed).toEqual(['b', 'c']);
		});

		itSse('replays everything within the window when no Last-Event-ID is provided', async () => {
			const { stub } = newStub('hub-test-no-leid');
			await stub.notify({ type: 'new-order', orderId: 'x' });
			await stub.notify({ type: 'new-order', orderId: 'y' });

			const response = await stub.fetch(new Request('https://hub.local/'));
			const events = await readSseEvents(response, { expected: 2 });
			const ids = events.filter((e) => e.event === 'new-order').map((e) => JSON.parse(e.data).orderId);
			expect(ids).toEqual(['x', 'y']);
		});

		itSse('falls back to ?lastEventId= query parameter when the header is absent', async () => {
			const { stub } = newStub('hub-test-leid-query');
			await stub.notify({ type: 'new-order', orderId: 'a' });
			await stub.notify({ type: 'new-order', orderId: 'b' });

			// Get all IDs first.
			const first = await stub.fetch(new Request('https://hub.local/'));
			const firstEvents = await readSseEvents(first, { expected: 2 });
			const ids = firstEvents.filter((e) => e.event === 'new-order').map((e) => e.id!);

			const second = await stub.fetch(new Request(`https://hub.local/?lastEventId=${encodeURIComponent(ids[0])}`));
			const secondEvents = await readSseEvents(second, { expected: 1 });
			const replayed = secondEvents.filter((e) => e.event === 'new-order').map((e) => JSON.parse(e.data).orderId);
			expect(replayed).toEqual(['b']);
		});
	});

	describe('eviction', () => {
		it('drops events older than the configured replay window', async () => {
			const { stub } = newStub('hub-test-age-cutoff');
			await setReplayHours(1);

			// Insert an old row by writing directly to SQLite, then trigger eviction with notify.
			await runInDurableObject(stub, async (_instance, state) => {
				state.storage.sql.exec(
					'INSERT INTO notifications (id, ts, type, payload) VALUES (?, ?, ?, ?)',
					'0000000000000-000001',
					Date.now() - 2 * 60 * 60 * 1000, // 2 hours ago
					'new-order',
					JSON.stringify({ orderId: 'old' }),
				);
			});

			await stub.notify({ type: 'new-order', orderId: 'fresh' });

			const rows = await runInDurableObject(stub, async (_instance, state) =>
				state.storage.sql.exec<{ payload: string }>('SELECT payload FROM notifications').toArray(),
			);
			expect(rows).toHaveLength(1);
			expect(JSON.parse(rows[0].payload)).toEqual({ orderId: 'fresh' });
		});

		it('keeps at most MAX_EVENTS rows even when all are within the window', async () => {
			const { stub } = newStub('hub-test-count-cap');
			// 501 events; 500 should remain
			for (let i = 0; i < 501; i++) {
				await stub.notify({ type: 'new-order', orderId: `o${i}` });
			}
			const count = await runInDurableObject(
				stub,
				async (_instance, state) => state.storage.sql.exec<{ n: number }>('SELECT COUNT(*) AS n FROM notifications').toArray()[0].n,
			);
			expect(count).toBe(500);
		});
	});

	describe('replay window config', () => {
		it('defaults to 1 hour when CONTENT_KV.site is missing', async () => {
			const { stub } = newStub('hub-test-window-default');
			// Add a stale event 90 minutes back; default 1h should drop it.
			await runInDurableObject(stub, async (_instance, state) => {
				state.storage.sql.exec(
					'INSERT INTO notifications (id, ts, type, payload) VALUES (?, ?, ?, ?)',
					'0000000000000-000001',
					Date.now() - 90 * 60 * 1000,
					'new-order',
					JSON.stringify({ orderId: 'old' }),
				);
			});
			await stub.notify({ type: 'new-order', orderId: 'fresh' });
			const rows = await runInDurableObject(stub, async (_instance, state) =>
				state.storage.sql.exec<{ payload: string }>('SELECT payload FROM notifications').toArray(),
			);
			expect(rows.map((r) => JSON.parse(r.payload).orderId)).toEqual(['fresh']);
		});

		it('honors a custom replay window of 24 hours', async () => {
			const { stub } = newStub('hub-test-window-24');
			await setReplayHours(24);
			// 23h-old event should survive
			await runInDurableObject(stub, async (_instance, state) => {
				state.storage.sql.exec(
					'INSERT INTO notifications (id, ts, type, payload) VALUES (?, ?, ?, ?)',
					'0000000000000-000001',
					Date.now() - 23 * 60 * 60 * 1000,
					'new-order',
					JSON.stringify({ orderId: '23h-old' }),
				);
			});
			await stub.notify({ type: 'new-order', orderId: 'fresh' });
			const rows = await runInDurableObject(stub, async (_instance, state) =>
				state.storage.sql.exec<{ payload: string }>('SELECT payload FROM notifications ORDER BY ts ASC').toArray(),
			);
			expect(rows.map((r) => JSON.parse(r.payload).orderId)).toEqual(['23h-old', 'fresh']);
		});

		it('clamps an out-of-range setting back into 1–24', async () => {
			const { stub } = newStub('hub-test-window-clamp');
			await setReplayHours(99); // garbage; should clamp to 24
			await runInDurableObject(stub, async (_instance, state) => {
				state.storage.sql.exec(
					'INSERT INTO notifications (id, ts, type, payload) VALUES (?, ?, ?, ?)',
					'0000000000000-000001',
					Date.now() - 23 * 60 * 60 * 1000,
					'new-order',
					JSON.stringify({ orderId: 'within-24h' }),
				);
			});
			await stub.notify({ type: 'new-order', orderId: 'fresh' });
			const rows = await runInDurableObject(stub, async (_instance, state) =>
				state.storage.sql.exec<{ payload: string }>('SELECT payload FROM notifications').toArray(),
			);
			expect(rows.map((r) => JSON.parse(r.payload).orderId).sort()).toEqual(['fresh', 'within-24h']);
		});

		it('ignores invalid (non-numeric) replay setting and falls back to default', async () => {
			const { stub } = newStub('hub-test-window-invalid');
			await env.CONTENT_KV.put('site', JSON.stringify({ notificationReplayHours: 'lots' }));
			// Stale event from 90 minutes ago should be dropped by the 1h default.
			await runInDurableObject(stub, async (_instance, state) => {
				state.storage.sql.exec(
					'INSERT INTO notifications (id, ts, type, payload) VALUES (?, ?, ?, ?)',
					'0000000000000-000001',
					Date.now() - 90 * 60 * 1000,
					'new-order',
					JSON.stringify({ orderId: 'stale' }),
				);
			});
			await stub.notify({ type: 'new-order', orderId: 'fresh' });
			const rows = await runInDurableObject(stub, async (_instance, state) =>
				state.storage.sql.exec<{ payload: string }>('SELECT payload FROM notifications').toArray(),
			);
			expect(rows.map((r) => JSON.parse(r.payload).orderId)).toEqual(['fresh']);
		});

		it('falls back to default when CONTENT_KV.site contains malformed JSON', async () => {
			const { stub } = newStub('hub-test-window-malformed');
			await env.CONTENT_KV.put('site', '{not valid json');
			await stub.notify({ type: 'new-order', orderId: 'fresh' });
			const rows = await runInDurableObject(stub, async (_instance, state) =>
				state.storage.sql.exec<{ payload: string }>('SELECT payload FROM notifications').toArray(),
			);
			expect(rows).toHaveLength(1);
		});
	});

	describe('SSE framing', () => {
		itSse('emits id, event, and data lines for every persisted row', async () => {
			const { stub } = newStub('hub-test-sse-frame');
			await stub.notify({ type: 'new-order', orderId: 'cs_abc' });
			const response = await stub.fetch(new Request('https://hub.local/'));
			const text = await readResponseAsText(response, 500);
			expect(text).toMatch(/^id: \d+-\d+\nevent: new-order\ndata: \{.+orderId.+\}\n\n/m);
			expect(text).toMatch(/event: connected\ndata: \{\}\n\n/);
		});

		itSse('sets Cache-Control: no-cache, no-store', async () => {
			const { stub } = newStub('hub-test-cache-control');
			const response = await stub.fetch(new Request('https://hub.local/'));
			expect(response.headers.get('Cache-Control')).toBe('no-cache, no-store');
			try {
				await response.body!.cancel();
			} catch {
				// ignore
			}
		});

		itSse('replays in ascending id order', async () => {
			const { stub } = newStub('hub-test-order');
			for (const id of ['a', 'b', 'c', 'd']) {
				await stub.notify({ type: 'new-order', orderId: id });
			}
			const response = await stub.fetch(new Request('https://hub.local/'));
			const events = await readSseEvents(response, { expected: 4 });
			const ids = events.filter((e) => e.event === 'new-order').map((e) => JSON.parse(e.data).orderId);
			expect(ids).toEqual(['a', 'b', 'c', 'd']);
		});
	});

	describe('alarm + heartbeats', () => {
		it('reschedules its own alarm', async () => {
			const { stub } = newStub('hub-test-alarm');
			// Trigger the alarm directly. Before/after, an alarm should be scheduled.
			const after = await runInDurableObject(stub, async (instance, state) => {
				await instance.alarm!();
				return state.storage.getAlarm();
			});
			expect(after).not.toBeNull();
		});
	});

	describe('replay-backlog streaming', () => {
		/**
		 * Regression: fetch() used to `await writer.write()` for every replay row
		 * (and the `connected` marker) BEFORE returning `new Response(readable)`.
		 * A TransformStream buffers ~1 chunk, so once the replay window held more
		 * than a chunk's worth of events the writes blocked on backpressure — the
		 * readable side has no consumer until the Response is returned — and
		 * fetch() deadlocked. The client hung with no `connected` and no events.
		 * fetch() must return promptly and pump the replay in a detached task.
		 */
		it('returns a streaming Response promptly despite a large replay backlog', async () => {
			const { stub } = newStub('hub-test-replay-backlog');
			// Seed well beyond the TransformStream's ~1-chunk buffer.
			for (let i = 0; i < 50; i++) {
				await stub.notify({ type: 'new-order', orderId: `cs_backlog_${i}` });
			}

			// Call fetch() directly on the instance and assert it resolves quickly.
			// RED: old code deadlocks on write backpressure and this races to 'timeout'.
			const outcome = await runInDurableObject(stub, async (instance) => {
				const fetchPromise = instance.fetch(new Request('https://hub.local/'));
				return Promise.race([
					fetchPromise.then(() => 'resolved' as const),
					new Promise<'timeout'>((resolve) => setTimeout(() => resolve('timeout'), 3_000)),
				]);
			});
			expect(outcome).toBe('resolved');
		}, 15_000);
	});

	describe('stuck-connection resilience', () => {
		/**
		 * Regression: a dead-but-not-errored SSE writer (half-open transport that
		 * applies backpressure) makes `writer.write()` hang forever instead of
		 * throwing. Because `notify()` awaits `broadcast()` inline, and the webhook
		 * awaits `notify()` inline, a single stuck writer froze order confirmation
		 * for 30s and poisoned every subsequent order. broadcast must bound each
		 * write so a stuck writer is dropped instead of blocking the fanout.
		 */
		it('does not hang when a connection never accepts writes; drops the stuck writer', async () => {
			const { stub } = newStub('hub-test-stuck-writer');

			await runInDurableObject(stub, async (instance) => {
				// A writer whose write() never resolves and never rejects — models a
				// dead SSE transport under backpressure.
				const stuckWriter = {
					write: () => new Promise<void>(() => {}),
				} as unknown as WritableStreamDefaultWriter;
				// Reach into private state to seed the connection set.
				(instance as unknown as { connections: Set<WritableStreamDefaultWriter> }).connections.add(stuckWriter);
			});

			// If broadcast blocks on the stuck writer, this never resolves and the
			// test times out (RED). With a bounded write (WRITE_TIMEOUT_MS = 5s), it
			// resolves after the write-timeout fires — give the race an 8s ceiling so
			// GREEN reflects the timeout completing, not the test's own deadline.
			const notified = runInDurableObject(stub, async (instance) => {
				await instance.notify({ type: 'new-order', orderId: 'cs_stuck' });
				return true;
			});
			const raced = await Promise.race([notified, new Promise<'timeout'>((resolve) => setTimeout(() => resolve('timeout'), 8_000))]);
			expect(raced).toBe(true);

			// The stuck writer must have been dropped from the live set.
			const remaining = await runInDurableObject(stub, async (instance) => {
				return (instance as unknown as { connections: Set<WritableStreamDefaultWriter> }).connections.size;
			});
			expect(remaining).toBe(0);

			// The event is still persisted despite the stuck connection.
			const rows = await runInDurableObject(stub, async (_instance, state) =>
				state.storage.sql.exec<{ payload: string }>('SELECT payload FROM notifications').toArray(),
			);
			expect(rows.map((r) => JSON.parse(r.payload).orderId)).toContain('cs_stuck');
		}, 15_000);
	});

	describe('id padding (review M10)', () => {
		it('produces lex-sortable ids across a 400-event sample', async () => {
			const { stub } = newStub('hub-test-id-padding');
			// 400 notifies stays under MAX_EVENTS=500, so eviction doesn't drop rows
			// out from under us. Still exercises both the `ts` and `counter` halves of
			// the id since multiple events land in the same ms tick. Lex order must
			// match insertion order — the entire reason for fixed-width padding.
			const SAMPLE = 400;
			for (let i = 0; i < SAMPLE; i++) {
				await stub.notify({ type: 'new-order', orderId: `cs_${i}` });
			}
			const ids = await runInDurableObject(stub, async (_instance, state) => {
				return state.storage.sql
					.exec<{ id: string }>('SELECT id FROM notifications ORDER BY id ASC')
					.toArray()
					.map((r) => r.id);
			});
			expect(ids).toHaveLength(SAMPLE);
			// Each id is a 13+1+6 = 20-char fixed-width string.
			for (const id of ids) {
				expect(id).toMatch(/^\d{13}-\d{6}$/);
			}
			// Lex sort matches insertion sort: the array we got back is already
			// sorted by SQL `ORDER BY id ASC`; if it equals a manual lexicographic
			// resort, then string-compare order is preserved.
			const lexSorted = [...ids].sort();
			expect(ids).toEqual(lexSorted);
		});
	});
});

async function readResponseAsText(response: Response, timeoutMs: number): Promise<string> {
	const reader = response.body!.getReader();
	const decoder = new TextDecoder();
	let out = '';
	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline) {
		const race = Promise.race([
			reader.read(),
			new Promise<{ done: true; value: undefined }>((resolve) =>
				setTimeout(() => resolve({ done: true, value: undefined }), Math.max(0, deadline - Date.now())),
			),
		]);
		const { value, done } = await race;
		if (done) break;
		if (value) out += decoder.decode(value, { stream: true });
		if (out.includes('event: connected')) break;
	}
	try {
		await reader.cancel();
	} catch {
		// ignore
	}
	return out;
}

// Silence vi linter — `INotificationEvent` referenced in dev only.
void (null as unknown as INotificationEvent);
// Tag vi as used (vitest module import keeps this honest for ESLint).
void vi;
