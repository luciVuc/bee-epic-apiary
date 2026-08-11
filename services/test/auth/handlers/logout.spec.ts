import { describe, it, expect, vi, beforeEach } from 'vitest';
import { REFRESH_TTL_MS, type IRefreshFamily } from '@bee-epic/shared';
import logoutHandler from '../../../src/auth/handlers/logout';
import { createFamily, listForEmail } from '../../../src/auth/repo/refreshFamilyRepo';
import { signJwt } from '../../../src/auth/crypto/jwt';

/**
 * In-memory KV mock — mirrors the pattern used across the auth suite.
 * Fresh per test; no cross-test bleed.
 */
function makeKv(): KVNamespace {
	const store = new Map<string, string>();
	return {
		get: vi.fn(async (key: string) => store.get(key) ?? null),
		put: vi.fn(async (key: string, value: string) => {
			store.set(key, value);
		}),
		delete: vi.fn(async (key: string) => {
			store.delete(key);
		}),
		list: vi.fn(async ({ prefix }: { prefix: string; cursor?: string }) => {
			const all = [...store.keys()].filter((k) => k.startsWith(prefix)).map((name) => ({ name }));
			return { keys: all, list_complete: true, cursor: undefined };
		}),
	} as unknown as KVNamespace;
}

function makeEnv(): Env {
	return {
		CONTENT_KV: makeKv(),
		ALLOWED_ORIGINS: 'https://admin.example.com',
		ENVIRONMENT: 'production',
		JWT_SIGNING_SECRET: 'test-secret-value-abc-123',
	} as unknown as Env;
}

function buildLogoutRequest(cookieHeader?: string, method = 'POST'): Request {
	const headers: Record<string, string> = {
		Origin: 'https://admin.example.com',
	};
	if (cookieHeader) headers['Cookie'] = cookieHeader;
	return new Request('https://admin.example.com/auth/logout', {
		method,
		headers,
	});
}

async function seedFamily(env: Env, email: string, familyId: string, jti: string): Promise<IRefreshFamily> {
	const now = Date.now();
	const family: IRefreshFamily = {
		schemaVersion: 1,
		familyId,
		email,
		currentJti: jti,
		createdAt: now,
		lastRefreshedAt: now,
		expiresAt: now + REFRESH_TTL_MS,
		userAgent: null,
		ip: '1.2.3.0',
	};
	await createFamily(env, family);
	return family;
}

/** Extract Set-Cookie lines and parse the shape we care about for clears. */
function getSetCookies(response: Response): string[] {
	return (response.headers as unknown as { getSetCookie?: () => string[] }).getSetCookie?.() ?? [];
}

function findCookie(lines: string[], name: string): string | null {
	return lines.find((l) => l.startsWith(`${name}=`)) ?? null;
}

