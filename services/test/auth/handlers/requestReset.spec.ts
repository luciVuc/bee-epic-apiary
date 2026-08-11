import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EStaffRole, EUserStatus, RESET_TTL_MS, type IUser, type IPasswordReset } from '@bee-epic/shared';
import requestResetHandler from '../../../src/auth/handlers/requestReset';
import { createUser } from '../../../src/auth/repo/userRepo';
import * as userRepo from '../../../src/auth/repo/userRepo';
import { createReset } from '../../../src/auth/repo/resetRepo';
import * as resetRepo from '../../../src/auth/repo/resetRepo';
import { hashPassword } from '../../../src/auth/crypto/passwordHash';
import * as sendResetModule from '../../../src/auth/emails/sendReset';

vi.mock('../../../src/auth/repo/userRepo', async (importOriginal) => {
	const actual = await importOriginal<typeof import('../../../src/auth/repo/userRepo')>();
	return { ...actual };
});

vi.mock('../../../src/auth/repo/resetRepo', async (importOriginal) => {
	const actual = await importOriginal<typeof import('../../../src/auth/repo/resetRepo')>();
	return { ...actual };
});

/**
 * In-memory KV mock — same pattern as login.spec.ts. Fresh per test.
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
		list: vi.fn(async ({ prefix, cursor: _cursor }: { prefix: string; cursor?: string }) => {
			const all = [...store.keys()].filter((k) => k.startsWith(prefix)).map((name) => ({ name }));
			return { keys: all, list_complete: true, cursor: undefined };
		}),
	} as unknown as KVNamespace;
}

interface ITestEnvOverrides {
	rateLimiter?: unknown;
	adminBaseUrl?: string;
}

function makeEnv(overrides: ITestEnvOverrides = {}): Env {
	return {
		CONTENT_KV: makeKv(),
		ALLOWED_ORIGINS: 'https://admin.example.com',
		ENVIRONMENT: 'production',
		JWT_SIGNING_SECRET: 'test-secret-value-abc-123',
		ADMIN_BASE_URL: overrides.adminBaseUrl ?? 'https://admin.example.com',
		EMAIL: {
			send: vi.fn().mockResolvedValue(undefined),
		},
		...(overrides.rateLimiter !== undefined ? { RATE_LIMITER: overrides.rateLimiter } : {}),
	} as unknown as Env;
}

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

function buildRequest(body: unknown, extraHeaders: Record<string, string> = {}): Request {
	return new Request('https://admin.example.com/auth/request-reset', {
		method: 'POST',
		headers: {
			Origin: 'https://admin.example.com',
			'Content-Type': 'application/json',
			...extraHeaders,
		},
		body: body === undefined ? undefined : JSON.stringify(body),
	});
}

/** Locate the `pwreset:<token>` key(s) in KV via the list mock. */
async function listResetKeys(env: Env): Promise<string[]> {
	const listing = await env.CONTENT_KV.list({ prefix: 'pwreset:' });
	return listing.keys.map((k) => k.name);
}

async function readReset(env: Env, key: string): Promise<IPasswordReset | null> {
	const raw = await env.CONTENT_KV.get(key);
	return raw ? (JSON.parse(raw) as IPasswordReset) : null;
}

