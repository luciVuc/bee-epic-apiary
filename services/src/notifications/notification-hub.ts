import { DurableObject } from 'cloudflare:workers';
import type { INotificationEvent, INotificationEventInput } from './types';
import { ENotificationType, NotificationEventInputSchema } from './types';
import type { ISiteContent } from '../types';

/**
 * NotificationHub
 *
 * Single-tenant SSE fanout for admin notifications.
 *
 * Persists every broadcast event in SQLite (via `state.storage.sql`, enabled by the
 * `new_sqlite_classes: ["NotificationHub"]` migration). On reconnect, the hub honors
 * the SSE `Last-Event-ID` header (which browsers send automatically when the prior
 * connection emitted `id:` lines) and replays any events with a greater id that fall
 * within the configurable replay window. Without a `Last-Event-ID`, the hub replays
 * every event within the window — covers cold reconnects after a redeploy or DO eviction.
 *
 * The replay window is read fresh from `CONTENT_KV` site content on each fetch/evict,
 * clamped to 1–24 hours, defaulting to 1.
 *
 * Eviction is two-axis: by age (`notificationReplayHours`) and by count (`MAX_EVENTS`).
 *
 * Heartbeats every 30s detect dead connections without producing events.
 */
export class NotificationHub extends DurableObject {
	private state: DurableObjectState;
	private hubEnv: Env;
	private connections: Set<WritableStreamDefaultWriter> = new Set();
	private encoder = new TextEncoder();
	private counter = 0;
	private static readonly HEARTBEAT_INTERVAL = 30_000;
	private static readonly MAX_EVENTS = 500;
	private static readonly DEFAULT_REPLAY_HOURS = 1;
	private static readonly MIN_REPLAY_HOURS = 1;
	private static readonly MAX_REPLAY_HOURS = 24;
	/**
	 * Max time a single SSE `writer.write()` may take before the connection is
	 * treated as dead and dropped. A half-open transport (client vanished without
	 * a FIN, proxy stalled) applies backpressure so `write()` neither resolves nor
	 * rejects — it just hangs. Because `notify()`/`heartbeat()` await writes inline
	 * and `notify()` itself is awaited by the Stripe webhook, one stuck writer
	 * would otherwise freeze order confirmation until the caller times out (~30s)
	 * and poison every subsequent notify. Bounding the write turns "hang forever"
	 * into "drop this connection and move on".
	 */
	private static readonly WRITE_TIMEOUT_MS = 5_000;

	constructor(state: DurableObjectState, env: Env) {
		super(state, env);
		this.state = state;
		this.hubEnv = env;
		this.state.storage.sql.exec(
			`CREATE TABLE IF NOT EXISTS notifications (
				id TEXT PRIMARY KEY,
				ts INTEGER NOT NULL,
				type TEXT NOT NULL,
				payload TEXT NOT NULL
			)`,
		);
		this.state.storage.sql.exec('CREATE INDEX IF NOT EXISTS idx_notifications_ts ON notifications(ts)');
		this.state.waitUntil(this.scheduleAlarm());
	}

	private async scheduleAlarm(): Promise<void> {
		await this.state.storage.setAlarm(Date.now() + NotificationHub.HEARTBEAT_INTERVAL);
	}

	async alarm(): Promise<void> {
		await this.heartbeat();
		await this.scheduleAlarm();
	}

	private async heartbeat(): Promise<void> {
		// Iterate a snapshot but mutate `this.connections` IN PLACE: a concurrent
		// fetch() may `this.connections.add(writer)` while we're awaiting a slow
		// tryWrite below. Rebuilding a local `alive` set and reassigning it would
		// silently discard any writer added during that await window. Deleting only
		// the writers that failed preserves connections that arrived meanwhile.
		for (const writer of [...this.connections]) {
			if (!(await this.tryWrite(writer, this.encoder.encode(': heartbeat\n\n')))) {
				this.connections.delete(writer);
			}
		}
	}

	/**
	 * Write a frame to one SSE connection, bounded by WRITE_TIMEOUT_MS. Returns
	 * true if the write completed, false if it threw (closed) or timed out
	 * (dead/backpressured). A false result means the caller should drop the
	 * connection. Never rejects — a stuck write can't propagate out and stall the
	 * fanout (or, transitively, the Stripe webhook that awaits notify()).
	 */
	private async tryWrite(writer: WritableStreamDefaultWriter, frame: Uint8Array): Promise<boolean> {
		let timer: ReturnType<typeof setTimeout> | undefined;
		const timeout = new Promise<false>((resolve) => {
			timer = setTimeout(() => resolve(false), NotificationHub.WRITE_TIMEOUT_MS);
		});
		try {
			return await Promise.race([writer.write(frame).then(() => true), timeout]);
		} catch {
			// connection closed
			return false;
		} finally {
			if (timer !== undefined) clearTimeout(timer);
		}
	}