describe('POST /auth/logout', () => {
	beforeEach(() => {
		// Silence expected console.warn from best-effort delete failure paths.
		vi.spyOn(console, 'warn').mockImplementation(() => undefined);
	});

	it('happy path: valid bea_rt for a real family → 204, family deleted, both cookies cleared', async () => {
		const env = makeEnv();
		const email = 'alice@example.com';
		const familyId = 'fam-abc';
		const jti = 'jti-xyz';
		await seedFamily(env, email, familyId, jti);
		expect((await listForEmail(env, email)).length).toBe(1);
		const rt = await signJwt(
			{ sub: email, type: 'refresh', fid: familyId, jti },
			env.JWT_SIGNING_SECRET,
			Math.floor(REFRESH_TTL_MS / 1000),
		);
		const response = await logoutHandler.fetch(buildLogoutRequest(`bea_rt=${rt}`), env);
		expect(response.status).toBe(204);
		expect((await listForEmail(env, email)).length).toBe(0);
		const cookies = getSetCookies(response);
		const at = findCookie(cookies, 'bea_at');
		const rtC = findCookie(cookies, 'bea_rt');
		expect(at).toBeTruthy();
		expect(rtC).toBeTruthy();
		expect(at).toContain('Max-Age=0');
		expect(rtC).toContain('Max-Age=0');
	});

	it('no cookie at all → 204, both cookies cleared, no KV delete on refresh key', async () => {
		const env = makeEnv();
		const response = await logoutHandler.fetch(buildLogoutRequest(), env);
		expect(response.status).toBe(204);
		const cookies = getSetCookies(response);
		expect(findCookie(cookies, 'bea_at')).toContain('Max-Age=0');
		expect(findCookie(cookies, 'bea_rt')).toContain('Max-Age=0');
		// No refresh: delete for a refresh key should not have been attempted.
		const deleteMock = env.CONTENT_KV.delete as unknown as ReturnType<typeof vi.fn>;
		const refreshDeletes = deleteMock.mock.calls.filter((c) => String(c[0]).startsWith('refresh:'));
		expect(refreshDeletes.length).toBe(0);
	});

	it('malformed cookie (bea_rt=garbage) → 204, cookies cleared, verifyJwt rejects it', async () => {
		const env = makeEnv();
		const response = await logoutHandler.fetch(buildLogoutRequest('bea_rt=garbage'), env);
		expect(response.status).toBe(204);
		const cookies = getSetCookies(response);
		expect(findCookie(cookies, 'bea_at')).toContain('Max-Age=0');
		expect(findCookie(cookies, 'bea_rt')).toContain('Max-Age=0');
		// verifyJwt returns null → no delete on any refresh: key.
		const deleteMock = env.CONTENT_KV.delete as unknown as ReturnType<typeof vi.fn>;
		const refreshDeletes = deleteMock.mock.calls.filter((c) => String(c[0]).startsWith('refresh:'));
		expect(refreshDeletes.length).toBe(0);
	});

	it('expired refresh token → verifyJwt returns null → 204, cookies cleared', async () => {
		const env = makeEnv();
		const email = 'alice@example.com';
		const familyId = 'fam-abc';
		const jti = 'jti-xyz';
		await seedFamily(env, email, familyId, jti);
		const rt = await signJwt(
			{ sub: email, type: 'refresh', fid: familyId, jti },
			env.JWT_SIGNING_SECRET,
			-1, // already expired
		);
		const response = await logoutHandler.fetch(buildLogoutRequest(`bea_rt=${rt}`), env);
		expect(response.status).toBe(204);
		// Family still present since verifyJwt returned null and we did not attempt delete.
		expect((await listForEmail(env, email)).length).toBe(1);
		const cookies = getSetCookies(response);
		expect(findCookie(cookies, 'bea_at')).toContain('Max-Age=0');
		expect(findCookie(cookies, 'bea_rt')).toContain('Max-Age=0');
	});

	it("wrong-type token (type:'access' where refresh expected) → 204, cookies cleared, no delete", async () => {
		const env = makeEnv();
		const email = 'alice@example.com';
		const familyId = 'fam-abc';
		const jti = 'jti-xyz';
		await seedFamily(env, email, familyId, jti);
		// Sign an access-type token but plant it in the bea_rt cookie slot.
		const wrongType = await signJwt({ sub: email, type: 'access', role: 'OWNER' }, env.JWT_SIGNING_SECRET, 3600);
		const response = await logoutHandler.fetch(buildLogoutRequest(`bea_rt=${wrongType}`), env);
		expect(response.status).toBe(204);
		// Family still present — wrong-type rejected before delete.
		expect((await listForEmail(env, email)).length).toBe(1);
		const cookies = getSetCookies(response);
		expect(findCookie(cookies, 'bea_at')).toContain('Max-Age=0');
		expect(findCookie(cookies, 'bea_rt')).toContain('Max-Age=0');
	});

	it('delete failure → still 204, cookies cleared (catch swallows)', async () => {
		const env = makeEnv();
		const email = 'alice@example.com';
		const familyId = 'fam-abc';
		const jti = 'jti-xyz';
		await seedFamily(env, email, familyId, jti);
		// Sabotage delete so it always throws.
		(env.CONTENT_KV.delete as unknown as ReturnType<typeof vi.fn>).mockImplementation(async () => {
			throw new Error('KV delete simulated failure');
		});
		const rt = await signJwt(
			{ sub: email, type: 'refresh', fid: familyId, jti },
			env.JWT_SIGNING_SECRET,
			Math.floor(REFRESH_TTL_MS / 1000),
		);
		const response = await logoutHandler.fetch(buildLogoutRequest(`bea_rt=${rt}`), env);
		expect(response.status).toBe(204);
		const cookies = getSetCookies(response);
		expect(findCookie(cookies, 'bea_at')).toContain('Max-Age=0');
		expect(findCookie(cookies, 'bea_rt')).toContain('Max-Age=0');
	});

	it('GET returns 405 METHOD_NOT_ALLOWED (only POST is accepted)', async () => {
		const env = makeEnv();
		const response = await logoutHandler.fetch(buildLogoutRequest(undefined, 'GET'), env);
		expect(response.status).toBe(405);
	});

	it('Set-Cookie shape: bea_at has Path=/, bea_rt has Path=/auth/refresh, both Max-Age=0', async () => {
		const env = makeEnv();
		const response = await logoutHandler.fetch(buildLogoutRequest(), env);
		expect(response.status).toBe(204);
		const cookies = getSetCookies(response);
		expect(cookies.length).toBe(2);
		const at = findCookie(cookies, 'bea_at')!;
		const rt = findCookie(cookies, 'bea_rt')!;
		expect(at).toContain('Path=/');
		expect(at).toContain('Max-Age=0');
		expect(at).toContain('HttpOnly');
		expect(rt).toContain('Path=/auth/refresh');
		expect(rt).toContain('Max-Age=0');
		expect(rt).toContain('HttpOnly');
	});
});
