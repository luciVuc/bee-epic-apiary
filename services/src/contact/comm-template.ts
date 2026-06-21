import { ICommTemplateData } from '../types';
import { escapeHtml } from '../utils';

function escapeEmail(email: string): string {
	return email.replace(/\)/g, '%29').replace(/\(/g, '%28');
}

/** Build an HTML email body for contact form notifications with XSS-safe escaping */
export function buildCommNotificationHtml(data: ICommTemplateData): string {
	const { name, email, subject, message } = data;
	return `<p><strong>From:</strong> ${escapeHtml(name)} (<a href="mailto:${escapeHtml(email)}">${escapeHtml(email)}</a>)</p>
<p><strong>Subject:</strong> ${escapeHtml(subject)}</p>
<hr>
<p>${escapeHtml(message).replace(/\n/g, '<br>')}</p>`;
}

/** Build a plain-text email body for contact form notifications */
export function buildCommNotificationText(data: ICommTemplateData): string {
	const { name, email, subject, message } = data;
	return `From: ${name} (${email}) | Subject: ${subject} | Message: ${message}`;
}

/** Build a Markdown email body for contact form notifications (rendered to HTML via `marked`) */
export function buildCommNotificationMarkdown(data: ICommTemplateData): string {
	const { name, email, subject, message } = data;
	const safeName = escapeHtml(name);
	const safeEmail = escapeEmail(email);
	const safeSubject = escapeHtml(subject);
	let md = `# New Message Received\n\n---\n\n**From:** [${safeName}](mailto:${safeEmail}) ([${safeEmail}](mailto:${safeEmail}))\n\n**Subject:** ${safeSubject}\n\n---\n\n**Message:**\n\n${message}`;
	md += `\n---\n\n*This notification was sent automatically by Bee Epic Apiary.*\n`;
	return md;
}
