import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EStaffRole, EUserStatus, REFRESH_TTL_MS, type IAuthPolicy, type IRefreshFamily, type IUser } from '@bee-epic/shared';
import changePasswordHandler from '../../../src/auth/handlers/changePassword';
import { createUser, getUser } from '../../../src/auth/repo/userRepo';
import { createFamily, listForEmail } from '../../../src/auth/repo/refreshFamilyRepo';
import * as sendPasswordChangedModule from '../../../src/auth/emails/sendPasswordChanged';
import { putPolicy, _clearCacheForTests } from '../../../src/auth/repo/policyRepo';
import { hashPassword, verifyPassword } from '../../../src/auth/crypto/passwordHash';
import { signJwt } from '../../../src/auth/crypto/jwt';

vi.mock('../../../src/auth/emails/sendPasswordChanged', async (importOriginal) => {
	const actual = await importOriginal<typeof import('../../../src/auth/emails/sendPasswordChanged')>();
	return { ...actual };
});

/** In-memory KV mock (mirrors the completeReset suite). */
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
		// Development so we can use X-Dev-Email to simulate an authenticated
		// cookie session without minting a full CF Access JWT + JWKS mock.
		ENVIRONMENT: 'development',
		JWT_SIGNING_SECRET: 'test-secret-value-abc-123',
		API_SECRET_KEY: 'ci-bearer-secret',
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

const CURRENT_PASSWORD = 'correct-horse-battery-staple';
const NEW_PASSWORD = 'zebra-quilt-plum-9';

async function buildActiveUser(overrides: Partial<IUser> = {}): Promise<IUser> {
	const now = Date.now();
	const passwordHash = overrides.passwordHash === null ? null : (overrides.passwordHash ?? (await hashPassword(CURRENT_PASSWORD)));
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
		ip: null,
		...overrides,
	};
	await createFamily(env, family);
	return family;
}

async function mintRefreshCookie(env: Env, email: string, familyId: string, jti: string): Promise<string> {
	const rt = await signJwt({ sub: email, type: 'refresh', fid: familyId, jti }, env.JWT_SIGNING_SECRET, Math.floor(REFRESH_TTL_MS / 1000));
	return `bea_rt=${rt}`;
}

interface IReqOpts {
	cookie?: string;
	bearer?: string;
	devEmail?: string;
	body?: unknown;
	method?: string;
}

function buildRequest(opts: IReqOpts = {}): Request {
	const headers: Record<string, string> = {
		Origin: 'https://admin.example.com',
		'Content-Type': 'application/json',
	};
	if (opts.cookie) headers['Cookie'] = opts.cookie;
	if (opts.bearer) headers['Authorization'] = `Bearer ${opts.bearer}`;
	if (opts.devEmail) headers['X-Dev-Email'] = opts.devEmail;
	const method = opts.method ?? 'POST';
	return new Request('https://admin.example.com/auth/change-password', {
		method,
		headers,
		body: method === 'POST' ? JSON.stringify(opts.body ?? {}) : undefined,
	});
}

