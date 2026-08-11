/**
 * Escape HTML-significant characters to prevent XSS in email/HTML output.
 *
 * Covers the five characters defined by the OWASP XSS Prevention Cheat Sheet
 * for HTML body / attribute contexts: `& < > " '`. Single-quote escaping is
 * required when output is interpolated into a single-quoted attribute
 * (e.g. `<a title='...'>`) — without it, an injected `'` can break out of the
 * attribute (review I6).
 */
export function escapeHtml(str: string = ''): string {
	return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
