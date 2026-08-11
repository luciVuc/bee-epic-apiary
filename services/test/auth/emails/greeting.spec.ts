import { describe, it, expect } from 'vitest';
import { renderGreeting, escapeHtml } from '../../../src/auth/emails/greeting';

/**
 * `renderGreeting` produces the "Hi[, Name]," greeting line shared across the
 * invite / reset / password-changed email templates. The helper owns HTML
 * escaping so callers can't forget to sanitise user-supplied display names.
 */
describe('renderGreeting', () => {
	it('returns "Hi," when displayName is undefined', () => {
		expect(renderGreeting(undefined)).toBe('Hi,');
	});

	it('returns "Hi Alice," when displayName is a plain name', () => {
		expect(renderGreeting('Alice')).toBe('Hi Alice,');
	});

	it('HTML-escapes displayName to neutralise injection', () => {
		expect(renderGreeting('<script>')).toBe('Hi &lt;script&gt;,');
	});
});

describe('escapeHtml', () => {
	it('escapes the five OWASP HTML text-node characters', () => {
		expect(escapeHtml(`&<>"'`)).toBe('&amp;&lt;&gt;&quot;&#39;');
	});

	it('processes ampersand before other entities so escapes are not double-encoded', () => {
		// If `&` were replaced after `<`, we'd get `&amp;amp;lt;` for `<`.
		expect(escapeHtml('<')).toBe('&lt;');
		expect(escapeHtml('&lt;')).toBe('&amp;lt;');
	});
});
