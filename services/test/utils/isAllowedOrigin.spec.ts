import { describe, it, expect, vi, afterEach } from 'vitest';
import isAllowedOrigin from '../../src/utils/isAllowedOrigin';

describe('isAllowedOrigin', () => {
	afterEach(() => vi.restoreAllMocks());

	it('returns false for null origin', () => {
		const env = { ALLOWED_ORIGINS: 'https://example.com' } as Env;
		expect(isAllowedOrigin(null, env)).toBe(false);
	});

	it('returns true when ALLOWED_ORIGINS is * and ENVIRONMENT=development', () => {
		const env = { ALLOWED_ORIGINS: '*', ENVIRONMENT: 'development' } as unknown as Env;
		expect(isAllowedOrigin('https://anything.test', env)).toBe(true);
	});

	it('refuses (returns false) when ALLOWED_ORIGINS=* and ENVIRONMENT is production (review I12)', () => {
		// A wildcard ALLOWED_ORIGINS in production is almost always a config
		// mistake; treating it as fail-open would silently expose admin APIs.
		// We close the door and shout into the logs.
		const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
		const env = { ALLOWED_ORIGINS: '*', ENVIRONMENT: 'production' } as unknown as Env;
		expect(isAllowedOrigin('https://anything.test', env)).toBe(false);
		expect(errSpy).toHaveBeenCalled();
	});

	it('refuses when ALLOWED_ORIGINS=* and ENVIRONMENT is undefined (fail-safe default)', () => {
		const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
		const env = { ALLOWED_ORIGINS: '*' } as unknown as Env;
		expect(isAllowedOrigin('https://anything.test', env)).toBe(false);
		expect(errSpy).toHaveBeenCalled();
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
