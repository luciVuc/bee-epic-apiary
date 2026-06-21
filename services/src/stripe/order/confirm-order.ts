import Stripe from 'stripe';
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

export async function confirmOrder(sessionId: string, stripe: Stripe, env: Env): Promise<void> {
	const session = await stripe.checkout.sessions.retrieve(sessionId);
	if (session.payment_status !== 'paid') return;

	await stripe.checkout.sessions.update(sessionId, {
		metadata: { order_status: 'new' },
	});

	const stub = env.NOTIFICATION_HUB.getByName('default');
	await stub.notify(sessionId);

	await sendOrderNotificationEmail(sessionId, session, env);
}
