/**
 * Shared greeting + HTML-escape helpers for auth email templates
 * (invite / reset / password-changed).
 *
 * `renderGreeting` produces the single greeting line at the top of every
 * template — "Hi," (no name) or "Hi Alice," (with name). It owns escaping of
 * the display name so caller sites can't forget to sanitize user input.
 *
 * `escapeHtml` is co-located here because every template that needs
 * `renderGreeting` also needs to escape other user-supplied fields
 * (invitedBy, role, etc.) — one import, one utility surface.
 */

/**
 * Escape untrusted user input for HTML interpolation. The five characters
 * covered here are the standard OWASP-recommended set for HTML text nodes and
 * attribute values — enough to neutralize `<script>` injection and
 * attribute-boundary escape via `"` or `'`. Order matters: `&` MUST come first
 * so we don't double-escape the ampersands we just wrote.
 */
export function escapeHtml(input: string): string {
	return input.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/**
 * Render the "Hi[, Name]," greeting line consistently across auth emails.
 * The raw display name is escaped here so callers can never forget — returning
 * the exact greeting text WITHOUT trailing newlines or `<p>` tags so callers
 * decide the surrounding markup.
 *
 * Cases:
 *  - `renderGreeting(undefined)`      → `"Hi,"`
 *  - `renderGreeting("Alice")`        → `"Hi Alice,"`
 *  - `renderGreeting("<script>")`     → `"Hi &lt;script&gt;,"`
 */
export function renderGreeting(displayName: string | undefined): string {
	if (!displayName) return 'Hi,';
	return `Hi ${escapeHtml(displayName)},`;
}
