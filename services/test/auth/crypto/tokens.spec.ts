import { describe, it, expect } from 'vitest';
import { base64UrlDecode, base64UrlEncode, generateUrlSafeToken } from '../../../src/auth/crypto/tokens';

describe('generateUrlSafeToken', () => {
	it('returns a non-empty string', () => {
		expect(generateUrlSafeToken()).toMatch(/^[A-Za-z0-9_-]+$/);
	});

	it('default length yields >= 32 chars (43 for 32 random bytes)', () => {
		expect(generateUrlSafeToken().length).toBeGreaterThanOrEqual(32);
	});

	it('two calls produce different tokens', () => {
		expect(generateUrlSafeToken()).not.toBe(generateUrlSafeToken());
	});

	it('honors the byte-count argument', () => {
		// 16 random bytes => 22-char base64url (no padding)
		expect(generateUrlSafeToken(16).length).toBe(22);
	});
});

describe('base64Url round-trip', () => {
	it('encode → decode reproduces the original bytes', () => {
		const original = new Uint8Array([0, 1, 2, 250, 255]);
		const decoded = base64UrlDecode(base64UrlEncode(original));
		expect(Array.from(decoded)).toEqual(Array.from(original));
	});

	it('handles a 32-byte buffer end-to-end', () => {
		const original = new Uint8Array(32);
		crypto.getRandomValues(original);
		const decoded = base64UrlDecode(base64UrlEncode(original));
		expect(Array.from(decoded)).toEqual(Array.from(original));
	});
});
