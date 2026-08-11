import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ACCESS_TTL_MS, EStaffRole, EUserStatus, REFRESH_TTL_MS, type IRefreshFamily, type IUser } from '@bee-epic/shared';
import refreshHandler from '../../../src/auth/handlers/refresh';
import { createUser } from '../../../src/auth/repo/userRepo';
import { createFamily, getFamily, listForEmail } from '../../../src/auth/repo/refreshFamilyRepo';
import { signJwt, verifyJwt } from '../../../src/auth/crypto/jwt';
import { base64UrlDecode } from '../../../src/auth/crypto/tokens';

/**
 * In-memory KV mock (mirrors the login/logout suite patterns).
 * Fresh per test — no cross-test bleed.
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

interface ITestEnvOverrides {
	rateLimiter?: unknown;
	jwtSecret?: string;
}

function makeEnv(overrides: ITestEnvOverrides = {}): Env {
	return {
		CONTENT_KV: makeKv(),
		ALLOWED_ORIGINS: 'https://admin.example.com',
		ENVIRONMENT: 'production',
		JWT_SIGNING_SECRET: overrides.jwtSecret ?? 'test-secret-value-abc-123',
		...(overrides.rateLimiter !== undefined ? { RATE_LIMITER: overrides.rateLimiter } : {}),
	} as unknown as Env;
}

async function buildActiveUser(overrides: Partial<IUser> = {}): Promise<IUser> {
	const now = Date.now();
	return {
		schemaVersion: 1,
		email: 'alice@example.com',
		displayName: 'Alice',
		role: EStaffRole.OWNER,
		status: EUserStatus.ACTIVE,
		passwordHash: 'not-relevant-for-refresh',
		createdAt: now,
		updatedAt: now,
		lastLoginAt: null,
		lastLoginIp: null,
		...overrides,
	};
}

function buildRefreshRequest(cookieHeader?: string, method = 'POST'): Request {
	const headers: Record<string, string> = {
		Origin: 'https://admin.example.com',
		'Content-Type': 'application/json',
	};
	if (cookieHeader) headers['Cookie'] = cookieHeader;
	return new Request('https://admin.example.com/auth/refresh', {
		method,
		headers,
		body: method === 'POST' ? JSON.stringify({}) : undefined,
	});
}

async function seedFamily(
	env: Env,
	email: string,
	familyId: string,
	jti: string,
	overrides: Partial<IRefreshFamily> = {},
): Promise<IRefreshFamily> {
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
		...overrides,
	};
	await createFamily(env, family);
	return family;
}

function getSetCookies(response: Response): string[] {
	return (response.headers as unknown as { getSetCookie?: () => string[] }).getSetCookie?.() ?? [];
}

function findCookie(lines: string[], name: string): string | null {
	return lines.find((l) => l.startsWith(`${name}=`)) ?? null;
}

/** Extract the cookie value (before the first ";"). */
function cookieValue(line: string): string {
	const eq = line.indexOf('=');
	const semi = line.indexOf(';');
	return semi === -1 ? line.slice(eq + 1) : line.slice(eq + 1, semi);
}

function decodePayload(jwt: string): Record<string, unknown> {
	const [, p] = jwt.split('.');
	return JSON.parse(new TextDecoder().decode(base64UrlDecode(p))) as Record<string, unknown>;
}

