import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EStaffRole, EUserStatus, type IUser, type IRefreshFamily } from '@bee-epic/shared';
import loginHandler from '../../../src/auth/handlers/login';
import { createUser } from '../../../src/auth/repo/userRepo';
import { listForEmail } from '../../../src/auth/repo/refreshFamilyRepo';
import { hashPassword } from '../../../src/auth/crypto/passwordHash';
import * as passwordHash from '../../../src/auth/crypto/passwordHash';
import { base64UrlDecode } from '../../../src/auth/crypto/tokens';

/**
 * In-memory KV mock (mirrors the pattern in services/test/auth/repo/userRepo.spec.ts).
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

/**
 * Build a valid IUser record with the given password already hashed. Async because
 * PBKDF2 is async — tests using a seeded user must `await` this helper.
 */
async function buildActiveUser(overrides: Partial<IUser> = {}): Promise<IUser> {
	const now = Date.now();
	const passwordHash = overrides.passwordHash === null ? null : await hashPassword('correct-horse-battery-staple');
	return {
		schemaVersion: 1,
		email: 'alice@example.com',
		displayName: 'Alice',
		role: EStaffRole.OWNER,
		status: EUserStatus.ACTIVE,
		passwordHash,
		createdAt: now,
		updatedAt: now,
		lastLoginAt: null,
		lastLoginIp: null,
		...overrides,
	};
}

function buildLoginRequest(body: unknown, extraHeaders: Record<string, string> = {}): Request {
	return new Request('https://admin.example.com/auth/login', {
		method: 'POST',
		headers: {
			Origin: 'https://admin.example.com',
			'Content-Type': 'application/json',
			...extraHeaders,
		},
		body: JSON.stringify(body),
	});
}

/** Parse the middle segment of a JWT — payload is base64url-encoded JSON. */
function decodeJwtPayload(token: string): Record<string, unknown> {
	const [, payloadB64] = token.split('.');
	const bytes = base64UrlDecode(payloadB64);
	return JSON.parse(new TextDecoder().decode(bytes)) as Record<string, unknown>;
}

/** Extract `bea_at` and `bea_rt` cookie values from a response's Set-Cookie header(s). */
function getCookies(response: Response): { at: string | null; rt: string | null } {
	// Cloudflare Workers Response.headers.getAll('Set-Cookie') isn't part of the fetch
	// spec in every runtime — Node's undici collapses duplicates via getSetCookie().
	const raw = (response.headers as unknown as { getSetCookie?: () => string[] }).getSetCookie?.() ?? [];
	let at: string | null = null;
	let rt: string | null = null;
	for (const line of raw) {
		if (line.startsWith('bea_at=')) at = line.split(';')[0].slice('bea_at='.length);
		else if (line.startsWith('bea_rt=')) rt = line.split(';')[0].slice('bea_rt='.length);
	}
	return { at, rt };
}

