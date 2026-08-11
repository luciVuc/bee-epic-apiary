import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EStaffRole, EUserStatus, type IInvite, type IUser, type IUserPublic } from '@bee-epic/shared';
import inviteUserHandler from '../../../src/auth/handlers/inviteUser';
import { createUser, getUser } from '../../../src/auth/repo/userRepo';
import { getInvite } from '../../../src/auth/repo/inviteRepo';
import { hashPassword } from '../../../src/auth/crypto/passwordHash';
import * as sendInviteModule from '../../../src/auth/emails/sendInvite';

/**
 * In-memory KV mock — same pattern as bootstrapOwner.spec.ts /
 * listUsers.spec.ts. Fresh per test.
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
	email?: unknown | null;
}

function makeEnv(overrides: ITestEnvOverrides = {}): Env {
	const env: Record<string, unknown> = {
		CONTENT_KV: makeKv(),
		ALLOWED_ORIGINS: 'https://admin.example.com',
		// Development so tests can authenticate via X-Dev-Email.
		ENVIRONMENT: 'development',
		JWT_SIGNING_SECRET: 'test-secret-value-abc-123',
		ADMIN_BASE_URL: 'https://admin.example.com',
		// OWNER_EMAILS bootstraps the owner caller without polluting the user
		// store — happy-path tests can assert on invitee-only KV state.
		OWNER_EMAILS: 'owner@example.com',
	};
	if (overrides.email === null) {
		// leave EMAIL undefined
	} else if (overrides.email !== undefined) {
		env.EMAIL = overrides.email;
	} else {
		env.EMAIL = { send: vi.fn().mockResolvedValue(undefined) };
	}
	if (overrides.rateLimiter !== undefined) {
		env.RATE_LIMITER = overrides.rateLimiter;
	}
	return env as unknown as Env;
}

/**
 * Seed users via `createUser` so `resolveCaller`'s dev-bypass path (which
 * resolves callers through `userRepo`) can map each X-Dev-Email to the
 * requested role. Owner-caller tests should NOT include the owner here —
 * they rely on the OWNER_EMAILS fallback (see makeEnv).
 */
async function seedUsers(env: Env, members: Array<{ email: string; role: EStaffRole }>): Promise<void> {
	const now = Date.now();
	for (const m of members) {
		await createUser(env, {
			schemaVersion: 1,
			email: m.email,
			displayName: m.email,
			role: m.role,
			status: EUserStatus.ACTIVE,
			passwordHash: null,
			createdAt: now,
			updatedAt: now,
			lastLoginAt: null,
			lastLoginIp: null,
		});
	}
}

interface IRequestOpts {
	devEmail?: string;
	method?: string;
	origin?: string;
	body?: unknown;
	rawBody?: string;
}

function buildRequest(opts: IRequestOpts = {}): Request {
	const headers: Record<string, string> = {
		Origin: opts.origin ?? 'https://admin.example.com',
		'Content-Type': 'application/json',
	};
	if (opts.devEmail) headers['X-Dev-Email'] = opts.devEmail;
	let body: BodyInit | undefined;
	if (opts.rawBody !== undefined) {
		body = opts.rawBody;
	} else if (opts.body !== undefined) {
		body = JSON.stringify(opts.body);
	}
	return new Request('https://admin.example.com/users/invite', {
		method: opts.method ?? 'POST',
		headers,
		body,
	});
}

async function buildUser(overrides: Partial<IUser> = {}): Promise<IUser> {
	const now = Date.now();
	const passwordHash =
		overrides.passwordHash === null ? null : (overrides.passwordHash ?? (await hashPassword('correct-horse-battery-staple')));
	return {
		schemaVersion: 1,
		email: 'user@example.com',
		displayName: 'User',
		role: EStaffRole.EMPLOYEE,
		status: EUserStatus.ACTIVE,
		passwordHash,
		createdAt: now,
		updatedAt: now,
		lastLoginAt: null,
		lastLoginIp: null,
		...overrides,
	};
}

async function listInviteKeys(env: Env): Promise<string[]> {
	const listing = await env.CONTENT_KV.list({ prefix: 'invite:' });
	return listing.keys.map((k) => k.name);
}

