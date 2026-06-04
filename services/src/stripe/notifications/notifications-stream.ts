import { withStripeHandler } from '../../utils';
import type Stripe from 'stripe';

export async function handleNotificationsStream(_stripe: Stripe, request: Request, env: Env, origin: string | null): Promise<Response> {
	const corsOrigin = env.ALLOWED_ORIGINS === '*' ? '*' : origin || '';

	const encoder = new TextEncoder();
	let lastCheck = Date.now();
	const POLL_INTERVAL_MS = 5000;
	const HEARTBEAT_INTERVAL_MS = 30000;
	let lastHeartbeat = Date.now();

	const stream = new ReadableStream({
		async start(controller) {
			controller.enqueue(encoder.encode(`event: connected\ndata: {}\n\n`));

			try {
				while (true) {
					const list = await env.CONTENT_KV.list({ prefix: 'notifications:' });
					for (const key of list.keys) {
						const value = await env.CONTENT_KV.get(key.name);
						if (value) {
							const data = JSON.parse(value) as { sessionId: string; timestamp: number };
							if (data.timestamp > lastCheck) {
								controller.enqueue(encoder.encode(`event: new-order\ndata: ${JSON.stringify({ sessionId: data.sessionId })}\n\n`));
								lastCheck = Math.max(lastCheck, data.timestamp);
							}
						}
					}

					const now = Date.now();
					if (now - lastHeartbeat >= HEARTBEAT_INTERVAL_MS) {
						controller.enqueue(encoder.encode(`event: heartbeat\ndata: {}\n\n`));
						lastHeartbeat = now;
					}

					await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
				}
			} catch (error) {
				console.error('SSE stream error:', error);
				try {
					controller.enqueue(encoder.encode(`event: error\ndata: {}\n\n`));
				} catch {
					// controller may already be closed
				}
			}
		},

		cancel() {
			// stream cancelled by client
		},
	});

	return new Response(stream, {
		headers: {
			'Content-Type': 'text/event-stream',
			'Cache-Control': 'no-cache',
			'Access-Control-Allow-Origin': corsOrigin,
		},
	});
}

export default {
	fetch: withStripeHandler('GET', handleNotificationsStream),
} satisfies ExportedHandler<Env>;
