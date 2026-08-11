import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
	EStaffRole,
	EUserStatus,
	RESET_TTL_MS,
	type IAuthPolicy,
	type IPasswordReset,
	type IRefreshFamily,
	type IUser,
} from '@bee-epic/shared';
import completeResetHandler from '../../../src/auth/handlers/completeReset';
import { createUser, getUser } from '../../../src/auth/repo/userRepo';
import { createReset, getReset } from '../../../src/auth/repo/resetRepo';
import { createFamily, listForEmail } from '../../../src/auth/repo/refreshFamilyRepo';
import * as userRepo from '../../../src/auth/repo/userRepo';
import * as sendPasswordChangedModule from '../../../src/auth/emails/sendPasswordChanged';
import { putPolicy, _clearCacheForTests } from '../../../src/auth/repo/policyRepo';
import { hashPassword } from '../../../src/auth/crypto/passwordHash';
import { verifyJwt } from '../../../src/auth/crypto/jwt';

vi.mock('../../../src/auth/repo/userRepo', async (importOriginal) => {
	const actual = await importOriginal<typeof import('../../../src/auth/repo/userRepo')>();
	return { ...actual };
});

vi.mock('../../../src/auth/emails/sendPasswordChanged', async (importOriginal) => {
	const actual = await importOriginal<typeof import('../../../src/auth/emails/sendPasswordChanged')>();
	return { ...actual };
});

/** In-memory KV mock. */
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
		ADMIN_BASE_URL: 'https://admin.example.com',
		EMAIL: {
			send: vi.fn().mockResolvedValue(undefined),
		},
	} as unknown as Env;
}

async function seedPolicy(env: Env, notifyOnPasswordChange = true): Promise<void> {
	const policy: IAuthPolicy = {
		schemaVersion: 1,
		minLength: 8,
		checkBreachCorpus: false,
		notifyOnPasswordChange,
		updatedAt: Date.now(),
		updatedBy: 'test@example.com',
	};
	await putPolicy(env, policy);
}