	/**
	 * Append an event to durable storage, evict old/excess rows, broadcast to live SSE
	 * connections. The caller passes the typed event payload; this method stamps `id` and `ts`.
	 *
	 * The input is runtime-validated via `NotificationEventInputSchema`. A bad
	 * shape (caller passed the wrong field name, sent a stale event type, etc.)
	 * is logged and dropped — better than corrupting the SQLite row and breaking
	 * SSE replay for every connected client.
	 */
	async notify(input: INotificationEventInput): Promise<void> {
		const parsed = NotificationEventInputSchema.safeParse(input);
		if (!parsed.success) {
			console.error('NotificationHub.notify rejected invalid input:', parsed.error.issues);
			return;
		}
		const validated = parsed.data;
		const ts = Date.now();
		const id = this.nextId(ts);
		const stored = this.materialize(id, ts, validated);

		this.state.storage.sql.exec(
			'INSERT INTO notifications (id, ts, type, payload) VALUES (?, ?, ?, ?)',
			id,
			ts,
			stored.type,
			JSON.stringify(this.payloadOf(stored)),
		);
		await this.evict();
		await this.broadcast(stored);
	}

	/**
	 * Generates a lex-sortable event id of the form `<ts13>-<counter6>`.
	 *
	 * Why fixed-width padding: SQLite stores ids as TEXT and `ORDER BY id` is
	 * a string compare, so `'9999999999999'` sorts BEFORE `'10000000000000'`
	 * if the widths differ. Zero-padding to a constant width keeps lex order
	 * == numeric order.
	 *
	 * Why 13 digits for `ts`: `Date.now()` is ms since epoch. The 13-digit
	 * range overflows on **2286-11-20T17:46:40Z** — i.e. `10^13` ms ≈ 317
	 * years. After that, ids gain a 14th digit and sort BEFORE the 13-digit
	 * predecessors. By 2286 this service is the next maintainer's problem;
	 * the comment is here so it isn't a surprise.
	 *
	 * Why 6 digits for `counter`: within a single ms tick we can produce up
	 * to 1,000,000 ids before the counter modulo-wraps. The wrap is a
	 * concession — Durable Objects serialize calls so this can only happen
	 * if 1M notify() calls land in the same ms, which is not a real load.
	 */
	private nextId(ts: number): string {
		this.counter = (this.counter + 1) % 1_000_000;
		return `${ts.toString().padStart(13, '0')}-${this.counter.toString().padStart(6, '0')}`;
	}

	private materialize(id: string, ts: number, input: INotificationEventInput): INotificationEvent {
		switch (input.type) {
			case ENotificationType.NEW_ORDER:
				return { id, ts, type: ENotificationType.NEW_ORDER, orderId: input.orderId };
			case ENotificationType.ORDER_STATUS_CHANGED:
				return {
					id,
					ts,
					type: ENotificationType.ORDER_STATUS_CHANGED,
					orderId: input.orderId,
					prevStatus: input.prevStatus,
					nextStatus: input.nextStatus,
				};
			case ENotificationType.PRODUCT_UPDATED:
				return { id, ts, type: ENotificationType.PRODUCT_UPDATED, productId: input.productId };
			case ENotificationType.PRODUCT_DELETED:
				return { id, ts, type: ENotificationType.PRODUCT_DELETED, productId: input.productId };
		}
	}

	private payloadOf(event: INotificationEvent): Record<string, unknown> {
		// Strip id/ts/type — those are reconstructed on read from their own columns.
		const { id: _id, ts: _ts, type: _type, ...rest } = event;
		void _id;
		void _ts;
		void _type;
		return rest as Record<string, unknown>;
	}

	private rowToEvent(row: { id: string; ts: number; type: string; payload: string }): INotificationEvent {
		const parsed = JSON.parse(row.payload) as Record<string, unknown>;
		return { id: row.id, ts: row.ts, type: row.type, ...parsed } as INotificationEvent;
	}

	private async getReplayWindowMs(): Promise<number> {
		const hours = await this.getReplayWindowHours();
		return hours * 3_600_000;
	}

