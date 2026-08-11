import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EStaffRole, EUserStatus, INVITE_TTL_MS, type IUser, type IInvite } from '@bee-epic/shared';
import bootstrapOwnerHandler from '../../../src/auth/handlers/bootstrapOwner';
import { createUser } from '../../../src/auth/repo/userRepo';
import { createInvite } from '../../../src/auth/repo/inviteRepo';
import * as inviteRepo from '../../../src/auth/repo/inviteRepo';
import { hashPassword } from '../../../src/auth/crypto/passwordHash';
import * as sendInviteModule from '../../../src/auth/emails/sendInvite';

vi.mock('../../../src/auth/repo/inviteRepo', async (importOriginal) => {
	const actual = await importOriginal<typeof import('../../../src/auth/repo/inviteRepo')>();
	return { ...actual };
});

/** In-memory KV mock — same pattern as requestReset.spec.ts. Fresh per test. */
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
	ownerEmails?: string | undefined;
}

function makeEnv(overrides: ITestEnvOverrides = {}): Env {
	const env: Record<string, unknown> = {
		CONTENT_KV: makeKv(),
		ALLOWED_ORIGINS: 'https://admin.example.com',
		ENVIRONMENT: 'production',
		JWT_SIGNING_SECRET: 'test-secret-value-abc-123',
		ADMIN_BASE_URL: overrides.adminBaseUrl ?? 'https://admin.example.com',
		EMAIL: {
			send: vi.fn().mockResolvedValue(undefined),
		},
	};
	if (overrides.ownerEmails !== undefined) {
		env.OWNER_EMAILS = overrides.ownerEmails;
	}
	if (overrides.rateLimiter !== undefined) {
		env.RATE_LIMITER = overrides.rateLimiter;
	}
	return env as unknown as Env;
}

