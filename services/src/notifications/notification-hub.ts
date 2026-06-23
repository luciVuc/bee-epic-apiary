import { DurableObject } from 'cloudflare:workers';

interface INotification {
	sessionId: string;
	timestamp: number;
}

interface IConnection {
	writer: WritableStreamDefaultWriter;
}

export class NotificationHub extends DurableObject {
	private state: DurableObjectState;
	private connections: IConnection[] = [];
	private pendingNotifications: INotification[] = [];
	private encoder = new TextEncoder();
	private static readonly HEARTBEAT_INTERVAL = 30_000;

	constructor(state: DurableObjectState, env: Env) {
		super(state, env);
		this.state = state;
		this.state.waitUntil(this.scheduleAlarm());
	}

	private async scheduleAlarm(): Promise<void> {
		await this.state.storage.setAlarm(Date.now() + NotificationHub.HEARTBEAT_INTERVAL);
	}

	async alarm(): Promise<void> {
		this.connections = await this.cleanupConnections();
		await this.scheduleAlarm();
	}

	private async cleanupConnections(): Promise<IConnection[]> {
		const alive: IConnection[] = [];
		for (const conn of this.connections) {
			try {
				const writer = conn.writer;
				await writer.write(this.encoder.encode(': heartbeat\n\n'));
				alive.push(conn);
			} catch {
				// connection closed, skip
			}
		}
		return alive;
	}

	async notify(sessionId: string): Promise<void> {
		const timestamp = Date.now();
		const notification: INotification = { sessionId, timestamp };

		this.pendingNotifications.push(notification);
		if (this.pendingNotifications.length > 50) {
			this.pendingNotifications.shift();
		}

		await this.broadcast(notification);
	}

	private async broadcast(notification: INotification): Promise<void> {
		const message = this.encoder.encode(`event: new-order\ndata: ${JSON.stringify({ sessionId: notification.sessionId })}\n\n`);

		const alive: IConnection[] = [];
		for (const conn of this.connections) {
			try {
				await conn.writer.write(message);
				alive.push(conn);
			} catch {
				// connection closed, skip
			}
		}
		this.connections = alive;
	}

	async fetch(request: Request): Promise<Response> {
		void request;
		const { readable, writable } = new TransformStream();
		const writer = writable.getWriter();

		writer.write(this.encoder.encode('event: connected\ndata: {}\n\n')).catch(() => {});
		for (const n of this.pendingNotifications) {
			writer.write(this.encoder.encode(`event: new-order\ndata: ${JSON.stringify({ sessionId: n.sessionId })}\n\n`)).catch(() => {});
		}

		const conn: IConnection = { writer };
		this.connections.push(conn);

		const cleanup = () => {
			this.connections = this.connections.filter((c) => c !== conn);
		};
		writer.closed.then(cleanup).catch(cleanup);

		return new Response(readable, {
			headers: {
				'Content-Type': 'text/event-stream',
				'Cache-Control': 'no-cache',
			},
		});
	}
}