	private async getReplayWindowHours(): Promise<number> {
		try {
			const raw = await this.hubEnv.CONTENT_KV.get('site');
			if (!raw) return NotificationHub.DEFAULT_REPLAY_HOURS;
			const parsed = JSON.parse(raw) as Partial<ISiteContent>;
			const h = parsed.notificationReplayHours;
			if (typeof h !== 'number' || !Number.isFinite(h)) return NotificationHub.DEFAULT_REPLAY_HOURS;
			const clamped = Math.min(NotificationHub.MAX_REPLAY_HOURS, Math.max(NotificationHub.MIN_REPLAY_HOURS, Math.trunc(h)));
			return clamped;
		} catch {
			return NotificationHub.DEFAULT_REPLAY_HOURS;
		}
	}

	private async evict(): Promise<void> {
		const windowMs = await this.getReplayWindowMs();
		const cutoff = Date.now() - windowMs;
		this.state.storage.sql.exec('DELETE FROM notifications WHERE ts < ?', cutoff);
		// Count cap: keep the newest MAX_EVENTS, drop the rest.
		this.state.storage.sql.exec(
			`DELETE FROM notifications WHERE id IN (
				SELECT id FROM notifications ORDER BY id DESC LIMIT -1 OFFSET ?
			)`,
			NotificationHub.MAX_EVENTS,
		);
	}

	private async broadcast(event: INotificationEvent): Promise<void> {
		const frame = this.encodeFrame(event);
		// Mutate in place rather than rebuild-and-replace — see heartbeat(). A
		// fetch() adding a writer during a slow tryWrite must not be dropped.
		for (const writer of [...this.connections]) {
			if (!(await this.tryWrite(writer, frame))) {
				this.connections.delete(writer);
			}
		}
	}

	private encodeFrame(event: INotificationEvent): Uint8Array {
		const data = JSON.stringify(event);
		return this.encoder.encode(`id: ${event.id}\nevent: ${event.type}\ndata: ${data}\n\n`);
	}

	async fetch(request: Request): Promise<Response> {
		const url = new URL(request.url);
		const lastEventId = request.headers.get('Last-Event-ID') ?? url.searchParams.get('lastEventId');
		const windowMs = await this.getReplayWindowMs();
		const sinceTs = Date.now() - windowMs;

		const { readable, writable } = new TransformStream();
		const writer = writable.getWriter();
		this.connections.add(writer);

		// Read the replay rows synchronously (SQLite is sync), but DO NOT write
		// them before returning the Response. A TransformStream's writable side
		// buffers only ~1 chunk; writing a replay backlog larger than that blocks
		// on backpressure until the readable side is being consumed — which can't
		// happen until we return `new Response(readable)`. Awaiting those writes
		// inline therefore deadlocks fetch() whenever the replay window holds more
		// than a chunk's worth of events: the client hangs with no `connected`
		// marker and no events. Instead we return the Response immediately and
		// pump the replay + connected marker in a detached task, so the client's
		// reader drains the stream and relieves backpressure.
		const rows = lastEventId
			? this.state.storage.sql
					.exec<{
						id: string;
						ts: number;
						type: string;
						payload: string;
					}>('SELECT id, ts, type, payload FROM notifications WHERE id > ? AND ts >= ? ORDER BY id ASC', lastEventId, sinceTs)
					.toArray()
			: this.state.storage.sql
					.exec<{
						id: string;
						ts: number;
						type: string;
						payload: string;
					}>('SELECT id, ts, type, payload FROM notifications WHERE ts >= ? ORDER BY id ASC', sinceTs)
					.toArray();

		const pump = async () => {
			for (const row of rows) {
				if (!(await this.tryWrite(writer, this.encodeFrame(this.rowToEvent(row))))) {
					// connection dropped mid-replay; drop it and stop.
					this.connections.delete(writer);
					return;
				}
			}
			// Always emit a `connected` marker after the replay so clients know the catch-up phase is done.
			if (!(await this.tryWrite(writer, this.encoder.encode('event: connected\ndata: {}\n\n')))) {
				this.connections.delete(writer);
			}
		};

		writer.closed.then(() => this.connections.delete(writer)).catch(() => this.connections.delete(writer));

		// Detach the pump: the Response must be in the caller's hands (and its
		// body being read) for the writes above to make progress.
		this.state.waitUntil(pump());

		return new Response(readable, this.streamResponseInit());
	}

	private streamResponseInit(): ResponseInit {
		return {
			headers: {
				'Content-Type': 'text/event-stream',
				'Cache-Control': 'no-cache, no-store',
				Connection: 'keep-alive',
			},
		};
	}
}
