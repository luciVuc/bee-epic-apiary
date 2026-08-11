import { buildOrderNotificationHtml, buildOrderNotificationMarkdown, buildOrderNotificationText } from '../stripe/order/order-template';
import { buildCommNotificationHtml, buildCommNotificationMarkdown, buildCommNotificationText } from '../contact/comm-template';
import { EmailFormat, ICommTemplateData, IOrderTemplateData } from '../types';
import { marked } from 'marked';

/**
 * Defense-in-depth: strip raw HTML blocks and inline HTML tokens from any
 * markdown rendered for email. The template builders already escape user
 * input via `escapeHtml`, but a future template author who forgets that step
 * would otherwise see raw <script> reach the rendered output. Overriding the
 * `html` renderer to emit empty string makes the marked config the safety net
 * (review I7).
 */
marked.use({
	renderer: {
		html: () => '',
	},
});

/**
 * Build an email body string in the requested format.
 * Dispatches to the correct template builder based on data type (order vs contact).
 * Markdown content is rendered to HTML via `marked`.
 */
export async function buildEmailBody(format: EmailFormat, data: IOrderTemplateData | ICommTemplateData): Promise<string> {
	switch (format) {
		case 'html':
			if ('sessionId' in data) {
				return buildOrderNotificationHtml(data);
			}
			return buildCommNotificationHtml(data);
		case 'markdown':
			if ('sessionId' in data) {
				return await marked(buildOrderNotificationMarkdown(data));
			}
			return await marked(buildCommNotificationMarkdown(data));
		case 'text':
		default:
			if ('sessionId' in data) {
				return buildOrderNotificationText(data);
			}
			return buildCommNotificationText(data);
	}
}
