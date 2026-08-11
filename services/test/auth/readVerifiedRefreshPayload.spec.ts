import { describe, it, expect } from 'vitest';
import { REFRESH_TTL_MS } from '@bee-epic/shared';
import { readVerifiedRefreshPayload } from '../../src/auth/readVerifiedRefreshPayload';
import { signJwt } from '../../src/auth/crypto/jwt';

function makeEnv(): Env {
	return {
		JWT_SIGNING_SECRET: 'test-secret-value-abc-123',
	} as unknown as Env;
}

function buildRequest(cookieHeader?: string): Request {
	const headers: Record<string, string> = {};
	if (cookieHeader) headers['Cookie'] = cookieHeader;
	return new Request('https://admin.example.com/', { method: 'POST', headers });
}

describe('readVerifiedRefreshPayload', () => {
	it('returns null when the bea_rt cookie is missing', async () => {
		const env = makeEnv();
		const result = await readVerifiedRefreshPayload(buildRequest(), env);
		expect(result).toBeNull();
	});

	it('returns null when the JWT lacks sub', async () => {
		const env = makeEnv();
		const rt = await signJwt(
			// Force-cast: we're intentionally producing an under-populated payload.
			{ sub: '', type: 'refresh', fid: 'fam-1', jti: 'jti-1' } as unknown as Parameters<typeof signJwt>[0],
			env.JWT_SIGNING_SECRET,
			Math.floor(REFRESH_TTL_MS / 1000),
		);
		const result = await readVerifiedRefreshPayload(buildRequest(`bea_rt=${rt}`), env);
		expect(result).toBeNull();
	});

	it('returns null when the JWT lacks fid', async () => {
		const env = makeEnv();
		const rt = await signJwt(
			{ sub: 'alice@example.com', type: 'refresh', jti: 'jti-1' },
			env.JWT_SIGNING_SECRET,
			Math.floor(REFRESH_TTL_MS / 1000),
		);
		const result = await readVerifiedRefreshPayload(buildRequest(`bea_rt=${rt}`), env);
		expect(result).toBeNull();
	});

	it('returns null when the JWT lacks jti', async () => {
		const env = makeEnv();
		const rt = await signJwt(
			{ sub: 'alice@example.com', type: 'refresh', fid: 'fam-1' },
			env.JWT_SIGNING_SECRET,
			Math.floor(REFRESH_TTL_MS / 1000),
		);
		const result = await readVerifiedRefreshPayload(buildRequest(`bea_rt=${rt}`), env);
		expect(result).toBeNull();
	});

	it('returns the payload when all required refresh claims are present', async () => {
		const env = makeEnv();
		const rt = await signJwt(
			{ sub: 'alice@example.com', type: 'refresh', fid: 'fam-1', jti: 'jti-1' },
			env.JWT_SIGNING_SECRET,
			Math.floor(REFRESH_TTL_MS / 1000),
		);
		const result = await readVerifiedRefreshPayload(buildRequest(`bea_rt=${rt}`), env);
		expect(result).not.toBeNull();
		expect(result!.sub).toBe('alice@example.com');
		expect(result!.type).toBe('refresh');
		expect(result!.fid).toBe('fam-1');
		expect(result!.jti).toBe('jti-1');
	});
});