describe('POST /auth/refresh', () => {
	beforeEach(() => {
		vi.spyOn(console, 'warn').mockImplementation(() => undefined);
	});

	it('happy path: valid cookie + real family → 200, caller returned, both cookies rotated, jti updated, expiresAt preserved', async () => {
		const env = makeEnv();
		const email = 'alice@example.com';
		const familyId = 'fam-abc';
		const originalJti = 'jti-old';
		await createUser(env, await buildActiveUser({ email }));
		const seeded = await seedFamily(env, email, familyId, originalJti);
		const rt = await signJwt(
			{ sub: email, type: 'refresh', fid: familyId, jti: originalJti },
			env.JWT_SIGNING_SECRET,
			Math.floor(REFRESH_TTL_MS / 1000),
		);
		const response = await refreshHandler.fetch(buildRefreshRequest(`bea_rt=${rt}`), env);
		expect(response.status).toBe(200);
		const body = (await response.json()) as {
			ok: boolean;
			data: { caller: { email: string; role: string; displayName: string } };
		};
		expect(body.ok).toBe(true);
		expect(body.data.caller.email).toBe(email);
		expect(body.data.caller.role).toBe(EStaffRole.OWNER);
		expect(body.data.caller.displayName).toBe('Alice');

		const cookies = getSetCookies(response);
		expect(findCookie(cookies, 'bea_at')).toBeTruthy();
		expect(findCookie(cookies, 'bea_rt')).toBeTruthy();
		// New cookies do NOT set Max-Age=0 (those are clears).
		expect(findCookie(cookies, 'bea_at')).not.toContain('Max-Age=0');
		expect(findCookie(cookies, 'bea_rt')).not.toContain('Max-Age=0');

		const updated = await getFamily(env, email, familyId);
		expect(updated).not.toBeNull();
		expect(updated!.currentJti).not.toBe(originalJti);
		expect(updated!.expiresAt).toBe(seeded.expiresAt);
	});

	it('no cookie → 401 NO_REFRESH, no Set-Cookie clear headers', async () => {
		const env = makeEnv();
		const response = await refreshHandler.fetch(buildRefreshRequest(), env);
		expect(response.status).toBe(401);
		const body = (await response.json()) as { ok: boolean; error: { code: string } };
		expect(body.error.code).toBe('NO_REFRESH');
		const cookies = getSetCookies(response);
		expect(cookies.length).toBe(0);
	});

	it('malformed cookie value → 401 INVALID_REFRESH + both cookies cleared', async () => {
		const env = makeEnv();
		const response = await refreshHandler.fetch(buildRefreshRequest('bea_rt=garbage'), env);
		expect(response.status).toBe(401);
		const body = (await response.json()) as { ok: boolean; error: { code: string } };
		expect(body.error.code).toBe('INVALID_REFRESH');
		const cookies = getSetCookies(response);
		expect(findCookie(cookies, 'bea_at')).toContain('Max-Age=0');
		expect(findCookie(cookies, 'bea_rt')).toContain('Max-Age=0');
	});

	it("wrong-type token (type:'access' in refresh slot) → 401 INVALID_REFRESH + cookies cleared", async () => {
		const env = makeEnv();
		const wrongType = await signJwt({ sub: 'alice@example.com', type: 'access', role: 'OWNER' }, env.JWT_SIGNING_SECRET, 3600);
		const response = await refreshHandler.fetch(buildRefreshRequest(`bea_rt=${wrongType}`), env);
		expect(response.status).toBe(401);
		const body = (await response.json()) as { ok: boolean; error: { code: string } };
		expect(body.error.code).toBe('INVALID_REFRESH');
		const cookies = getSetCookies(response);
		expect(findCookie(cookies, 'bea_at')).toContain('Max-Age=0');
		expect(findCookie(cookies, 'bea_rt')).toContain('Max-Age=0');
	});

	it('expired refresh JWT → 401 INVALID_REFRESH + cookies cleared', async () => {
		const env = makeEnv();
		const rt = await signJwt({ sub: 'alice@example.com', type: 'refresh', fid: 'fam-abc', jti: 'jti-1' }, env.JWT_SIGNING_SECRET, -1);
		const response = await refreshHandler.fetch(buildRefreshRequest(`bea_rt=${rt}`), env);
		expect(response.status).toBe(401);
		const body = (await response.json()) as { ok: boolean; error: { code: string } };
		expect(body.error.code).toBe('INVALID_REFRESH');
		const cookies = getSetCookies(response);
		expect(findCookie(cookies, 'bea_at')).toContain('Max-Age=0');
		expect(findCookie(cookies, 'bea_rt')).toContain('Max-Age=0');
	});

	it('family missing (JWT valid but no KV record) → 401 INVALID_REFRESH + cookies cleared', async () => {
		const env = makeEnv();
		// Do NOT seed a family — but sign a JWT that claims one.
		const rt = await signJwt(
			{ sub: 'alice@example.com', type: 'refresh', fid: 'fam-missing', jti: 'jti-1' },
			env.JWT_SIGNING_SECRET,
			Math.floor(REFRESH_TTL_MS / 1000),
		);
		const response = await refreshHandler.fetch(buildRefreshRequest(`bea_rt=${rt}`), env);
		expect(response.status).toBe(401);
		const body = (await response.json()) as { ok: boolean; error: { code: string } };
		expect(body.error.code).toBe('INVALID_REFRESH');
		const cookies = getSetCookies(response);
		expect(findCookie(cookies, 'bea_at')).toContain('Max-Age=0');
		expect(findCookie(cookies, 'bea_rt')).toContain('Max-Age=0');
	});

	it('replay detection: old jti presented against rotated family → 401 REUSED_REFRESH + family destroyed + cookies cleared', async () => {
		const env = makeEnv();
		const email = 'alice@example.com';
		const familyId = 'fam-abc';
		await createUser(env, await buildActiveUser({ email }));
		await seedFamily(env, email, familyId, 'new-jti');
		// Attacker presents an OLD refresh JWT whose jti is stale.
		const rt = await signJwt(
			{ sub: email, type: 'refresh', fid: familyId, jti: 'old-jti' },
			env.JWT_SIGNING_SECRET,
			Math.floor(REFRESH_TTL_MS / 1000),
		);
		const response = await refreshHandler.fetch(buildRefreshRequest(`bea_rt=${rt}`), env);
		expect(response.status).toBe(401);
		const body = (await response.json()) as { ok: boolean; error: { code: string } };
		expect(body.error.code).toBe('REUSED_REFRESH');
		// Family destroyed.
		expect(await getFamily(env, email, familyId)).toBeNull();
		const cookies = getSetCookies(response);
		expect(findCookie(cookies, 'bea_at')).toContain('Max-Age=0');
		expect(findCookie(cookies, 'bea_rt')).toContain('Max-Age=0');
	});

	it('user DISABLED between login and refresh → 403 ACCOUNT_DISABLED + ALL families for email deleted + cookies cleared', async () => {
		const env = makeEnv();
		const email = 'alice@example.com';
		const familyId = 'fam-abc';
		const jti = 'jti-1';
		await createUser(env, await buildActiveUser({ email, status: EUserStatus.DISABLED }));
		await seedFamily(env, email, familyId, jti);
		await seedFamily(env, email, 'fam-second', 'jti-2');
		const rt = await signJwt(
			{ sub: email, type: 'refresh', fid: familyId, jti },
			env.JWT_SIGNING_SECRET,
			Math.floor(REFRESH_TTL_MS / 1000),
		);
		const response = await refreshHandler.fetch(buildRefreshRequest(`bea_rt=${rt}`), env);
		expect(response.status).toBe(403);
		const body = (await response.json()) as { ok: boolean; error: { code: string } };
		expect(body.error.code).toBe('ACCOUNT_DISABLED');
		expect((await listForEmail(env, email)).length).toBe(0);
		const cookies = getSetCookies(response);
		expect(findCookie(cookies, 'bea_at')).toContain('Max-Age=0');
		expect(findCookie(cookies, 'bea_rt')).toContain('Max-Age=0');
	});

	it('user deleted between login and refresh → 403 ACCOUNT_DISABLED + families deleted + cookies cleared', async () => {
		const env = makeEnv();
		const email = 'alice@example.com';
		const familyId = 'fam-abc';
		const jti = 'jti-1';
		// Note: NO createUser — the account was deleted after login.
		await seedFamily(env, email, familyId, jti);
		const rt = await signJwt(
			{ sub: email, type: 'refresh', fid: familyId, jti },
			env.JWT_SIGNING_SECRET,
			Math.floor(REFRESH_TTL_MS / 1000),
		);
		const response = await refreshHandler.fetch(buildRefreshRequest(`bea_rt=${rt}`), env);
		expect(response.status).toBe(403);
		const body = (await response.json()) as { ok: boolean; error: { code: string } };
		expect(body.error.code).toBe('ACCOUNT_DISABLED');
		expect((await listForEmail(env, email)).length).toBe(0);
		const cookies = getSetCookies(response);
		expect(findCookie(cookies, 'bea_at')).toContain('Max-Age=0');
		expect(findCookie(cookies, 'bea_rt')).toContain('Max-Age=0');
	});

	it('rate limit exceeded → 429 RATE_LIMITED', async () => {
		const mockDO = {
			idFromName: vi.fn().mockReturnValue('id-abc'),
			getByName: vi.fn().mockReturnValue({
				check: vi.fn().mockResolvedValue({ allowed: false, remaining: 0, resetTime: 456 }),
			}),
			get: vi.fn().mockReturnValue({
				check: vi.fn().mockResolvedValue({ allowed: false, remaining: 0, resetTime: 456 }),
			}),
		};
		const env = makeEnv({ rateLimiter: mockDO });
		const email = 'alice@example.com';
		const familyId = 'fam-abc';
		const jti = 'jti-1';
		await createUser(env, await buildActiveUser({ email }));
		await seedFamily(env, email, familyId, jti);
		const rt = await signJwt(
			{ sub: email, type: 'refresh', fid: familyId, jti },
			env.JWT_SIGNING_SECRET,
			Math.floor(REFRESH_TTL_MS / 1000),
		);
		const response = await refreshHandler.fetch(
			new Request('https://admin.example.com/auth/refresh', {
				method: 'POST',
				headers: {
					Origin: 'https://admin.example.com',
					'Content-Type': 'application/json',
					Cookie: `bea_rt=${rt}`,
					'CF-Connecting-IP': '1.2.3.4',
				},
				body: JSON.stringify({}),
			}),
			env,
		);
		expect(response.status).toBe(429);
		const body = (await response.json()) as { ok: boolean; error: { code: string; retryAfter?: number } };
		expect(body.error.code).toBe('RATE_LIMITED');
		expect(body.error.retryAfter).toBe(456);
	});

	it('family expiresAt is preserved through rotation (rotation does not extend the window)', async () => {
		const env = makeEnv();
		const email = 'alice@example.com';
		const familyId = 'fam-abc';
		const jti = 'jti-1';
		await createUser(env, await buildActiveUser({ email }));
		const seeded = await seedFamily(env, email, familyId, jti);
		const rt = await signJwt(
			{ sub: email, type: 'refresh', fid: familyId, jti },
			env.JWT_SIGNING_SECRET,
			Math.floor(REFRESH_TTL_MS / 1000),
		);
		const response = await refreshHandler.fetch(buildRefreshRequest(`bea_rt=${rt}`), env);
		expect(response.status).toBe(200);
		const rotated = await getFamily(env, email, familyId);
		expect(rotated).not.toBeNull();
		expect(rotated!.expiresAt).toBe(seeded.expiresAt);
	});

	it('new refresh JWT contains the new jti (the family.currentJti after rotation)', async () => {
		const env = makeEnv();
		const email = 'alice@example.com';
		const familyId = 'fam-abc';
		const originalJti = 'jti-old';
		await createUser(env, await buildActiveUser({ email }));
		await seedFamily(env, email, familyId, originalJti);
		const rt = await signJwt(
			{ sub: email, type: 'refresh', fid: familyId, jti: originalJti },
			env.JWT_SIGNING_SECRET,
			Math.floor(REFRESH_TTL_MS / 1000),
		);
		const response = await refreshHandler.fetch(buildRefreshRequest(`bea_rt=${rt}`), env);
		expect(response.status).toBe(200);
		const cookies = getSetCookies(response);
		const newRtLine = findCookie(cookies, 'bea_rt')!;
		const newRt = cookieValue(newRtLine);
		const verified = await verifyJwt(newRt, env.JWT_SIGNING_SECRET, 'refresh');
		expect(verified).not.toBeNull();
		const rotated = await getFamily(env, email, familyId);
		expect(verified!.jti).toBe(rotated!.currentJti);
		expect(verified!.jti).not.toBe(originalJti);
		expect(verified!.fid).toBe(familyId);
		expect(verified!.sub).toBe(email);
	});

	it('access token role reflects current user role at refresh time (not the role baked into the old cookie)', async () => {
		const env = makeEnv();
		const email = 'alice@example.com';
		const familyId = 'fam-abc';
		const jti = 'jti-1';
		// User is currently EMPLOYEE — even though the (imagined) old access
		// token might have said OWNER, the fresh access token must reflect the
		// CURRENT role.
		await createUser(env, await buildActiveUser({ email, role: EStaffRole.EMPLOYEE }));
		await seedFamily(env, email, familyId, jti);
		const rt = await signJwt(
			{ sub: email, type: 'refresh', fid: familyId, jti },
			env.JWT_SIGNING_SECRET,
			Math.floor(REFRESH_TTL_MS / 1000),
		);
		const response = await refreshHandler.fetch(buildRefreshRequest(`bea_rt=${rt}`), env);
		expect(response.status).toBe(200);
		const cookies = getSetCookies(response);
		const atLine = findCookie(cookies, 'bea_at')!;
		const at = cookieValue(atLine);
		const decoded = decodePayload(at);
		expect(decoded.role).toBe(EStaffRole.EMPLOYEE);
		expect(decoded.type).toBe('access');
		expect(decoded.sub).toBe(email);
		// Also confirm the access TTL is roughly ACCESS_TTL_MS/1000 seconds
		// from now (loose bounds — tests should not be flaky on slow CI).
		const now = Math.floor(Date.now() / 1000);
		const expectedExp = now + Math.floor(ACCESS_TTL_MS / 1000);
		expect(Number(decoded.exp)).toBeGreaterThan(expectedExp - 10);
		expect(Number(decoded.exp)).toBeLessThanOrEqual(expectedExp + 5);
	});

	it('GET returns 405 METHOD_NOT_ALLOWED (only POST accepted)', async () => {
		const env = makeEnv();
		const response = await refreshHandler.fetch(buildRefreshRequest(undefined, 'GET'), env);
		expect(response.status).toBe(405);
	});
});
