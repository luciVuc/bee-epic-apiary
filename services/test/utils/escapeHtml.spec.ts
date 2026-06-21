import { describe, it, expect } from 'vitest';
import { escapeHtml } from '../../src/utils/escapeHtml';

describe('escapeHtml', () => {
	it('escapes ampersands', () => {
		expect(escapeHtml('&')).toBe('&amp;');
	});

	it('escapes less-than', () => {
		expect(escapeHtml('<')).toBe('&lt;');
	});

	it('escapes greater-than', () => {
		expect(escapeHtml('>')).toBe('&gt;');
	});

	it('escapes double quotes', () => {
		expect(escapeHtml('"')).toBe('&quot;');
	});

	it('escapes all special characters together', () => {
		expect(escapeHtml('<script>"&alert"</script>')).toBe('&lt;script&gt;&quot;&amp;alert&quot;&lt;/script&gt;');
	});

	it('returns empty string for empty input', () => {
		expect(escapeHtml('')).toBe('');
	});

	it('returns string unchanged when no special characters', () => {
		expect(escapeHtml('hello world')).toBe('hello world');
	});

	it('handles undefined gracefully using default parameter', () => {
		expect(escapeHtml()).toBe('');
	});
});
