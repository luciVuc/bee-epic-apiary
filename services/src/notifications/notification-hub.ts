import { DurableObject } from 'cloudflare:workers';

interface INotification {
	sessionId: string;
	timestamp: number;
}

interface IConnection {
	writer: WritableStreamDefaultWriter;
}

export class NotificationHub extends DurableObject {
	private connections: IConnection[] = [];
	private pendingNotifications: INotification[] = [];
	private encoder = new TextEncoder();

	async notify(sessionId: string): Promise<void> {
		const timestamp = Date.now();
		const notification: INotification = { sessionId, timestamp };

		this.pendingNotifications.push(notification);
		if (this.pendingNotifications.length > 50) {
			this.pendingNotifications.shift();
		}

		this.broadcast(notification);
	}

	private broadcast(notification: INotification): void {
		const message = this.encoder.encode(`event: new-order\ndata: ${JSON.stringify({ sessionId: notification.sessionId })}\n\n`);

		this.connections = this.connections.filter((conn) => {
			try {
				conn.writer.write(message);
				return true;
			} catch {
				return false;
			}
		});
	}

	async fetch(request: Request): Promise<Response> {
		void request;
		const { readable, writable } = new TransformStream();
		const writer = writable.getWriter();

		writer.write(this.encoder.encode('event: connected\ndata: {}\n\n'));

		for (const n of this.pendingNotifications) {
			writer.write(this.encoder.encode(`event: new-order\ndata: ${JSON.stringify({ sessionId: n.sessionId })}\n\n`));
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
