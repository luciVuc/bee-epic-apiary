import { describe, it, expect } from 'vitest';
import isAllowedOrigin from '../../src/utils/isAllowedOrigin';

describe('isAllowedOrigin', () => {
	it('returns false for null origin', () => {
		const env = { ALLOWED_ORIGINS: 'https://example.com' } as Env;
		expect(isAllowedOrigin(null, env)).toBe(false);
	});

	it('returns true when ALLOWED_ORIGINS is *', () => {
		const env = { ALLOWED_ORIGINS: '*' } as Env;
		expect(isAllowedOrigin('https://evil.com', env)).toBe(true);
	});

	it('returns true for matching origin in comma-separated list', () => {
		const env = { ALLOWED_ORIGINS: 'https://example.com,https://app.com' } as Env;
		expect(isAllowedOrigin('https://example.com', env)).toBe(true);
	});

	it('returns false for non-matching origin', () => {
		const env = { ALLOWED_ORIGINS: 'https://example.com' } as Env;
		expect(isAllowedOrigin('https://evil.com', env)).toBe(false);
	});

	it('handles whitespace in comma-separated origins', () => {
		const env = { ALLOWED_ORIGINS: 'https://example.com, https://app.com' } as Env;
		expect(isAllowedOrigin('https://app.com', env)).toBe(true);
	});
});