describe('POST /auth/login', () => {
	beforeEach(() => {
		// Silence expected console.warn from fire-and-forget failure paths.
		vi.spyOn(console, 'warn').mockImplementation(() => undefined);
	});

	it('happy path: ACTIVE user + correct password → 200 with caller + 2 cookies', async () => {
		const env = makeEnv();
		await createUser(env, await buildActiveUser());
		const response = await loginHandler.fetch(
			buildLoginRequest({ email: 'alice@example.com', password: 'correct-horse-battery-staple' }),
			env,
		);
		expect(response.status).toBe(200);
		const body = (await response.json()) as { ok: boolean; data: { caller: { email: string; role: string; displayName: string } } };
		expect(body.ok).toBe(true);
		expect(body.data.caller.email).toBe('alice@example.com');
		expect(body.data.caller.role).toBe(EStaffRole.OWNER);
		expect(body.data.caller.displayName).toBe('Alice');
		const cookies = getCookies(response);
		expect(cookies.at).toBeTruthy();
		expect(cookies.rt).toBeTruthy();
	});

	it('unknown email → 401 INVALID_CREDENTIALS', async () => {
		const env = makeEnv();
		const response = await loginHandler.fetch(buildLoginRequest({ email: 'nobody@example.com', password: 'whatever' }), env);
		expect(response.status).toBe(401);
		const body = (await response.json()) as { ok: boolean; error: { code: string } };
		expect(body.error.code).toBe('INVALID_CREDENTIALS');
	});

	it('INVITED user (passwordHash: null) → 401 INVALID_CREDENTIALS (do NOT leak status)', async () => {
		const env = makeEnv();
		await createUser(env, await buildActiveUser({ status: EUserStatus.INVITED, passwordHash: null }));
		const response = await loginHandler.fetch(buildLoginRequest({ email: 'alice@example.com', password: 'anything' }), env);
		expect(response.status).toBe(401);
		const body = (await response.json()) as { ok: boolean; error: { code: string } };
		expect(body.error.code).toBe('INVALID_CREDENTIALS');
	});

	it('DISABLED user (with passwordHash) → 403 ACCOUNT_DISABLED', async () => {
		const env = makeEnv();
		await createUser(env, await buildActiveUser({ status: EUserStatus.DISABLED }));
		const response = await loginHandler.fetch(
			buildLoginRequest({ email: 'alice@example.com', password: 'correct-horse-battery-staple' }),
			env,
		);
		expect(response.status).toBe(403);
		const body = (await response.json()) as { ok: boolean; error: { code: string } };
		expect(body.error.code).toBe('ACCOUNT_DISABLED');
	});

	it('wrong password → 401 INVALID_CREDENTIALS', async () => {
		const env = makeEnv();
		await createUser(env, await buildActiveUser());
		const response = await loginHandler.fetch(buildLoginRequest({ email: 'alice@example.com', password: 'wrong-password' }), env);
		expect(response.status).toBe(401);
		const body = (await response.json()) as { ok: boolean; error: { code: string } };
		expect(body.error.code).toBe('INVALID_CREDENTIALS');
	});

	it('body missing email → 400 VALIDATION_FAILED with fields.email', async () => {
		const env = makeEnv();
		const response = await loginHandler.fetch(buildLoginRequest({ password: 'x' }), env);
		expect(response.status).toBe(400);
		const body = (await response.json()) as { ok: boolean; error: { code: string; fields: Record<string, unknown> } };
		expect(body.error.code).toBe('VALIDATION_FAILED');
		expect(body.error.fields.email).toBeDefined();
	});

	it('body missing password → 400 VALIDATION_FAILED with fields.password', async () => {
		const env = makeEnv();
		const response = await loginHandler.fetch(buildLoginRequest({ email: 'alice@example.com' }), env);
		expect(response.status).toBe(400);
		const body = (await response.json()) as { ok: boolean; error: { code: string; fields: Record<string, unknown> } };
		expect(body.error.code).toBe('VALIDATION_FAILED');
		expect(body.error.fields.password).toBeDefined();
	});

	it('rate-limit exceeded → 429 RATE_LIMITED', async () => {
		const mockDO = {
			idFromName: vi.fn().mockReturnValue('id-abc'),
			getByName: vi.fn().mockReturnValue({
				check: vi.fn().mockResolvedValue({ allowed: false, remaining: 0, resetTime: 123 }),
			}),
			get: vi.fn().mockReturnValue({
				check: vi.fn().mockResolvedValue({ allowed: false, remaining: 0, resetTime: 123 }),
			}),
		};
		const env = makeEnv({ rateLimiter: mockDO });
		await createUser(env, await buildActiveUser());
		const response = await loginHandler.fetch(
			buildLoginRequest({ email: 'alice@example.com', password: 'correct-horse-battery-staple' }, { 'CF-Connecting-IP': '1.2.3.4' }),
			env,
		);
		expect(response.status).toBe(429);
		const body = (await response.json()) as { ok: boolean; error: { code: string; retryAfter?: number } };
		expect(body.error.code).toBe('RATE_LIMITED');
		expect(body.error.retryAfter).toBe(123);
	});

	it('creates a refresh family with schemaVersion=1, email, valid expiresAt, and matching jti', async () => {
		const env = makeEnv();
		await createUser(env, await buildActiveUser());
		const before = Date.now();
		const response = await loginHandler.fetch(
			buildLoginRequest({ email: 'alice@example.com', password: 'correct-horse-battery-staple' }),
			env,
		);
		expect(response.status).toBe(200);
		const families: IRefreshFamily[] = await listForEmail(env, 'alice@example.com');
		expect(families.length).toBe(1);
		const family = families[0];
		expect(family.schemaVersion).toBe(1);
		expect(family.email).toBe('alice@example.com');
		// 30 days in ms; tolerate 10s of jitter around Date.now().
		const expected = before + 30 * 24 * 60 * 60 * 1000;
		expect(family.expiresAt).toBeGreaterThanOrEqual(expected - 10_000);
		expect(family.expiresAt).toBeLessThanOrEqual(expected + 10_000);
		// Decode the refresh JWT and confirm jti matches.
		const cookies = getCookies(response);
		expect(cookies.rt).toBeTruthy();
		const payload = decodeJwtPayload(cookies.rt!) as { jti: string; fid: string; type: string; sub: string };
		expect(payload.type).toBe('refresh');
		expect(payload.sub).toBe('alice@example.com');
		expect(payload.jti).toBe(family.currentJti);
		expect(payload.fid).toBe(family.familyId);
	});

	it('truncates IPv4 to /24', async () => {
		const env = makeEnv();
		await createUser(env, await buildActiveUser());
		await loginHandler.fetch(
			buildLoginRequest({ email: 'alice@example.com', password: 'correct-horse-battery-staple' }, { 'CF-Connecting-IP': '1.2.3.4' }),
			env,
		);
		const families = await listForEmail(env, 'alice@example.com');
		expect(families[0].ip).toBe('1.2.3.0');
	});

	it('truncates IPv6 to /64', async () => {
		const env = makeEnv();
		await createUser(env, await buildActiveUser());
		await loginHandler.fetch(
			buildLoginRequest(
				{ email: 'alice@example.com', password: 'correct-horse-battery-staple' },
				{ 'CF-Connecting-IP': '2001:db8:1:2:3:4:5:6' },
			),
			env,
		);
		const families = await listForEmail(env, 'alice@example.com');
		expect(families[0].ip).toBe('2001:db8:1:2::');
	});

	it('lowercases the email before user lookup', async () => {
		const env = makeEnv();
		await createUser(env, await buildActiveUser({ email: 'foo@bar.com', displayName: 'Foo' }));
		const response = await loginHandler.fetch(buildLoginRequest({ email: 'FOO@Bar.com', password: 'correct-horse-battery-staple' }), env);
		expect(response.status).toBe(200);
		const body = (await response.json()) as { ok: boolean; data: { caller: { email: string } } };
		expect(body.data.caller.email).toBe('foo@bar.com');
	});

	it('runs verifyPassword against a dummy hash on unknown-email (timing-attack defense)', async () => {
		const spy = vi.spyOn(passwordHash, 'verifyPassword');
		const env = makeEnv();
		// No user seeded.
		await loginHandler.fetch(buildLoginRequest({ email: 'nobody@example.com', password: 'anything' }), env);
		expect(spy).toHaveBeenCalledTimes(1);
		spy.mockRestore();
	});

	it('runs verifyPassword against a dummy hash on INVITED user (timing-attack defense)', async () => {
		const spy = vi.spyOn(passwordHash, 'verifyPassword');
		const env = makeEnv();
		await createUser(env, await buildActiveUser({ status: EUserStatus.INVITED, passwordHash: null }));
		await loginHandler.fetch(buildLoginRequest({ email: 'alice@example.com', password: 'anything' }), env);
		expect(spy).toHaveBeenCalledTimes(1);
		spy.mockRestore();
	});

	// NOTE: We deliberately do NOT test that `lastLoginAt` / `lastLoginIp` are
	// persisted after login. The handler intentionally fires the KV write as
	// fire-and-forget (`void updateUser(...)`) so the response is not blocked
	// on an eventually-consistent write. Asserting the write from a test would
	// be inherently racy — the response can return before the KV.put resolves,
	// and vitest doesn't give us a hook to await unrelated background promises.
	// Coverage for this behavior belongs in an integration test that observes
	// the user record after a short delay, or in a spec of updateUser itself
	// (which already exists in services/test/auth/repo/userRepo.spec.ts).
});