describe('POST /auth/change-password', () => {
	let sendPasswordChangedSpy: ReturnType<typeof vi.spyOn>;

	beforeEach(async () => {
		vi.spyOn(console, 'warn').mockImplementation(() => undefined);
		vi.spyOn(console, 'error').mockImplementation(() => undefined);
		_clearCacheForTests();
		sendPasswordChangedSpy = vi.spyOn(sendPasswordChangedModule, 'sendPasswordChanged').mockResolvedValue(undefined);
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('happy path: cookie session, correct current password, strong new password → 204, hash rotated, CURRENT family preserved, others deleted', async () => {
		const env = makeEnv();
		await seedPolicy(env);
		const original = await buildActiveUser();
		const originalHash = original.passwordHash;
		await createUser(env, original);
		// Seed the current session family + one other family.
		await seedFamily(env, 'alice@example.com', 'fam-current', 'jti-current');
		await seedFamily(env, 'alice@example.com', 'fam-other', 'jti-other');
		const cookie = await mintRefreshCookie(env, 'alice@example.com', 'fam-current', 'jti-current');

		const response = await changePasswordHandler.fetch(
			buildRequest({
				cookie,
				devEmail: 'alice@example.com',
				body: { currentPassword: CURRENT_PASSWORD, newPassword: NEW_PASSWORD },
			}),
			env,
		);
		expect(response.status).toBe(204);

		const stored = await getUser(env, 'alice@example.com');
		expect(stored?.passwordHash).toBeTruthy();
		expect(stored?.passwordHash).not.toBe(originalHash);
		expect(await verifyPassword(NEW_PASSWORD, stored!.passwordHash!)).toBe(true);

		const families = await listForEmail(env, 'alice@example.com');
		expect(families.length).toBe(1);
		expect(families[0].familyId).toBe('fam-current');
	});

	it('multiple other families exist → only fam-current survives', async () => {
		const env = makeEnv();
		await seedPolicy(env);
		await createUser(env, await buildActiveUser());
		await seedFamily(env, 'alice@example.com', 'fam-current', 'jti-current');
		await seedFamily(env, 'alice@example.com', 'fam-a', 'jti-a');
		await seedFamily(env, 'alice@example.com', 'fam-b', 'jti-b');
		await seedFamily(env, 'alice@example.com', 'fam-c', 'jti-c');
		const cookie = await mintRefreshCookie(env, 'alice@example.com', 'fam-current', 'jti-current');

		const response = await changePasswordHandler.fetch(
			buildRequest({
				cookie,
				devEmail: 'alice@example.com',
				body: { currentPassword: CURRENT_PASSWORD, newPassword: NEW_PASSWORD },
			}),
			env,
		);
		expect(response.status).toBe(204);

		const families = await listForEmail(env, 'alice@example.com');
		expect(families.length).toBe(1);
		expect(families[0].familyId).toBe('fam-current');
	});

	it('caller with no refresh cookie (bearer / dev caller) → ALL families deleted (no session to preserve)', async () => {
		const env = makeEnv();
		await seedPolicy(env);
		await createUser(env, await buildActiveUser());
		await seedFamily(env, 'alice@example.com', 'fam-a', 'jti-a');
		await seedFamily(env, 'alice@example.com', 'fam-b', 'jti-b');
		await seedFamily(env, 'alice@example.com', 'fam-c', 'jti-c');

		// Authenticate via X-Dev-Email but attach NO bea_rt cookie — mirrors a
		// bearer / dev caller: authenticated identity, but no refresh-family
		// session to preserve. The handler must delete ALL families.
		const response = await changePasswordHandler.fetch(
			buildRequest({
				devEmail: 'alice@example.com',
				body: { currentPassword: CURRENT_PASSWORD, newPassword: NEW_PASSWORD },
			}),
			env,
		);
		expect(response.status).toBe(204);

		// Every family deleted (no cookie fid to identify "current").
		expect((await listForEmail(env, 'alice@example.com')).length).toBe(0);
	});

	it('same password (new === current) → 204, no state change (hash unchanged, families untouched)', async () => {
		const env = makeEnv();
		await seedPolicy(env);
		const original = await buildActiveUser();
		const originalHash = original.passwordHash;
		await createUser(env, original);
		await seedFamily(env, 'alice@example.com', 'fam-current', 'jti-current');
		await seedFamily(env, 'alice@example.com', 'fam-other', 'jti-other');
		const cookie = await mintRefreshCookie(env, 'alice@example.com', 'fam-current', 'jti-current');

		const response = await changePasswordHandler.fetch(
			buildRequest({
				cookie,
				devEmail: 'alice@example.com',
				body: { currentPassword: CURRENT_PASSWORD, newPassword: CURRENT_PASSWORD },
			}),
			env,
		);
		expect(response.status).toBe(204);

		const stored = await getUser(env, 'alice@example.com');
		expect(stored?.passwordHash).toBe(originalHash);
		const families = await listForEmail(env, 'alice@example.com');
		expect(families.length).toBe(2);
		// Notification should NOT be sent on same-password short-circuit.
		await Promise.resolve();
		expect(sendPasswordChangedSpy).not.toHaveBeenCalled();
	});

	it('wrong current password → 401 INVALID_CREDENTIALS; password + families untouched', async () => {
		const env = makeEnv();
		await seedPolicy(env);
		const original = await buildActiveUser();
		const originalHash = original.passwordHash;
		await createUser(env, original);
		await seedFamily(env, 'alice@example.com', 'fam-current', 'jti-current');
		await seedFamily(env, 'alice@example.com', 'fam-other', 'jti-other');
		const cookie = await mintRefreshCookie(env, 'alice@example.com', 'fam-current', 'jti-current');

		const response = await changePasswordHandler.fetch(
			buildRequest({
				cookie,
				devEmail: 'alice@example.com',
				body: { currentPassword: 'wrong-password', newPassword: NEW_PASSWORD },
			}),
			env,
		);
		expect(response.status).toBe(401);
		const body = (await response.json()) as { error: { code: string } };
		expect(body.error.code).toBe('INVALID_CREDENTIALS');

		const stored = await getUser(env, 'alice@example.com');
		expect(stored?.passwordHash).toBe(originalHash);
		expect((await listForEmail(env, 'alice@example.com')).length).toBe(2);
	});

	it('weak new password → 400 WEAK_PASSWORD with reasons; password + families untouched', async () => {
		const env = makeEnv();
		await seedPolicy(env);
		const original = await buildActiveUser();
		const originalHash = original.passwordHash;
		await createUser(env, original);
		await seedFamily(env, 'alice@example.com', 'fam-current', 'jti-current');
		await seedFamily(env, 'alice@example.com', 'fam-other', 'jti-other');
		const cookie = await mintRefreshCookie(env, 'alice@example.com', 'fam-current', 'jti-current');

		const response = await changePasswordHandler.fetch(
			buildRequest({
				cookie,
				devEmail: 'alice@example.com',
				body: { currentPassword: CURRENT_PASSWORD, newPassword: 'short' },
			}),
			env,
		);
		expect(response.status).toBe(400);
		const body = (await response.json()) as { error: { code: string; reasons: string[] } };
		expect(body.error.code).toBe('WEAK_PASSWORD');
		expect(Array.isArray(body.error.reasons)).toBe(true);
		expect(body.error.reasons.length).toBeGreaterThan(0);

		const stored = await getUser(env, 'alice@example.com');
		expect(stored?.passwordHash).toBe(originalHash);
		expect((await listForEmail(env, 'alice@example.com')).length).toBe(2);
	});

	it('missing currentPassword → 400 VALIDATION_FAILED with fields.currentPassword', async () => {
		const env = makeEnv();
		await seedPolicy(env);
		await createUser(env, await buildActiveUser());
		await seedFamily(env, 'alice@example.com', 'fam-current', 'jti-current');
		const cookie = await mintRefreshCookie(env, 'alice@example.com', 'fam-current', 'jti-current');

		const response = await changePasswordHandler.fetch(
			buildRequest({
				cookie,
				devEmail: 'alice@example.com',
				body: { newPassword: NEW_PASSWORD },
			}),
			env,
		);
		expect(response.status).toBe(400);
		const body = (await response.json()) as {
			error: { code: string; fields: Record<string, string> };
		};
		expect(body.error.code).toBe('VALIDATION_FAILED');
		expect(body.error.fields.currentPassword).toBeDefined();
	});

	it('missing newPassword → 400 VALIDATION_FAILED', async () => {
		const env = makeEnv();
		await seedPolicy(env);
		await createUser(env, await buildActiveUser());
		await seedFamily(env, 'alice@example.com', 'fam-current', 'jti-current');
		const cookie = await mintRefreshCookie(env, 'alice@example.com', 'fam-current', 'jti-current');

		const response = await changePasswordHandler.fetch(
			buildRequest({
				cookie,
				devEmail: 'alice@example.com',
				body: { currentPassword: CURRENT_PASSWORD },
			}),
			env,
		);
		expect(response.status).toBe(400);
		const body = (await response.json()) as {
			error: { code: string; fields: Record<string, string> };
		};
		expect(body.error.code).toBe('VALIDATION_FAILED');
		expect(body.error.fields.newPassword).toBeDefined();
	});

	it('no caller (unauthenticated) → 401 UNAUTHORIZED; nothing touched', async () => {
		const env = makeEnv();
		await seedPolicy(env);
		const original = await buildActiveUser();
		const originalHash = original.passwordHash;
		await createUser(env, original);
		await seedFamily(env, 'alice@example.com', 'fam-current', 'jti-current');

		const response = await changePasswordHandler.fetch(
			buildRequest({
				body: { currentPassword: CURRENT_PASSWORD, newPassword: NEW_PASSWORD },
			}),
			env,
		);
		expect(response.status).toBe(401);
		const body = (await response.json()) as { error: { code: string } };
		expect(body.error.code).toBe('UNAUTHORIZED');

		const stored = await getUser(env, 'alice@example.com');
		expect(stored?.passwordHash).toBe(originalHash);
		expect((await listForEmail(env, 'alice@example.com')).length).toBe(1);
	});

	it('sends notification email when policy.notifyOnPasswordChange === true', async () => {
		const env = makeEnv();
		await seedPolicy(env, true);
		await createUser(env, await buildActiveUser());
		await seedFamily(env, 'alice@example.com', 'fam-current', 'jti-current');
		const cookie = await mintRefreshCookie(env, 'alice@example.com', 'fam-current', 'jti-current');

		const response = await changePasswordHandler.fetch(
			buildRequest({
				cookie,
				devEmail: 'alice@example.com',
				body: { currentPassword: CURRENT_PASSWORD, newPassword: NEW_PASSWORD },
			}),
			env,
		);
		expect(response.status).toBe(204);
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
		await seedFamily(env, 'alice@example.com', 'fam-current', 'jti-current');
		const cookie = await mintRefreshCookie(env, 'alice@example.com', 'fam-current', 'jti-current');

		const response = await changePasswordHandler.fetch(
			buildRequest({
				cookie,
				devEmail: 'alice@example.com',
				body: { currentPassword: CURRENT_PASSWORD, newPassword: NEW_PASSWORD },
			}),
			env,
		);
		expect(response.status).toBe(204);
		await Promise.resolve();
		expect(sendPasswordChangedSpy).not.toHaveBeenCalled();
	});

	it('notification-email failure → still 204 (fire-and-forget)', async () => {
		const env = makeEnv();
		await seedPolicy(env, true);
		await createUser(env, await buildActiveUser());
		await seedFamily(env, 'alice@example.com', 'fam-current', 'jti-current');
		const cookie = await mintRefreshCookie(env, 'alice@example.com', 'fam-current', 'jti-current');

		sendPasswordChangedSpy.mockRejectedValueOnce(new Error('SMTP boom'));

		const response = await changePasswordHandler.fetch(
			buildRequest({
				cookie,
				devEmail: 'alice@example.com',
				body: { currentPassword: CURRENT_PASSWORD, newPassword: NEW_PASSWORD },
			}),
			env,
		);
		expect(response.status).toBe(204);
	});

	it('INVITED user with null passwordHash → 401 INVALID_CREDENTIALS (guard against direct KV manipulation)', async () => {
		const env = makeEnv();
		await seedPolicy(env);
		await createUser(env, await buildActiveUser({ status: EUserStatus.INVITED, passwordHash: null }));
		await seedFamily(env, 'alice@example.com', 'fam-current', 'jti-current');
		const cookie = await mintRefreshCookie(env, 'alice@example.com', 'fam-current', 'jti-current');

		const response = await changePasswordHandler.fetch(
			buildRequest({
				cookie,
				devEmail: 'alice@example.com',
				body: { currentPassword: CURRENT_PASSWORD, newPassword: NEW_PASSWORD },
			}),
			env,
		);
		expect(response.status).toBe(401);
		const body = (await response.json()) as { error: { code: string } };
		expect(body.error.code).toBe('INVALID_CREDENTIALS');
	});
});
