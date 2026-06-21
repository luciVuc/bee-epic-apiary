import { IOrderTemplateData } from '../../types';
import { escapeHtml } from '../../utils';

/** Build an HTML email body for new-order notifications with XSS-safe escaping */
export function buildOrderNotificationHtml(data: IOrderTemplateData): string {
	const { sessionId, customerName, customerEmail, amountTotal, orderLink, businessName } = data;
	const safeSessionId = escapeHtml(sessionId);
	const safeCustomerName = escapeHtml(customerName);
	const safeCustomerEmail = escapeHtml(customerEmail);
	const safeAmountTotal = escapeHtml(amountTotal);
	const safeOrderLink = escapeHtml(orderLink);
	const safeBusinessName = escapeHtml(businessName);
	return `<div lang="en" style="margin:0;padding:0;background-color:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif">
<meta charset="utf-8" />
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f5;padding:32px 16px">
<tr><td align="center">
<table role="presentation" width="480" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.08)">
<tr><td style="background:linear-gradient(135deg,#f59e0b,#d97706);padding:32px 24px;text-align:center">
<h1 style="margin:0;color:#ffffff;font-size:24px;font-weight:700;letter-spacing:-0.02em">New Order Placed</h1>
<p style="margin:8px 0 0;color:#fef3c7;font-size:14px">${safeBusinessName}</p>
</td></tr>
<tr><td style="padding:24px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">
<tr><td style="padding:12px 0;border-bottom:1px solid #e4e4e7">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">
<tr><td style="font-size:13px;color:#71717a;padding-bottom:4px">Order ID</td></tr>
<tr><td style="font-size:15px;font-weight:600;color:#18181b">${safeOrderLink ? `<a href="${safeOrderLink}" style="color:#d97706;text-decoration:none">${safeSessionId}</a>` : safeSessionId}</td></tr>
</table>
</td></tr>
<tr><td style="padding:12px 0;border-bottom:1px solid #e4e4e7">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">
<tr><td style="font-size:13px;color:#71717a;padding-bottom:4px">Customer</td></tr>
<tr><td style="font-size:15px;font-weight:600;color:#18181b">${safeCustomerName} &lt;${safeCustomerEmail}&gt;</td></tr>
</table>
</td></tr>
<tr><td style="padding:12px 0">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">
<tr><td style="font-size:13px;color:#71717a;padding-bottom:4px">Total</td></tr>
<tr><td style="font-size:20px;font-weight:700;color:#18181b">${safeAmountTotal}</td></tr>
</table>
</td></tr>
</table>
${safeOrderLink ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:20px"><tr><td align="center"><a href="${safeOrderLink}" style="display:inline-block;padding:12px 32px;background-color:#d97706;color:#ffffff;text-decoration:none;border-radius:8px;font-size:14px;font-weight:600">View Order in Admin</a></td></tr></table>` : ''}
</td></tr>
<tr><td style="padding:16px 24px;background-color:#fafafa;border-top:1px solid #e4e4e7;text-align:center">
<p style="margin:0;font-size:12px;color:#a1a1aa">This notification was sent automatically by Bee Epic Apiary.</p>
</td></tr>
</table>
</td></tr>
</table>
</div>`;
}

/** Build a plain-text email body for new-order notifications */
export function buildOrderNotificationText(data: IOrderTemplateData): string {
	const { sessionId, customerName, customerEmail, amountTotal, orderLink } = data;
	const safeSessionId = escapeHtml(sessionId);
	const safeCustomerName = escapeHtml(customerName);
	const safeCustomerEmail = escapeHtml(customerEmail);
	const safeAmountTotal = escapeHtml(amountTotal);
	let text = `A new order has been placed. | Order ID: ${safeSessionId} | Customer: ${safeCustomerName} (${safeCustomerEmail}) | Total: ${safeAmountTotal}`;
	if (orderLink) {
		text += `\n\nView in admin: ${escapeHtml(orderLink)}`;
	}
	return text;
}

/** Build a Markdown email body for new-order notifications with XSS-safe escaping (rendered to HTML via `marked`) */
export function buildOrderNotificationMarkdown(data: IOrderTemplateData): string {
	const { sessionId, customerName, customerEmail, amountTotal, orderLink, businessName } = data;
	const safeSessionId = escapeHtml(sessionId);
	const safeCustomerName = escapeHtml(customerName);
	const safeCustomerEmail = escapeHtml(customerEmail);
	const safeAmountTotal = escapeHtml(amountTotal);
	const safeBusinessName = escapeHtml(businessName);
	let md = `# New Order Placed\n\n**${safeBusinessName}**\n\n---\n\n**Order ID:** ${orderLink ? `[${safeSessionId}](${orderLink})` : safeSessionId}\n\n**Customer:** ${safeCustomerName} (${safeCustomerEmail})\n\n**Total:** ${safeAmountTotal}\n`;
	if (orderLink) {
		md += `\n---\n\n[View Order in Admin Dashboard](${orderLink})\n`;
	}
	md += `\n---\n\n*This notification was sent automatically by Bee Epic Apiary.*\n`;
	return md;
}
