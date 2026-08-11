import { describe, it, expect } from 'vitest';
import { signJwt, verifyJwt } from '../../../src/auth/crypto/jwt';

const SECRET = 'test-signing-secret-at-least-32-bytes-long';

describe('jwt', () => {
	it('sign + verify round-trips', async () => {
		const token = await signJwt({ sub: 'x@example.com', role: 'OWNER', type: 'access' }, SECRET, 3600);
		const payload = await verifyJwt(token, SECRET, 'access');
		expect(payload?.sub).toBe('x@example.com');
		expect(payload?.role).toBe('OWNER');
		expect(payload?.type).toBe('access');
	});

	it('returns null for a token signed with a different secret', async () => {
		const token = await signJwt({ sub: 'x', type: 'access' }, SECRET, 3600);
		expect(await verifyJwt(token, 'different-secret-32-bytes-or-more-aaaa', 'access')).toBeNull();
	});

	it('returns null when expectedType mismatches', async () => {
		const token = await signJwt({ sub: 'x', type: 'refresh', fid: 'f', jti: 'j' }, SECRET, 3600);
		expect(await verifyJwt(token, SECRET, 'access')).toBeNull();
	});

	it('returns null for an expired token', async () => {
		const token = await signJwt({ sub: 'x', type: 'access' }, SECRET, -10); // 10s in the past
		expect(await verifyJwt(token, SECRET, 'access')).toBeNull();
	});

	it('returns null for a malformed token', async () => {
		expect(await verifyJwt('not.a.jwt', SECRET, 'access')).toBeNull();
		expect(await verifyJwt('', SECRET, 'access')).toBeNull();
		expect(await verifyJwt('a.b', SECRET, 'access')).toBeNull();
	});

	it('includes iss=bea-admin in the payload', async () => {
		const token = await signJwt({ sub: 'x', type: 'access' }, SECRET, 3600);
		const payload = await verifyJwt(token, SECRET, 'access');
		expect(payload?.iss).toBe('bea-admin');
	});

	it('returns null when payload has been tampered with after signing', async () => {
		// Mint a valid token, then swap the payload for a different user. The
		// signature still matches the ORIGINAL bytes but not the tampered ones,
		// so verifyJwt must reject the result.
		const token = await signJwt({ sub: 'attacker@example.com', type: 'access' }, SECRET, 3600);
		const [headerB64, _origPayload, sigB64] = token.split('.');
		const tampered = btoa(
			JSON.stringify({
				sub: 'admin@example.com',
				type: 'access',
				iss: 'bea-admin',
				iat: 0,
				exp: 9_999_999_999,
			}),
		)
			.replace(/\+/g, '-')
			.replace(/\//g, '_')
			.replace(/=+$/, '');
		expect(await verifyJwt(`${headerB64}.${tampered}.${sigB64}`, SECRET, 'access')).toBeNull();
	});
});
