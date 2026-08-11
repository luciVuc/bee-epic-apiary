import { base64UrlDecode, base64UrlEncode } from './tokens';

const ISSUER = 'bea-admin';

/** Discriminates the two JWT flavours minted here: short-lived `access` vs long-lived `refresh`. */
export type TJwtType = 'access' | 'refresh';

/** Decoded JWT claims. `role` rides on access tokens; `fid`/`jti` (family + token id) ride on refresh tokens. */
export interface IJwtPayload {
	sub: string;
	type: TJwtType;
	role?: string;
	fid?: string;
	jti?: string;
	iat: number;
	exp: number;
	iss: string;
}

/** Caller-supplied claims for `signJwt` — the `iat`/`exp`/`iss` claims are stamped by the signer. */
export type IJwtInput = Omit<IJwtPayload, 'iat' | 'exp' | 'iss'>;

/**
 * Sign a JWT (HS256). `ttlSeconds` is added to "now" for the `exp` claim.
 * Negative TTLs produce a pre-expired token (used in tests).
 */
export async function signJwt(input: IJwtInput, secret: string, ttlSeconds: number): Promise<string> {
	const now = Math.floor(Date.now() / 1000);
	const payload: IJwtPayload = { ...input, iat: now, exp: now + ttlSeconds, iss: ISSUER };
	const header = { alg: 'HS256', typ: 'JWT' };
	const headerB64 = base64UrlEncode(new TextEncoder().encode(JSON.stringify(header)));
	const payloadB64 = base64UrlEncode(new TextEncoder().encode(JSON.stringify(payload)));
	const signingInput = `${headerB64}.${payloadB64}`;
	const sig = await hmacSign(signingInput, secret);
	return `${signingInput}.${base64UrlEncode(sig)}`;
}

/**
 * Verify a JWT and return the payload, or null on any failure (bad signature,
 * expired, wrong type, malformed). Never throws.
 */
export async function verifyJwt(token: string, secret: string, expectedType: TJwtType): Promise<IJwtPayload | null> {
	if (!token) return null;
	const parts = token.split('.');
	if (parts.length !== 3) return null;
	const [headerB64, payloadB64, sigB64] = parts;
	try {
		const expected = await hmacSign(`${headerB64}.${payloadB64}`, secret);
		const actual = base64UrlDecode(sigB64);
		if (!constantTimeEqualBytes(actual, expected)) return null;

		const payload = JSON.parse(new TextDecoder().decode(base64UrlDecode(payloadB64))) as IJwtPayload;
		if (payload.iss !== ISSUER) return null;
		if (payload.type !== expectedType) return null;
		const now = Math.floor(Date.now() / 1000);
		// The typeof guard is load-bearing: `undefined <= now` is `false` in JS,
		// so a token with no `exp` claim would silently pass without this check.
		if (typeof payload.exp !== 'number' || payload.exp <= now) return null;
		return payload;
	} catch {
		return null;
	}
}

/**
 * Per-call HMAC sign helper. Each call re-imports the secret as a fresh
 * CryptoKey; on the verify path inside resolveCaller this runs on every
 * authenticated request. Measured HS256 verify latency is well within budget,
 * so no env-scoped CryptoKey cache is warranted — the string-secret signature
 * also keeps tests simple. Revisit only if profiling shows key import is hot.
 */
async function hmacSign(input: string, secret: string): Promise<Uint8Array> {
	const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
	const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(input));
	return new Uint8Array(sig);
}

function constantTimeEqualBytes(a: Uint8Array, b: Uint8Array): boolean {
	if (a.length !== b.length) return false;
	let result = 0;
	for (let i = 0; i < a.length; i++) result |= a[i] ^ b[i];
	return result === 0;
}