async function buildOwnerUser(overrides: Partial<IUser> = {}): Promise<IUser> {
	const now = Date.now();
	const passwordHash = overrides.passwordHash === null ? null : await hashPassword('correct-horse-battery-staple');
	return {
		schemaVersion: 1,
		email: 'admin@example.com',
		displayName: 'Owner',
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
	return new Request('https://admin.example.com/auth/bootstrap-owner', {
		method: 'POST',
		headers: {
			Origin: 'https://admin.example.com',
			'Content-Type': 'application/json',
			...extraHeaders,
		},
		body: body === undefined ? undefined : JSON.stringify(body),
	});
}

async function listInviteKeys(env: Env): Promise<string[]> {
	const listing = await env.CONTENT_KV.list({ prefix: 'invite:' });
	return listing.keys.map((k) => k.name);
}

async function readInvite(env: Env, key: string): Promise<IInvite | null> {
	const raw = await env.CONTENT_KV.get(key);
	return raw ? (JSON.parse(raw) as IInvite) : null;
}

async function readUser(env: Env, email: string): Promise<IUser | null> {
	const raw = await env.CONTENT_KV.get(`user:${email.toLowerCase()}`);
	return raw ? (JSON.parse(raw) as IUser) : null;
}

describe('POST /auth/bootstrap-owner', () => {
	let sendInviteSpy: ReturnType<typeof vi.spyOn>;

	beforeEach(() => {
		sendInviteSpy = vi.spyOn(sendInviteModule, 'sendInvite').mockResolvedValue(undefined);
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('fresh setup: no users + OWNER_EMAILS match → 200 {inviteEmailSent:true}, creates INVITED OWNER user + invite, sends email', async () => {
		const env = makeEnv({ ownerEmails: 'admin@example.com' });
		const before = Date.now();
		const response = await bootstrapOwnerHandler.fetch(
			buildRequest({ email: 'admin@example.com' }, { 'CF-Connecting-IP': '1.2.3.4' }),
			env,
		);
		expect(response.status).toBe(200);
		const body = (await response.json()) as { ok: boolean; data: { inviteEmailSent: boolean } };
		expect(body.ok).toBe(true);
		expect(body.data.inviteEmailSent).toBe(true);

		const user = await readUser(env, 'admin@example.com');
		expect(user).not.toBeNull();
		expect(user!.role).toBe(EStaffRole.OWNER);
		expect(user!.status).toBe(EUserStatus.INVITED);
		expect(user!.passwordHash).toBeNull();

		const keys = await listInviteKeys(env);
		expect(keys.length).toBe(1);
		const invite = await readInvite(env, keys[0]);
		expect(invite).not.toBeNull();
		expect(invite!.role).toBe(EStaffRole.OWNER);
		expect(invite!.email).toBe('admin@example.com');
		expect(invite!.expiresAt).toBeGreaterThanOrEqual(before + INVITE_TTL_MS - 10_000);
		expect(invite!.expiresAt).toBeLessThanOrEqual(before + INVITE_TTL_MS + 10_000);

		expect(sendInviteSpy).toHaveBeenCalledTimes(1);
		const [, sentInvite] = sendInviteSpy.mock.calls[0] as [Env, IInvite];
		expect(sentInvite.token).toBe(invite!.token);
	});

	it('OWNER_EMAILS unset → 403 BOOTSTRAP_DISABLED; nothing created', async () => {
		const env = makeEnv(); // ownerEmails omitted
		const response = await bootstrapOwnerHandler.fetch(
			buildRequest({ email: 'admin@example.com' }, { 'CF-Connecting-IP': '1.2.3.4' }),
			env,
		);
		expect(response.status).toBe(403);
		const body = (await response.json()) as { ok: boolean; error: { code: string } };
		expect(body.error.code).toBe('BOOTSTRAP_DISABLED');
		expect(await listInviteKeys(env)).toEqual([]);
		expect(await readUser(env, 'admin@example.com')).toBeNull();
		expect(sendInviteSpy).not.toHaveBeenCalled();
	});

	it('OWNER_EMAILS empty string → 403 BOOTSTRAP_DISABLED; nothing created', async () => {
		const env = makeEnv({ ownerEmails: '' });
		const response = await bootstrapOwnerHandler.fetch(
			buildRequest({ email: 'admin@example.com' }, { 'CF-Connecting-IP': '1.2.3.4' }),
			env,
		);
		expect(response.status).toBe(403);
		const body = (await response.json()) as { ok: boolean; error: { code: string } };
		expect(body.error.code).toBe('BOOTSTRAP_DISABLED');
		expect(await listInviteKeys(env)).toEqual([]);
		expect(sendInviteSpy).not.toHaveBeenCalled();
	});

	it('an OWNER already exists (ACTIVE) → 403 BOOTSTRAP_DISABLED; nothing created', async () => {
		const env = makeEnv({ ownerEmails: 'admin@example.com' });
		await createUser(env, await buildOwnerUser({ email: 'existing@example.com' }));
		const response = await bootstrapOwnerHandler.fetch(
			buildRequest({ email: 'admin@example.com' }, { 'CF-Connecting-IP': '1.2.3.4' }),
			env,
		);
		expect(response.status).toBe(403);
		const body = (await response.json()) as { ok: boolean; error: { code: string } };
		expect(body.error.code).toBe('BOOTSTRAP_DISABLED');
		expect(await listInviteKeys(env)).toEqual([]);
		expect(await readUser(env, 'admin@example.com')).toBeNull();
		expect(sendInviteSpy).not.toHaveBeenCalled();
	});

	it('email not in OWNER_EMAILS allowlist → 400 EMAIL_MISMATCH; nothing created', async () => {
		const env = makeEnv({ ownerEmails: 'admin@example.com' });
		const response = await bootstrapOwnerHandler.fetch(
			buildRequest({ email: 'attacker@example.com' }, { 'CF-Connecting-IP': '1.2.3.4' }),
			env,
		);
		expect(response.status).toBe(400);
		const body = (await response.json()) as { ok: boolean; error: { code: string } };
		expect(body.error.code).toBe('EMAIL_MISMATCH');
		expect(await listInviteKeys(env)).toEqual([]);
		expect(sendInviteSpy).not.toHaveBeenCalled();
	});

	it('comma-list matching: OWNER_EMAILS "a@x.com,b@x.com" + body "b@x.com" → 200', async () => {
		const env = makeEnv({ ownerEmails: 'a@x.com,b@x.com' });
		const response = await bootstrapOwnerHandler.fetch(buildRequest({ email: 'b@x.com' }, { 'CF-Connecting-IP': '1.2.3.4' }), env);
		expect(response.status).toBe(200);
		const body = (await response.json()) as { ok: boolean; data: { inviteEmailSent: boolean } };
		expect(body.data.inviteEmailSent).toBe(true);
		expect(sendInviteSpy).toHaveBeenCalledTimes(1);
	});

	it('comma-list rejection: OWNER_EMAILS "a@x.com,b@x.com" + body "c@x.com" → 400 EMAIL_MISMATCH', async () => {
		const env = makeEnv({ ownerEmails: 'a@x.com,b@x.com' });
		const response = await bootstrapOwnerHandler.fetch(buildRequest({ email: 'c@x.com' }, { 'CF-Connecting-IP': '1.2.3.4' }), env);
		expect(response.status).toBe(400);
		const body = (await response.json()) as { ok: boolean; error: { code: string } };
		expect(body.error.code).toBe('EMAIL_MISMATCH');
	});

	it('whitespace tolerance in OWNER_EMAILS', async () => {
		const env = makeEnv({ ownerEmails: '  a@x.com  ,  b@x.com  ' });
		const response = await bootstrapOwnerHandler.fetch(buildRequest({ email: 'a@x.com' }, { 'CF-Connecting-IP': '1.2.3.4' }), env);
		expect(response.status).toBe(200);
		expect(sendInviteSpy).toHaveBeenCalledTimes(1);
	});

	it('case-insensitive matching: OWNER_EMAILS "Admin@Example.com" + body "admin@example.com" → 200', async () => {
		const env = makeEnv({ ownerEmails: 'Admin@Example.com' });
		const response = await bootstrapOwnerHandler.fetch(
			buildRequest({ email: 'admin@example.com' }, { 'CF-Connecting-IP': '1.2.3.4' }),
			env,
		);
		expect(response.status).toBe(200);
		expect(sendInviteSpy).toHaveBeenCalledTimes(1);
	});

	it('idempotent re-trigger for existing INVITED OWNER: old invite killed, fresh invite minted, email re-sent', async () => {
		const env = makeEnv({ ownerEmails: 'admin@example.com' });
		const now = Date.now();
		await createUser(
			env,
			await buildOwnerUser({
				status: EUserStatus.INVITED,
				passwordHash: null,
			}),
		);
		const stale: IInvite = {
			schemaVersion: 1,
			token: 'stale-token-abcdef-1234567890',
			email: 'admin@example.com',
			role: EStaffRole.OWNER,
			displayName: 'Owner',
			invitedBy: 'system@bootstrap.local',
			createdAt: now - 60_000,
			expiresAt: now + INVITE_TTL_MS,
		};
		await createInvite(env, stale);
		expect(await listInviteKeys(env)).toEqual(['invite:stale-token-abcdef-1234567890']);

		const response = await bootstrapOwnerHandler.fetch(
			buildRequest({ email: 'admin@example.com' }, { 'CF-Connecting-IP': '1.2.3.4' }),
			env,
		);
		expect(response.status).toBe(200);
		const keys = await listInviteKeys(env);
		expect(keys.length).toBe(1);
		expect(keys).not.toContain('invite:stale-token-abcdef-1234567890');
		const fresh = await readInvite(env, keys[0]);
		expect(fresh!.token).not.toBe(stale.token);
		expect(fresh!.role).toBe(EStaffRole.OWNER);
		expect(sendInviteSpy).toHaveBeenCalledTimes(1);
		const [, sentInvite] = sendInviteSpy.mock.calls[0] as [Env, IInvite];
		expect(sentInvite.token).toBe(fresh!.token);
	});

	it('existing INVITED user with role != OWNER for target email → 400 EMAIL_MISMATCH (do not clobber)', async () => {
		const env = makeEnv({ ownerEmails: 'admin@example.com' });
		await createUser(
			env,
			await buildOwnerUser({
				role: EStaffRole.MANAGER,
				status: EUserStatus.INVITED,
				passwordHash: null,
			}),
		);
		const response = await bootstrapOwnerHandler.fetch(
			buildRequest({ email: 'admin@example.com' }, { 'CF-Connecting-IP': '1.2.3.4' }),
			env,
		);
		expect(response.status).toBe(400);
		const body = (await response.json()) as { ok: boolean; error: { code: string } };
		expect(body.error.code).toBe('EMAIL_MISMATCH');
		expect(await listInviteKeys(env)).toEqual([]);
		expect(sendInviteSpy).not.toHaveBeenCalled();
	});

	it('existing ACTIVE user with target email but role != OWNER → 403 BOOTSTRAP_DISABLED', async () => {
		const env = makeEnv({ ownerEmails: 'admin@example.com' });
		await createUser(
			env,
			await buildOwnerUser({
				role: EStaffRole.EMPLOYEE,
				status: EUserStatus.ACTIVE,
			}),
		);
		const response = await bootstrapOwnerHandler.fetch(
			buildRequest({ email: 'admin@example.com' }, { 'CF-Connecting-IP': '1.2.3.4' }),
			env,
		);
		expect(response.status).toBe(403);
		const body = (await response.json()) as { ok: boolean; error: { code: string } };
		expect(body.error.code).toBe('BOOTSTRAP_DISABLED');
		expect(await listInviteKeys(env)).toEqual([]);
		expect(sendInviteSpy).not.toHaveBeenCalled();
	});

	it('missing email field → 400 VALIDATION_FAILED with fields.email', async () => {
		const env = makeEnv({ ownerEmails: 'admin@example.com' });
		const response = await bootstrapOwnerHandler.fetch(buildRequest({}, { 'CF-Connecting-IP': '1.2.3.4' }), env);
		expect(response.status).toBe(400);
		const body = (await response.json()) as { ok: boolean; error: { code: string; fields: Record<string, unknown> } };
		expect(body.error.code).toBe('VALIDATION_FAILED');
		expect(body.error.fields.email).toBeDefined();
		expect(sendInviteSpy).not.toHaveBeenCalled();
	});

	it('empty-string email → 400 VALIDATION_FAILED', async () => {
		const env = makeEnv({ ownerEmails: 'admin@example.com' });
		const response = await bootstrapOwnerHandler.fetch(buildRequest({ email: '' }, { 'CF-Connecting-IP': '1.2.3.4' }), env);
		expect(response.status).toBe(400);
		const body = (await response.json()) as { ok: boolean; error: { code: string } };
		expect(body.error.code).toBe('VALIDATION_FAILED');
		expect(sendInviteSpy).not.toHaveBeenCalled();
	});

	it('rate limit exceeded → 429 RATE_LIMITED', async () => {
		const checkFn = vi.fn(async (key: string) => {
			if (key === 'auth:bootstrap-owner:1.2.3.4') {
				return { allowed: false, remaining: 0, resetTime: 555 };
			}
			return { allowed: true, remaining: 100, resetTime: 999 };
		});
		const mockDO = {
			idFromName: vi.fn().mockReturnValue('id-abc'),
			getByName: vi.fn().mockReturnValue({ check: checkFn }),
		};
		const env = makeEnv({ ownerEmails: 'admin@example.com', rateLimiter: mockDO });
		const response = await bootstrapOwnerHandler.fetch(
			buildRequest({ email: 'admin@example.com' }, { 'CF-Connecting-IP': '1.2.3.4' }),
			env,
		);
		expect(response.status).toBe(429);
		const body = (await response.json()) as { ok: boolean; error: { code: string; retryAfter?: number } };
		expect(body.error.code).toBe('RATE_LIMITED');
		expect(body.error.retryAfter).toBe(555);
		expect(await listInviteKeys(env)).toEqual([]);
		expect(sendInviteSpy).not.toHaveBeenCalled();
	});

	it('sendInvite failure → still 200 (invite is committed)', async () => {
		sendInviteSpy.mockRejectedValueOnce(new Error('SMTP boom'));
		const env = makeEnv({ ownerEmails: 'admin@example.com' });
		const response = await bootstrapOwnerHandler.fetch(
			buildRequest({ email: 'admin@example.com' }, { 'CF-Connecting-IP': '1.2.3.4' }),
			env,
		);
		expect(response.status).toBe(200);
		const body = (await response.json()) as { ok: boolean; data: { inviteEmailSent: boolean } };
		expect(body.data.inviteEmailSent).toBe(true);
		const keys = await listInviteKeys(env);
		expect(keys.length).toBe(1);
		expect(sendInviteSpy).toHaveBeenCalledTimes(1);
	});

	it('invalidateForEmail runs on the happy path (invariant: at most one live invite per email)', async () => {
		const invalidateSpy = vi.spyOn(inviteRepo, 'invalidateForEmail');
		const env = makeEnv({ ownerEmails: 'admin@example.com' });
		const response = await bootstrapOwnerHandler.fetch(
			buildRequest({ email: 'admin@example.com' }, { 'CF-Connecting-IP': '1.2.3.4' }),
			env,
		);
		expect(response.status).toBe(200);
		expect(invalidateSpy).toHaveBeenCalledTimes(1);
		const [, passedEmail] = invalidateSpy.mock.calls[0] as [Env, string];
		expect(passedEmail).toBe('admin@example.com');
	});
});
