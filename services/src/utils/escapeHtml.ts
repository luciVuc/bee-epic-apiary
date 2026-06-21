/** Escape HTML special characters to prevent XSS in email HTML output */
export function escapeHtml(str: string = ''): string {
	return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
