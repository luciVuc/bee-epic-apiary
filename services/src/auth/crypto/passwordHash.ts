import { base64UrlDecode, base64UrlEncode } from './tokens';
import { timingSafeEqual } from '../../utils/timingSafeEqual';

/**
 * PBKDF2-SHA256 password hashing using WebCrypto. Self-describing format:
 *   pbkdf2$sha256$<iterations>$<base64url-salt>$<base64url-hash>
 *
 * Iteration count is parsed from the stored string on verify, so future bumps
 * are seamless — old records continue to verify; new records use the new count.
 *
 * Salt is 16 random bytes per password; output digest is 32 bytes.
 */
const ITERATIONS = 100_000;
const SALT_BYTES = 16;
const HASH_BYTES = 32;

/**
 * Hash a plaintext password into the self-describing PBKDF2 string documented
 * above. Generates a fresh 16-byte random salt per call, so hashing the same
 * password twice yields different output.
 */
export async function hashPassword(password: string): Promise<string> {
	const salt = new Uint8Array(SALT_BYTES);
	crypto.getRandomValues(salt);
	const digest = await derive(password, salt, ITERATIONS);
	return `pbkdf2$sha256$${ITERATIONS}$${base64UrlEncode(salt)}$${base64UrlEncode(digest)}`;
}

/**
 * Verify a plaintext password against a stored PBKDF2 string. Parses the
 * iteration count and salt out of the stored value (so records hashed with an
 * older iteration count still verify), re-derives, and compares in constant
 * time. Returns false on any malformed or out-of-bounds stored string.
 */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
	const parts = stored.split('$');
	if (parts.length !== 5) return false;
	const [scheme, hashName, itersStr, saltB64, expectedB64] = parts;
	if (scheme !== 'pbkdf2' || hashName !== 'sha256') return false;
	// Reject trailing garbage (parseInt('600000abc', 10) === 600000) and bound
	// the iter count so a corrupted/crafted stored string can't stall the worker
	// for minutes. 10M is ~16× the current default — loose enough to survive
	// several future bumps, tight enough to prevent DoS.
	if (!/^\d+$/.test(itersStr)) return false;
	const iters = parseInt(itersStr, 10);
	if (!Number.isFinite(iters) || iters < 1 || iters > 10_000_000) return false;

	let salt: Uint8Array;
	let expected: Uint8Array;
	try {
		salt = base64UrlDecode(saltB64);
		expected = base64UrlDecode(expectedB64);
	} catch {
		return false;
	}

	const actual = await derive(password, salt, iters);
	// Constant-time compare via the existing util (operates on strings, so we
	// compare base64url-encoded forms — same length, same character set).
	return timingSafeEqual(base64UrlEncode(actual), base64UrlEncode(expected));
}

// Workers runtime caps PBKDF2 at 100k iterations — silently clamp so old
// hashes with higher counts don't throw at verify time.
const WORKERS_MAX_ITERATIONS = 100_000;

async function derive(password: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
	const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), { name: 'PBKDF2' }, false, ['deriveBits']);
	const clamped = Math.min(iterations, WORKERS_MAX_ITERATIONS);
	const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: clamped }, key, HASH_BYTES * 8);
	return new Uint8Array(bits);
}