async function buildActiveUser(overrides: Partial<IUser> = {}): Promise<IUser> {
	const now = Date.now();
	const passwordHash =
		overrides.passwordHash === null ? null : (overrides.passwordHash ?? (await hashPassword('correct-horse-battery-staple')));
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

function buildReset(overrides: Partial<IPasswordReset> = {}): IPasswordReset {
	const now = Date.now();
	return {
		schemaVersion: 1,
		token: 'reset-token-abc',
		email: 'alice@example.com',
		createdAt: now,
		expiresAt: now + RESET_TTL_MS,
		...overrides,
	};
}

function buildCompleteRequest(body: unknown): Request {
	return new Request('https://admin.example.com/auth/complete-reset', {
		method: 'POST',
		headers: {
			Origin: 'https://admin.example.com',
			'Content-Type': 'application/json',
			'CF-Connecting-IP': '1.2.3.4',
		},
		body: JSON.stringify(body),
	});
}

const STRONG_PASSWORD = 'zebra-quilt-plum-9';

describe('POST /auth/complete-reset', () => {
	let sendPasswordChangedSpy: ReturnType<typeof vi.spyOn>;

	beforeEach(() => {
		vi.spyOn(console, 'warn').mockImplementation(() => undefined);
		vi.spyOn(console, 'error').mockImplementation(() => undefined);
		_clearCacheForTests();
		sendPasswordChangedSpy = vi.spyOn(sendPasswordChangedModule, 'sendPasswordChanged').mockResolvedValue(undefined);
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('happy path: ACTIVE user + valid reset + strong password → 200 caller returned, cookies set, passwordHash rotated', async () => {
		const env = makeEnv();
		await seedPolicy(env);
		const originalUser = await buildActiveUser();
		const originalHash = originalUser.passwordHash;
		await createUser(env, originalUser);
		await createReset(env, buildReset());

		const response = await completeResetHandler.fetch(buildCompleteRequest({ token: 'reset-token-abc', password: STRONG_PASSWORD }), env);
		expect(response.status).toBe(200);
		const body = (await response.json()) as {
			ok: boolean;
			data: { caller: { email: string; role: string; displayName: string } };
		};
		expect(body.ok).toBe(true);
		expect(body.data.caller.email).toBe('alice@example.com');
		expect(body.data.caller.role).toBe(EStaffRole.OWNER);
		expect(body.data.caller.displayName).toBe('Alice');

		const setCookie = (response.headers as unknown as { getSetCookie?: () => string[] }).getSetCookie?.() ?? [];
		expect(setCookie.some((c) => c.startsWith('bea_at='))).toBe(true);
		expect(setCookie.some((c) => c.startsWith('bea_rt='))).toBe(true);

		const stored = await getUser(env, 'alice@example.com');
		expect(stored?.passwordHash).toBeTruthy();
		expect(stored?.passwordHash).not.toBe(originalHash);
	});

	it('kills all prior refresh families and creates a fresh one', async () => {
		const env = makeEnv();
		await seedPolicy(env);
		await createUser(env, await buildActiveUser());
		await createReset(env, buildReset());

		// Seed a stale family for this email.
		const now = Date.now();
		const staleFamily: IRefreshFamily = {
			schemaVersion: 1,
			familyId: 'stale-family-id',
			email: 'alice@example.com',
			currentJti: 'stale-jti',
			createdAt: now - 10_000,
			lastRefreshedAt: now - 10_000,
			expiresAt: now + 60_000,
			userAgent: null,
			ip: null,
		};
		await createFamily(env, staleFamily);

		const response = await completeResetHandler.fetch(buildCompleteRequest({ token: 'reset-token-abc', password: STRONG_PASSWORD }), env);
		expect(response.status).toBe(200);

		const families = await listForEmail(env, 'alice@example.com');
		expect(families.length).toBe(1);
		expect(families[0].familyId).not.toBe('stale-family-id');
		// Schema-shape checks on the new family.
		expect(families[0].schemaVersion).toBe(1);
		expect(families[0].email).toBe('alice@example.com');
		expect(families[0].expiresAt).toBeGreaterThan(Date.now());
	});

	it('consumes the reset token on success', async () => {
		const env = makeEnv();
		await seedPolicy(env);
		await createUser(env, await buildActiveUser());
		await createReset(env, buildReset());

		const response = await completeResetHandler.fetch(buildCompleteRequest({ token: 'reset-token-abc', password: STRONG_PASSWORD }), env);
		expect(response.status).toBe(200);

		expect(await getReset(env, 'reset-token-abc')).toBeNull();
	});

	it('sends notification email when policy.notifyOnPasswordChange === true', async () => {
		const env = makeEnv();
		await seedPolicy(env, true);
		await createUser(env, await buildActiveUser());
		await createReset(env, buildReset());

		const response = await completeResetHandler.fetch(buildCompleteRequest({ token: 'reset-token-abc', password: STRONG_PASSWORD }), env);
		expect(response.status).toBe(200);
		// Give any fire-and-forget promise a tick to settle.
		await Promise.resolve();
		expect(sendPasswordChangedSpy).toHaveBeenCalledTimes(1);
		const [passedEnv, passedUser] = sendPasswordChangedSpy.mock.calls[0] as [Env, IUser];
		expect(passedEnv).toBe(env);
		expect(passedUser.email).toBe('alice@example.com');
	});

	it('does NOT send notification when policy.notifyOnPasswordChange === false', async () => {
		const env = makeEnv();
		await seedPolicy(env, false);
		await createUser(env, await buildActiveUser());
		await createReset(env, buildReset());

		const response = await completeResetHandler.fetch(buildCompleteRequest({ token: 'reset-token-abc', password: STRONG_PASSWORD }), env);
		expect(response.status).toBe(200);
		await Promise.resolve();
		expect(sendPasswordChangedSpy).not.toHaveBeenCalled();
	});

	it('missing token → 400 VALIDATION_FAILED with fields.token', async () => {
		const env = makeEnv();
		await seedPolicy(env);
		const response = await completeResetHandler.fetch(buildCompleteRequest({ password: STRONG_PASSWORD }), env);
		expect(response.status).toBe(400);
		const body = (await response.json()) as {
			error: { code: string; fields: Record<string, string> };
		};
		expect(body.error.code).toBe('VALIDATION_FAILED');
		expect(body.error.fields.token).toBeDefined();
	});

	it('missing password → 400 VALIDATION_FAILED', async () => {
		const env = makeEnv();
		await seedPolicy(env);
		const response = await completeResetHandler.fetch(buildCompleteRequest({ token: 'x' }), env);
		expect(response.status).toBe(400);
		const body = (await response.json()) as {
			error: { code: string; fields: Record<string, string> };
		};
		expect(body.error.code).toBe('VALIDATION_FAILED');
		expect(body.error.fields.password).toBeDefined();
	});

	it('invalid token (never existed) → 400 INVALID_TOKEN; no user mutation; no family delete', async () => {
		const env = makeEnv();
		await seedPolicy(env);
		const user = await buildActiveUser();
		await createUser(env, user);

		// Seed a family so we can prove it wasn't touched.
		const now = Date.now();
		const family: IRefreshFamily = {
			schemaVersion: 1,
			familyId: 'preexisting',
			email: 'alice@example.com',
			currentJti: 'preexisting-jti',
			createdAt: now,
			lastRefreshedAt: now,
			expiresAt: now + 60_000,
			userAgent: null,
			ip: null,
		};
		await createFamily(env, family);

		const response = await completeResetHandler.fetch(buildCompleteRequest({ token: 'no-such-token', password: STRONG_PASSWORD }), env);
		expect(response.status).toBe(400);
		const body = (await response.json()) as { error: { code: string } };
		expect(body.error.code).toBe('INVALID_TOKEN');

		const stored = await getUser(env, 'alice@example.com');
		expect(stored?.passwordHash).toBe(user.passwordHash);
		const families = await listForEmail(env, 'alice@example.com');
		expect(families.length).toBe(1);
		expect(families[0].familyId).toBe('preexisting');
	});

	it('expired reset → 400 INVALID_TOKEN; no user mutation', async () => {
		const env = makeEnv();
		await seedPolicy(env);
		const user = await buildActiveUser();
		await createUser(env, user);
		// Bypass createReset's TTL clamp by writing directly.
		const expired = buildReset({ expiresAt: Date.now() - 1_000 });
		await env.CONTENT_KV.put(`pwreset:${expired.token}`, JSON.stringify(expired));

		const response = await completeResetHandler.fetch(buildCompleteRequest({ token: expired.token, password: STRONG_PASSWORD }), env);
		expect(response.status).toBe(400);
		const body = (await response.json()) as { error: { code: string } };
		expect(body.error.code).toBe('INVALID_TOKEN');

		const stored = await getUser(env, 'alice@example.com');
		expect(stored?.passwordHash).toBe(user.passwordHash);
	});

	it('weak password → 400 WEAK_PASSWORD with reasons; reset NOT consumed; user NOT mutated', async () => {
		const env = makeEnv();
		await seedPolicy(env);
		const user = await buildActiveUser();
		await createUser(env, user);
		await createReset(env, buildReset());

		const response = await completeResetHandler.fetch(buildCompleteRequest({ token: 'reset-token-abc', password: 'short' }), env);
		expect(response.status).toBe(400);
		const body = (await response.json()) as { error: { code: string; reasons: string[] } };
		expect(body.error.code).toBe('WEAK_PASSWORD');
		expect(Array.isArray(body.error.reasons)).toBe(true);
		expect(body.error.reasons.length).toBeGreaterThan(0);

		// Reset preserved for retry.
		expect(await getReset(env, 'reset-token-abc')).not.toBeNull();
		// User untouched.
		const stored = await getUser(env, 'alice@example.com');
		expect(stored?.passwordHash).toBe(user.passwordHash);
	});

	it('user DISABLED between reset request and complete → 400 INVALID_TOKEN; reset NOT consumed; no user mutation', async () => {
		const env = makeEnv();
		await seedPolicy(env);
		const user = await buildActiveUser({ status: EUserStatus.DISABLED });
		await createUser(env, user);
		await createReset(env, buildReset());

		const response = await completeResetHandler.fetch(buildCompleteRequest({ token: 'reset-token-abc', password: STRONG_PASSWORD }), env);
		expect(response.status).toBe(400);
		const body = (await response.json()) as { error: { code: string } };
		expect(body.error.code).toBe('INVALID_TOKEN');

		expect(await getReset(env, 'reset-token-abc')).not.toBeNull();
		const stored = await getUser(env, 'alice@example.com');
		expect(stored?.passwordHash).toBe(user.passwordHash);
		expect(stored?.status).toBe(EUserStatus.DISABLED);
	});

	it('user missing (deleted between request and complete) → 400 INVALID_TOKEN; reset NOT consumed; no writes', async () => {
		const env = makeEnv();
		await seedPolicy(env);
		// No user seeded.
		await createReset(env, buildReset());

		const response = await completeResetHandler.fetch(buildCompleteRequest({ token: 'reset-token-abc', password: STRONG_PASSWORD }), env);
		expect(response.status).toBe(400);
		const body = (await response.json()) as { error: { code: string } };
		expect(body.error.code).toBe('INVALID_TOKEN');

		expect(await getReset(env, 'reset-token-abc')).not.toBeNull();
	});

	it('getUser throws → 400 INVALID_TOKEN (no enumeration leak via 500)', async () => {
		const env = makeEnv();
		await seedPolicy(env);
		await createReset(env, buildReset());

		vi.spyOn(userRepo, 'getUser').mockRejectedValueOnce(new Error('kv boom'));

		const response = await completeResetHandler.fetch(buildCompleteRequest({ token: 'reset-token-abc', password: STRONG_PASSWORD }), env);
		expect(response.status).toBe(400);
		const body = (await response.json()) as { error: { code: string } };
		expect(body.error.code).toBe('INVALID_TOKEN');

		// Reset preserved — nothing was consumed on the throw path.
		expect(await getReset(env, 'reset-token-abc')).not.toBeNull();
	});

	it('INVITED user → 400 INVALID_TOKEN (reset for a not-yet-activated account is nonsensical)', async () => {
		const env = makeEnv();
		await seedPolicy(env);
		await createUser(env, await buildActiveUser({ status: EUserStatus.INVITED, passwordHash: null }));
		await createReset(env, buildReset());

		const response = await completeResetHandler.fetch(buildCompleteRequest({ token: 'reset-token-abc', password: STRONG_PASSWORD }), env);
		expect(response.status).toBe(400);
		const body = (await response.json()) as { error: { code: string } };
		expect(body.error.code).toBe('INVALID_TOKEN');

		expect(await getReset(env, 'reset-token-abc')).not.toBeNull();
	});

	it('notification-email failure → still 200 success (send is fire-and-forget)', async () => {
		const env = makeEnv();
		await seedPolicy(env, true);
		await createUser(env, await buildActiveUser());
		await createReset(env, buildReset());

		sendPasswordChangedSpy.mockRejectedValueOnce(new Error('SMTP boom'));

		const response = await completeResetHandler.fetch(buildCompleteRequest({ token: 'reset-token-abc', password: STRONG_PASSWORD }), env);
		expect(response.status).toBe(200);
	});

	it('JWTs: access has role, refresh has fid + jti matching the new family', async () => {
		const env = makeEnv();
		await seedPolicy(env);
		await createUser(env, await buildActiveUser({ role: EStaffRole.MANAGER }));
		await createReset(env, buildReset());

		const response = await completeResetHandler.fetch(buildCompleteRequest({ token: 'reset-token-abc', password: STRONG_PASSWORD }), env);
		expect(response.status).toBe(200);

		const setCookie = (response.headers as unknown as { getSetCookie?: () => string[] }).getSetCookie?.() ?? [];
		const atCookie = setCookie.find((c) => c.startsWith('bea_at='));
		const rtCookie = setCookie.find((c) => c.startsWith('bea_rt='));
		expect(atCookie).toBeDefined();
		expect(rtCookie).toBeDefined();
		const accessToken = atCookie!.split(';')[0].slice('bea_at='.length);
		const refreshToken = rtCookie!.split(';')[0].slice('bea_rt='.length);

		const accessPayload = await verifyJwt(accessToken, env.JWT_SIGNING_SECRET, 'access');
		expect(accessPayload).not.toBeNull();
		expect(accessPayload?.role).toBe(EStaffRole.MANAGER);

		const refreshPayload = await verifyJwt(refreshToken, env.JWT_SIGNING_SECRET, 'refresh');
		expect(refreshPayload).not.toBeNull();

		const families = await listForEmail(env, 'alice@example.com');
		expect(families.length).toBe(1);
		expect((refreshPayload as unknown as { fid: string }).fid).toBe(families[0].familyId);
		expect((refreshPayload as unknown as { jti: string }).jti).toBe(families[0].currentJti);
	});
});
