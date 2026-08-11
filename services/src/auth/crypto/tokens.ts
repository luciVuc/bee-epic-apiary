/**
 * URL-safe random tokens for invites, password resets, and JWT `jti`.
 *
 * Uses `crypto.getRandomValues` (native in Cloudflare Workers) and base64url
 * encoding (no padding). 32 random bytes by default — that's ~256 bits of
 * entropy, well above brute-force ranges.
 */
export function generateUrlSafeToken(bytes = 32): string {
	const buf = new Uint8Array(bytes);
	crypto.getRandomValues(buf);
	return base64UrlEncode(buf);
}

/** Base64url-encode a byte array. No padding. */
export function base64UrlEncode(buf: Uint8Array): string {
	let binary = '';
	for (const b of buf) binary += String.fromCharCode(b);
	const b64 = btoa(binary);
	return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Base64url-decode to a byte array. Tolerates missing padding. */
export function base64UrlDecode(str: string): Uint8Array {
	const padded = str.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((str.length + 3) % 4);
	const binary = atob(padded);
	const buf = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i++) buf[i] = binary.charCodeAt(i);
	return buf;
}
