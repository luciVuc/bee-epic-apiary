import { describe, it, expect } from 'vitest';
import { env } from 'cloudflare:test';

/**
 * Contract: JWT_SIGNING_SECRET must be present and cryptographically
 * strong enough to serve as the HMAC-SHA256 key for session cookies.
 *
 * Byte-length check: HMAC-SHA256 uses a 256-bit block; a key shorter than
 * 32 bytes decoded gets NULL-padded by WebCrypto, which does not weaken
 * the primitive but strongly suggests a placeholder value made it to
 * production. Fail the build to force a real value.
 *
 * The value is expected to be base64-encoded so operators can copy-paste
 * `openssl rand -base64 48` output into wrangler secrets without shell-
 * quoting concerns.
 */
describe('secrets contract', () => {
	it('JWT_SIGNING_SECRET is present', () => {
		expect(env.JWT_SIGNING_SECRET).toBeTypeOf('string');
		expect(env.JWT_SIGNING_SECRET.length).toBeGreaterThan(0);
	});

	it('JWT_SIGNING_SECRET decodes to at least 32 bytes', () => {
		// Use atob to decode base64 without pulling in Buffer. atob throws on
		// invalid base64, which itself is a useful failure.
		let decodedLength: number;
		try {
			decodedLength = atob(env.JWT_SIGNING_SECRET).length;
		} catch {
			throw new Error('JWT_SIGNING_SECRET is not valid base64 — expected `openssl rand -base64 N` output');
		}
		expect(decodedLength).toBeGreaterThanOrEqual(32);
	});
});