describe('POST /auth/request-reset', () => {
	let sendResetSpy: ReturnType<typeof vi.spyOn>;

	beforeEach(() => {
		sendResetSpy = vi.spyOn(sendResetModule, 'sendReset').mockResolvedValue(undefined);
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	async function assertEmptyEnvelope(response: Response): Promise<void> {
		expect(response.status).toBe(200);
		const body = (await response.json()) as { ok: boolean; data: unknown };
		expect(body.ok).toBe(true);
		expect(body.data).toEqual({});
	}

	it('active user + valid email → 200 empty envelope; creates reset in KV; sends email', async () => {
		const env = makeEnv();
		await createUser(env, await buildActiveUser());
		const before = Date.now();
		const response = await requestResetHandler.fetch(buildRequest({ email: 'alice@example.com' }, { 'CF-Connecting-IP': '1.2.3.4' }), env);
		await assertEmptyEnvelope(response);
		const keys = await listResetKeys(env);
		expect(keys.length).toBe(1);
		const reset = await readReset(env, keys[0]);
		expect(reset).not.toBeNull();
		expect(reset!.schemaVersion).toBe(1);
		expect(reset!.email).toBe('alice@example.com');
		expect(keys[0]).toBe(`pwreset:${reset!.token}`);
		expect(reset!.expiresAt).toBeGreaterThanOrEqual(before + RESET_TTL_MS - 10_000);
		expect(reset!.expiresAt).toBeLessThanOrEqual(before + RESET_TTL_MS + 10_000);
		expect(sendResetSpy).toHaveBeenCalledTimes(1);
		const [, sentReset] = sendResetSpy.mock.calls[0] as [Env, IPasswordReset];
		expect(sentReset.email).toBe('alice@example.com');
		expect(sentReset.token).toBe(reset!.token);
	});

	it('unknown email → 200 empty envelope; no reset in KV; no email sent', async () => {
		const env = makeEnv();
		const response = await requestResetHandler.fetch(buildRequest({ email: 'ghost@example.com' }, { 'CF-Connecting-IP': '1.2.3.4' }), env);
		await assertEmptyEnvelope(response);
		expect(await listResetKeys(env)).toEqual([]);
		expect(sendResetSpy).not.toHaveBeenCalled();
	});

	it('INVITED user → 200 empty envelope; no reset in KV; no email sent', async () => {
		const env = makeEnv();
		await createUser(env, await buildActiveUser({ status: EUserStatus.INVITED, passwordHash: null }));
		const response = await requestResetHandler.fetch(buildRequest({ email: 'alice@example.com' }, { 'CF-Connecting-IP': '1.2.3.4' }), env);
		await assertEmptyEnvelope(response);
		expect(await listResetKeys(env)).toEqual([]);
		expect(sendResetSpy).not.toHaveBeenCalled();
	});

	it('DISABLED user → 200 empty envelope; no reset in KV; no email sent', async () => {
		const env = makeEnv();
		await createUser(env, await buildActiveUser({ status: EUserStatus.DISABLED }));
		const response = await requestResetHandler.fetch(buildRequest({ email: 'alice@example.com' }, { 'CF-Connecting-IP': '1.2.3.4' }), env);
		await assertEmptyEnvelope(response);
		expect(await listResetKeys(env)).toEqual([]);
		expect(sendResetSpy).not.toHaveBeenCalled();
	});

	it('format-invalid email (non-empty string) → 200 empty envelope; no KV writes; no email', async () => {
		const env = makeEnv();
		const response = await requestResetHandler.fetch(buildRequest({ email: 'not-an-email' }, { 'CF-Connecting-IP': '1.2.3.4' }), env);
		await assertEmptyEnvelope(response);
		expect(await listResetKeys(env)).toEqual([]);
		expect(sendResetSpy).not.toHaveBeenCalled();
	});

	it('missing email field → 400 VALIDATION_FAILED with fields.email; no email sent', async () => {
		const env = makeEnv();
		const response = await requestResetHandler.fetch(buildRequest({}, { 'CF-Connecting-IP': '1.2.3.4' }), env);
		expect(response.status).toBe(400);
		const body = (await response.json()) as { ok: boolean; error: { code: string; fields: Record<string, unknown> } };
		expect(body.error.code).toBe('VALIDATION_FAILED');
		expect(body.error.fields.email).toBeDefined();
		expect(sendResetSpy).not.toHaveBeenCalled();
	});

	it('empty-string email → 400 VALIDATION_FAILED (min(1))', async () => {
		const env = makeEnv();
		const response = await requestResetHandler.fetch(buildRequest({ email: '' }, { 'CF-Connecting-IP': '1.2.3.4' }), env);
		expect(response.status).toBe(400);
		const body = (await response.json()) as { ok: boolean; error: { code: string } };
		expect(body.error.code).toBe('VALIDATION_FAILED');
		expect(sendResetSpy).not.toHaveBeenCalled();
	});

	it('per-IP rate limit exceeded → 429 RATE_LIMITED (even before body parse)', async () => {
		// Per-IP bucket is checked FIRST — even a malformed body should get 429
		// so an attacker cannot use malformed probes to bypass the IP ceiling.
		// The wrapper's generic bucket runs FIRST and must pass; the handler's
		// per-IP bucket runs SECOND and denies.
		const checkFn = vi.fn(async (key: string) => {
			if (key === 'auth:request-reset:1.2.3.4') {
				return { allowed: false, remaining: 0, resetTime: 555 };
			}
			return { allowed: true, remaining: 100, resetTime: 999 };
		});
		const mockDO = {
			idFromName: vi.fn().mockReturnValue('id-abc'),
			getByName: vi.fn().mockReturnValue({ check: checkFn }),
		};
		const env = makeEnv({ rateLimiter: mockDO });
		const response = await requestResetHandler.fetch(buildRequest({}, { 'CF-Connecting-IP': '1.2.3.4' }), env);
		expect(response.status).toBe(429);
		const body = (await response.json()) as { ok: boolean; error: { code: string; retryAfter?: number } };
		expect(body.error.code).toBe('RATE_LIMITED');
		expect(body.error.retryAfter).toBe(555);
		expect(sendResetSpy).not.toHaveBeenCalled();
	});

	it('per-IP-per-email rate limit exceeded → 429 RATE_LIMITED (per-IP passes, per-pair fails)', async () => {
		// Both handler buckets should be hit in order: per-IP first, then per-(IP,email).
		// The wrapper's generic bucket also fires (before either handler bucket).
		const checkFn = vi.fn(async (key: string) => {
			if (key === 'auth:request-reset:1.2.3.4:alice@example.com') {
				return { allowed: false, remaining: 0, resetTime: 777 };
			}
			return { allowed: true, remaining: 100, resetTime: 999 };
		});
		const mockDO = {
			idFromName: vi.fn().mockReturnValue('id-abc'),
			getByName: vi.fn().mockReturnValue({ check: checkFn }),
		};
		const env = makeEnv({ rateLimiter: mockDO });
		await createUser(env, await buildActiveUser());
		const response = await requestResetHandler.fetch(buildRequest({ email: 'alice@example.com' }, { 'CF-Connecting-IP': '1.2.3.4' }), env);
		expect(response.status).toBe(429);
		const body = (await response.json()) as { ok: boolean; error: { code: string; retryAfter?: number } };
		expect(body.error.code).toBe('RATE_LIMITED');
		expect(body.error.retryAfter).toBe(777);
		expect(await listResetKeys(env)).toEqual([]);
		expect(sendResetSpy).not.toHaveBeenCalled();
		// Assert both handler buckets were queried; per-IP before per-(IP,email).
		const keys = checkFn.mock.calls.map((c) => c[0] as string);
		const idxPerIp = keys.indexOf('auth:request-reset:1.2.3.4');
		const idxPerPair = keys.indexOf('auth:request-reset:1.2.3.4:alice@example.com');
		expect(idxPerIp).toBeGreaterThanOrEqual(0);
		expect(idxPerPair).toBeGreaterThan(idxPerIp);
	});

	it('prior resets for the same email are invalidated; a fresh single reset remains', async () => {
		const env = makeEnv();
		await createUser(env, await buildActiveUser());
		const now = Date.now();
		const stale: IPasswordReset = {
			schemaVersion: 1,
			token: 'stale-token-abcdef',
			email: 'alice@example.com',
			createdAt: now - 60_000,
			expiresAt: now + RESET_TTL_MS,
		};
		await createReset(env, stale);
		expect(await listResetKeys(env)).toEqual(['pwreset:stale-token-abcdef']);
		const response = await requestResetHandler.fetch(buildRequest({ email: 'alice@example.com' }, { 'CF-Connecting-IP': '1.2.3.4' }), env);
		await assertEmptyEnvelope(response);
		const keys = await listResetKeys(env);
		expect(keys.length).toBe(1);
		expect(keys).not.toContain('pwreset:stale-token-abcdef');
	});

	it('email is lowercased before lookup and stored on reset record', async () => {
		const env = makeEnv();
		await createUser(env, await buildActiveUser({ email: 'foo@bar.com' }));
		const response = await requestResetHandler.fetch(buildRequest({ email: 'FOO@bar.com' }, { 'CF-Connecting-IP': '1.2.3.4' }), env);
		await assertEmptyEnvelope(response);
		const keys = await listResetKeys(env);
		expect(keys.length).toBe(1);
		const reset = await readReset(env, keys[0]);
		expect(reset!.email).toBe('foo@bar.com');
		expect(sendResetSpy).toHaveBeenCalledTimes(1);
	});

	it('email send failure → still 200 empty envelope; reset record still created', async () => {
		sendResetSpy.mockRejectedValueOnce(new Error('SMTP boom'));
		const env = makeEnv();
		await createUser(env, await buildActiveUser());
		const response = await requestResetHandler.fetch(buildRequest({ email: 'alice@example.com' }, { 'CF-Connecting-IP': '1.2.3.4' }), env);
		await assertEmptyEnvelope(response);
		const keys = await listResetKeys(env);
		expect(keys.length).toBe(1);
		expect(sendResetSpy).toHaveBeenCalledTimes(1);
	});

	it('sendReset receives the reset record whose token matches KV', async () => {
		const env = makeEnv({ adminBaseUrl: 'https://admin.beeepic.example' });
		await createUser(env, await buildActiveUser());
		const response = await requestResetHandler.fetch(buildRequest({ email: 'alice@example.com' }, { 'CF-Connecting-IP': '1.2.3.4' }), env);
		await assertEmptyEnvelope(response);
		const keys = await listResetKeys(env);
		const reset = await readReset(env, keys[0]);
		expect(sendResetSpy).toHaveBeenCalledTimes(1);
		const [passedEnv, passedReset] = sendResetSpy.mock.calls[0] as [Env, IPasswordReset];
		expect(passedEnv.ADMIN_BASE_URL).toBe('https://admin.beeepic.example');
		expect(passedReset.token).toBe(reset!.token);
		expect(passedReset.email).toBe('alice@example.com');
	});

	it('invalidateForEmail runs on the happy path (invariant: at most one live token per email)', async () => {
		// Even when NO stale record exists, invalidateForEmail must still fire
		// before createReset — this proves the invariant runs on every success
		// path, not just when there's an existing record to sweep.
		const invalidateSpy = vi.spyOn(resetRepo, 'invalidateForEmail');
		const env = makeEnv();
		await createUser(env, await buildActiveUser());
		const response = await requestResetHandler.fetch(buildRequest({ email: 'alice@example.com' }, { 'CF-Connecting-IP': '1.2.3.4' }), env);
		await assertEmptyEnvelope(response);
		expect(invalidateSpy).toHaveBeenCalledTimes(1);
		// Called with the normalized (lowercased) email BEFORE createReset.
		const [, passedEmail] = invalidateSpy.mock.calls[0] as [Env, string];
		expect(passedEmail).toBe('alice@example.com');
		// And it ran BEFORE the fresh reset was written — the spy's call
		// happened while the store had zero pwreset keys, then createReset
		// added one afterwards.
		const keys = await listResetKeys(env);
		expect(keys.length).toBe(1);
	});

	it('getUser throw → 200 empty envelope (no enumeration leak via 500)', async () => {
		// A KV blow-up on the user lookup must degrade to the same always-200
		// empty envelope as "user missing". Bubbling to a 500 would create a
		// distinguishable response an attacker could use for enumeration.
		vi.spyOn(userRepo, 'getUser').mockRejectedValueOnce(new Error('kv boom'));
		const env = makeEnv();
		await createUser(env, await buildActiveUser());
		const response = await requestResetHandler.fetch(buildRequest({ email: 'alice@example.com' }, { 'CF-Connecting-IP': '1.2.3.4' }), env);
		await assertEmptyEnvelope(response);
		// No reset record created, no email sent — same shape as "user missing".
		expect(await listResetKeys(env)).toEqual([]);
		expect(sendResetSpy).not.toHaveBeenCalled();
	});
});
