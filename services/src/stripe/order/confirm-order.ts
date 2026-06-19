import { withStripeHandler, jsonResponse } from '../../utils';
import Stripe from 'stripe';
import {
	buildOrderNotificationHtml,
	buildOrderNotificationText,
	buildOrderNotificationMarkdown,
	type IOrderTemplateData,
} from './order-template';

interface IConfirmOrderBody {
	sessionId: string;
}

async function sendOrderNotificationEmail(sessionId: string, session: Stripe.Checkout.Session, env: Env): Promise<void> {
	try {
		const siteContentStr = await env.CONTENT_KV.get('site');
		if (!siteContentStr) return;

		const siteContent = JSON.parse(siteContentStr) as { email?: string; businessName?: string; formspreeFormId?: string };
		const businessName = siteContent.businessName || 'Bee Epic Apiary';
		const customerEmail = session.customer_details?.email || 'N/A';
		const customerName = session.customer_details?.name || 'N/A';
		const amountTotal = session.amount_total ? `$${(session.amount_total / 100).toFixed(2)}` : 'N/A';
		const adminBaseUrl = env.ADMIN_BASE_URL || '';
		const orderLink = adminBaseUrl ? `${adminBaseUrl}/orders/${sessionId}` : '';

		const templateData: IOrderTemplateData = {
			sessionId,
			customerName,
			customerEmail,
			amountTotal,
			orderLink,
			businessName,
		};

		const formspreeFormId = siteContent.formspreeFormId;
		if (formspreeFormId && formspreeFormId !== 'REPLACE_ME') {
			const formspreeBody = {
				subject: `New Order: ${sessionId.slice(-8)}`,
				message: buildOrderNotificationMarkdown(templateData),
				html: '', // buildOrderNotificationHtml(templateData),
				_gotcha: '',
			};
			await fetch(`https://formspree.io/f/${formspreeFormId}`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(formspreeBody),
			});
			return;
		}

		const adminEmail = siteContent.email;
		if (!adminEmail) return;

		const domain = adminEmail.split('@')[1];
		if (!domain) return;

		await env.EMAIL.send({
			to: adminEmail,
			from: { email: `noreply@${domain}`, name: businessName },
			subject: `New Order: ${sessionId.slice(-8)}`,
			text: buildOrderNotificationText(templateData),
			html: buildOrderNotificationHtml(templateData),
		});
	} catch (error) {
		console.error('Failed to send order notification email:', error);
	}
}

export async function handleConfirmOrder(stripe: Stripe, request: Request, env: Env, origin: string | null): Promise<Response> {
	try {
		const body = (await request.json()) as IConfirmOrderBody;

		if (!body.sessionId || typeof body.sessionId !== 'string') {
			return jsonResponse({ error: 'sessionId is required' }, 400, origin, env);
		}

		const session = await stripe.checkout.sessions.retrieve(body.sessionId);
		if (session.payment_status !== 'paid') {
			return jsonResponse({ error: 'Session not paid' }, 400, origin, env);
		}

		await stripe.checkout.sessions.update(body.sessionId, {
			metadata: { order_status: 'new' },
		});

		const stub = env.NOTIFICATION_HUB.getByName('default');
		await stub.notify(body.sessionId);

		await sendOrderNotificationEmail(body.sessionId, session, env);

		return jsonResponse({ success: true }, 200, origin, env);
	} catch (error: unknown) {
		const err = error as { statusCode?: number; message?: string };
		console.error('Confirm order error:', err);
		const statusCode = err.statusCode || 500;
		const message = statusCode < 500 ? err.message || 'An error occurred' : 'An error occurred';
		return jsonResponse({ error: message }, statusCode, origin, env);
	}
}

export default {
	fetch: withStripeHandler('POST', handleConfirmOrder),
} satisfies ExportedHandler<Env>;