describe('inviteUser handler', () => {
	let sendInviteSpy: ReturnType<typeof vi.spyOn>;

	beforeEach(() => {
		vi.spyOn(console, 'warn').mockImplementation(() => undefined);
		vi.spyOn(console, 'error').mockImplementation(() => undefined);
		sendInviteSpy = vi.spyOn(sendInviteModule, 'sendInvite').mockResolvedValue(undefined);
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	describe('authorization', () => {
		it('anonymous request → 401 UNAUTHORIZED', async () => {
			const env = makeEnv();
			const response = await inviteUserHandler.fetch(
				buildRequest({ body: { email: 'alice@example.com', role: EStaffRole.EMPLOYEE } }),
				env,
			);
			expect(response.status).toBe(401);
			const body = (await response.json()) as { ok: boolean; error: { code: string } };
			expect(body.ok).toBe(false);
			expect(body.error.code).toBe('UNAUTHORIZED');
			expect(sendInviteSpy).not.toHaveBeenCalled();
		});

		it('VENDOR caller → 403 FORBIDDEN with requiredRole=OWNER', async () => {
			const env = makeEnv();
			await seedUsers(env, [{ email: 'vendor@example.com', role: EStaffRole.VENDOR }]);
			const response = await inviteUserHandler.fetch(
				buildRequest({
					devEmail: 'vendor@example.com',
					body: { email: 'alice@example.com', role: EStaffRole.EMPLOYEE },
				}),
				env,
			);
			expect(response.status).toBe(403);
			const body = (await response.json()) as {
				ok: boolean;
				error: { code: string; requiredRole: string };
			};
			expect(body.error.code).toBe('FORBIDDEN');
			expect(body.error.requiredRole).toBe(EStaffRole.OWNER);
			expect(sendInviteSpy).not.toHaveBeenCalled();
		});

		it('MANAGER caller → 403 FORBIDDEN with requiredRole=OWNER', async () => {
			const env = makeEnv();
			await seedUsers(env, [{ email: 'manager@example.com', role: EStaffRole.MANAGER }]);
			const response = await inviteUserHandler.fetch(
				buildRequest({
					devEmail: 'manager@example.com',
					body: { email: 'alice@example.com', role: EStaffRole.EMPLOYEE },
				}),
				env,
			);
			expect(response.status).toBe(403);
			const body = (await response.json()) as {
				ok: boolean;
				error: { code: string; requiredRole: string };
			};
			expect(body.error.code).toBe('FORBIDDEN');
			expect(body.error.requiredRole).toBe(EStaffRole.OWNER);
			expect(sendInviteSpy).not.toHaveBeenCalled();
		});

		it('EMPLOYEE caller → 403 FORBIDDEN with requiredRole=OWNER', async () => {
			const env = makeEnv();
			await seedUsers(env, [{ email: 'employee@example.com', role: EStaffRole.EMPLOYEE }]);
			const response = await inviteUserHandler.fetch(
				buildRequest({
					devEmail: 'employee@example.com',
					body: { email: 'alice@example.com', role: EStaffRole.EMPLOYEE },
				}),
				env,
			);
			expect(response.status).toBe(403);
			const body = (await response.json()) as {
				ok: boolean;
				error: { code: string; requiredRole: string };
			};
			expect(body.error.code).toBe('FORBIDDEN');
			expect(body.error.requiredRole).toBe(EStaffRole.OWNER);
			expect(sendInviteSpy).not.toHaveBeenCalled();
		});
	});

	describe('OWNER caller — happy paths', () => {
		it('valid body, new user → 201, creates INVITED user + invite in KV, sends email exactly once', async () => {
			const env = makeEnv();

			const response = await inviteUserHandler.fetch(
				buildRequest({
					devEmail: 'owner@example.com',
					body: {
						email: 'alice@example.com',
						role: EStaffRole.EMPLOYEE,
						displayName: 'Alice Adams',
					},
				}),
				env,
			);
			expect(response.status).toBe(201);
			const body = (await response.json()) as {
				ok: boolean;
				data: { user: IUserPublic; inviteSent: boolean };
			};
			expect(body.ok).toBe(true);
			expect(body.data.inviteSent).toBe(true);
			expect(body.data.user.email).toBe('alice@example.com');
			expect(body.data.user.role).toBe(EStaffRole.EMPLOYEE);
			expect(body.data.user.status).toBe(EUserStatus.INVITED);
			expect(body.data.user.displayName).toBe('Alice Adams');
			expect((body.data.user as unknown as Record<string, unknown>).passwordHash).toBeUndefined();

			// User record present in KV
			const persisted = await getUser(env, 'alice@example.com');
			expect(persisted).not.toBeNull();
			expect(persisted!.role).toBe(EStaffRole.EMPLOYEE);
			expect(persisted!.status).toBe(EUserStatus.INVITED);
			expect(persisted!.passwordHash).toBeNull();
			expect(persisted!.displayName).toBe('Alice Adams');

			// Invite record present in KV; token comes from the send call.
			expect(sendInviteSpy).toHaveBeenCalledTimes(1);
			const [, sentInvite] = sendInviteSpy.mock.calls[0] as [Env, IInvite];
			expect(sentInvite.email).toBe('alice@example.com');
			expect(sentInvite.role).toBe(EStaffRole.EMPLOYEE);
			expect(sentInvite.invitedBy).toBe('owner@example.com');

			const kvInvite = await getInvite(env, sentInvite.token);
			expect(kvInvite).not.toBeNull();
			expect(kvInvite!.token).toBe(sentInvite.token);
			expect(kvInvite!.email).toBe('alice@example.com');
		});

		it('OWNER, no displayName → 201, displayName defaults to local-part of email', async () => {
			const env = makeEnv();

			const response = await inviteUserHandler.fetch(
				buildRequest({
					devEmail: 'owner@example.com',
					body: { email: 'alice@example.com', role: EStaffRole.EMPLOYEE },
				}),
				env,
			);
			expect(response.status).toBe(201);
			const body = (await response.json()) as {
				ok: boolean;
				data: { user: IUserPublic; inviteSent: boolean };
			};
			expect(body.data.user.displayName).toBe('alice');

			const persisted = await getUser(env, 'alice@example.com');
			expect(persisted!.displayName).toBe('alice');
		});

		it('OWNER, env.EMAIL undefined → 201, no crash, inviteSent:true still (attempt-report semantics)', async () => {
			const env = makeEnv({ email: null });

			const response = await inviteUserHandler.fetch(
				buildRequest({
					devEmail: 'owner@example.com',
					body: { email: 'alice@example.com', role: EStaffRole.EMPLOYEE },
				}),
				env,
			);
			expect(response.status).toBe(201);
			const body = (await response.json()) as {
				ok: boolean;
				data: { user: IUserPublic; inviteSent: boolean };
			};
			expect(body.data.inviteSent).toBe(true);
			expect(sendInviteSpy).not.toHaveBeenCalled();

			// Invite still committed to KV even without an email send.
			const keys = await listInviteKeys(env);
			expect(keys.length).toBe(1);
		});

		it('OWNER, sendInvite throws → 201 still (fire-and-forget), invite persisted, console.error called', async () => {
			const env = makeEnv();
			sendInviteSpy.mockRejectedValueOnce(new Error('SMTP boom'));
			const errorSpy = vi.spyOn(console, 'error');

			const response = await inviteUserHandler.fetch(
				buildRequest({
					devEmail: 'owner@example.com',
					body: { email: 'alice@example.com', role: EStaffRole.EMPLOYEE },
				}),
				env,
			);
			expect(response.status).toBe(201);
			const body = (await response.json()) as {
				ok: boolean;
				data: { user: IUserPublic; inviteSent: boolean };
			};
			expect(body.data.inviteSent).toBe(true);
			expect(sendInviteSpy).toHaveBeenCalledTimes(1);

			// Invite still in KV.
			const keys = await listInviteKeys(env);
			expect(keys.length).toBe(1);

			// console.error was called with our prefix.
			expect(errorSpy).toHaveBeenCalled();
			const wasCalledWithOurPrefix = errorSpy.mock.calls.some((args) => typeof args[0] === 'string' && args[0].includes('[inviteUser]'));
			expect(wasCalledWithOurPrefix).toBe(true);
		});
	});

	describe('OWNER caller — error paths', () => {
		it('duplicate email (user already exists) → 409 USER_EXISTS; no new invite created', async () => {
			const env = makeEnv();
			await createUser(env, await buildUser({ email: 'alice@example.com', role: EStaffRole.EMPLOYEE }));
			const invitesBefore = await listInviteKeys(env);

			const response = await inviteUserHandler.fetch(
				buildRequest({
					devEmail: 'owner@example.com',
					body: { email: 'alice@example.com', role: EStaffRole.MANAGER },
				}),
				env,
			);
			expect(response.status).toBe(409);
			const body = (await response.json()) as { ok: boolean; error: { code: string } };
			expect(body.error.code).toBe('USER_EXISTS');

			// Invite list unchanged; sendInvite not called.
			const invitesAfter = await listInviteKeys(env);
			expect(invitesAfter).toEqual(invitesBefore);
			expect(sendInviteSpy).not.toHaveBeenCalled();
		});

		it('invalid role "ROOT" → 400 VALIDATION_FAILED with fields.role', async () => {
			const env = makeEnv();

			const response = await inviteUserHandler.fetch(
				buildRequest({
					devEmail: 'owner@example.com',
					body: { email: 'alice@example.com', role: 'ROOT' },
				}),
				env,
			);
			expect(response.status).toBe(400);
			const body = (await response.json()) as {
				ok: boolean;
				error: { code: string; fields: Record<string, string> };
			};
			expect(body.error.code).toBe('VALIDATION_FAILED');
			expect(body.error.fields.role).toBeDefined();
			expect(sendInviteSpy).not.toHaveBeenCalled();
		});

		it('missing email → 400 VALIDATION_FAILED', async () => {
			const env = makeEnv();

			const response = await inviteUserHandler.fetch(
				buildRequest({
					devEmail: 'owner@example.com',
					body: { role: EStaffRole.EMPLOYEE },
				}),
				env,
			);
			expect(response.status).toBe(400);
			const body = (await response.json()) as {
				ok: boolean;
				error: { code: string; fields: Record<string, string> };
			};
			expect(body.error.code).toBe('VALIDATION_FAILED');
			expect(body.error.fields.email).toBeDefined();
			expect(sendInviteSpy).not.toHaveBeenCalled();
		});

		it('missing role → 400 VALIDATION_FAILED', async () => {
			const env = makeEnv();

			const response = await inviteUserHandler.fetch(
				buildRequest({
					devEmail: 'owner@example.com',
					body: { email: 'alice@example.com' },
				}),
				env,
			);
			expect(response.status).toBe(400);
			const body = (await response.json()) as {
				ok: boolean;
				error: { code: string; fields: Record<string, string> };
			};
			expect(body.error.code).toBe('VALIDATION_FAILED');
			expect(body.error.fields.role).toBeDefined();
			expect(sendInviteSpy).not.toHaveBeenCalled();
		});

		it('non-JSON body → 400 VALIDATION_FAILED with fields.body="Invalid JSON"', async () => {
			const env = makeEnv();

			const response = await inviteUserHandler.fetch(
				buildRequest({
					devEmail: 'owner@example.com',
					rawBody: 'not-json{{{',
				}),
				env,
			);
			expect(response.status).toBe(400);
			const body = (await response.json()) as {
				ok: boolean;
				error: { code: string; fields: Record<string, string> };
			};
			expect(body.error.code).toBe('VALIDATION_FAILED');
			expect(body.error.fields.body).toBe('Invalid JSON');
			expect(sendInviteSpy).not.toHaveBeenCalled();
		});
	});

	describe('rate limiting', () => {
		it('rate-limit tripped → 429 RATE_LIMITED with retryAfter; bucket key is users:invite:<lowercased-owner-email>', async () => {
			const checkFn = vi.fn(async (key: string) => {
				if (key === 'users:invite:owner@example.com') {
					return { allowed: false, remaining: 0, resetTime: 3599 };
				}
				return { allowed: true, remaining: 30, resetTime: 3600 };
			});
			const mockDO = {
				idFromName: vi.fn().mockReturnValue('id-abc'),
				getByName: vi.fn().mockReturnValue({ check: checkFn }),
			};
			const env = makeEnv({ rateLimiter: mockDO });

			const response = await inviteUserHandler.fetch(
				buildRequest({
					devEmail: 'owner@example.com',
					body: { email: 'alice@example.com', role: EStaffRole.EMPLOYEE },
				}),
				env,
			);
			expect(response.status).toBe(429);
			const body = (await response.json()) as {
				ok: boolean;
				error: { code: string; retryAfter?: number };
			};
			expect(body.error.code).toBe('RATE_LIMITED');
			expect(body.error.retryAfter).toBe(3599);
			// Bucket key must have been called with the exact expected form.
			// The wrapper's generic rate-limit call also fires (with a different
			// key), so we assert via `.some(...)` rather than `.toHaveBeenCalledWith`
			// which requires exact positional args across all calls.
			const perOwnerCall = checkFn.mock.calls.find((args) => args[0] === 'users:invite:owner@example.com');
			expect(perOwnerCall).toBeDefined();
			expect(perOwnerCall![1]).toBe(30);
			expect(perOwnerCall![2]).toBe(60 * 60);
			// No side-effects.
			expect(sendInviteSpy).not.toHaveBeenCalled();
			expect(await listInviteKeys(env)).toEqual([]);
		});
	});

	describe('CORS', () => {
		it('OPTIONS /users/invite → 204 with expected preflight headers', async () => {
			const env = makeEnv();
			const response = await inviteUserHandler.fetch(
				new Request('https://admin.example.com/users/invite', {
					method: 'OPTIONS',
					headers: {
						Origin: 'https://admin.example.com',
						'Access-Control-Request-Method': 'POST',
						'Access-Control-Request-Headers': 'content-type',
					},
				}),
				env,
			);
			expect(response.status).toBe(204);
			expect(response.headers.get('Access-Control-Allow-Origin')).toBe('https://admin.example.com');
			const allowMethods = response.headers.get('Access-Control-Allow-Methods') ?? '';
			expect(allowMethods).toContain('POST');
			expect(allowMethods).toContain('OPTIONS');
		});
	});
});
