import Stripe from 'stripe';
import { ENotificationType } from '@bee-epic/shared';
import { IOrderTemplateData, ISiteContent, IEmailMessageBuilder } from '../../types';
import { buildEmailBody } from '../../utils';

async function sendOrderNotificationEmail(sessionId: string, session: Stripe.Checkout.Session, env: Env): Promise<void> {
	try {
		const siteContentStr = await env.CONTENT_KV.get('site');
		if (!siteContentStr) return;

		const siteContent = JSON.parse(siteContentStr) as ISiteContent;
		const businessName = siteContent.businessName || 'Bee Epic Apiary';
		const emailFormat = siteContent.emailFormat || 'html';
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

		const formsparkFormId = siteContent.formsparkFormId;
		if (formsparkFormId && formsparkFormId !== 'REPLACE_ME') {
			const formsparkBody = {
				body: await buildEmailBody(emailFormat, templateData),
				_email: { subject: `New Order: ${sessionId.slice(-8)}` },
			};
			const formsparkRes = await fetch(`https://submit-form.com/${formsparkFormId}`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					Accept: 'application/json',
				},
				body: JSON.stringify(formsparkBody),
			});
			if (!formsparkRes.ok) {
				const body = await formsparkRes.text().catch(() => '');
				console.error('Formspark returned:', formsparkRes.status, body);
			}
			return;
		}

		const adminEmail = siteContent.email;
		if (!adminEmail) return;

		const domain = adminEmail.split('@')[1];
		if (!domain) return;

		const emailPayload: IEmailMessageBuilder = {
			to: adminEmail,
			from: { email: `noreply@${domain}`, name: businessName },
			subject: `New Order: ${sessionId.slice(-8)}`,
			body: {
				type: emailFormat === 'html' || emailFormat === 'markdown' ? 'html' : 'text',
				content: await buildEmailBody(emailFormat, templateData),
			},
		};

		await env.EMAIL.send(emailPayload);
	} catch (error) {
		console.error('Failed to send order notification email:', error);
	}
}

/**
 * Confirms an order after Stripe's `checkout.session.completed` webhook. Takes
 * the session object directly from `event.data.object` — the previous
 * implementation re-`retrieve`d the same session, which was a wasted Stripe
 * round-trip on every webhook (review I8).
 *
 * Logs a warning (does not block) when the session's `livemode` disagrees with
 * the worker's `ENVIRONMENT`. Defensive observability for cross-mode bleed —
 * e.g. a test-mode webhook landing in production state.
 */
export async function confirmOrder(session: Stripe.Checkout.Session, stripe: Stripe, env: Env): Promise<void> {
	if (session.payment_status !== 'paid') return;

	const sessionId = session.id;
	const isProdEnv = env.ENVIRONMENT === 'production';
	if (session.livemode !== isProdEnv) {
		console.warn('Stripe livemode/ENVIRONMENT mismatch', {
			livemode: session.livemode,
			environment: env.ENVIRONMENT,
			sessionId,
		});
	}

	await stripe.checkout.sessions.update(sessionId, {
		metadata: { order_status: 'new' },
	});

	try {
		const stub = env.NOTIFICATION_HUB.getByName('default');
		await stub.notify({ type: ENotificationType.NEW_ORDER, orderId: sessionId });
	} catch (error) {
		console.error('Failed to send admin notification:', error);
	}

	await sendOrderNotificationEmail(sessionId, session, env);
}
