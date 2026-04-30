import { describe, it, expect } from 'vitest';
import isValidUrl from '../../src/utils/isValidUrl';

describe('isValidUrl', () => {
	it('returns true for valid HTTPS URL', () => {
		expect(isValidUrl('https://example.com')).toBe(true);
	});

	it('returns true for valid HTTP URL', () => {
		expect(isValidUrl('http://localhost:3000')).toBe(true);
	});

	it('returns false for invalid URL', () => {
		expect(isValidUrl('not-a-url')).toBe(false);
	});

	it('returns false for non-HTTP(S) protocol', () => {
		expect(isValidUrl('ftp://example.com')).toBe(false);
	});

	it('returns false for empty string', () => {
		expect(isValidUrl('')).toBe(false);
	});
});
