import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EStaffRole, EUserStatus, type IInvite, type IUser } from '@bee-epic/shared';
import reinviteUserHandler from '../../../src/auth/handlers/reinviteUser';
import { createUser } from '../../../src/auth/repo/userRepo';
import { createInvite, getInvite } from '../../../src/auth/repo/inviteRepo';
import { hashPassword } from '../../../src/auth/crypto/passwordHash';
import * as sendInviteModule from '../../../src/auth/emails/sendInvite';

/**
 * In-memory KV mock — same pattern as inviteUser.spec.ts / deleteUser.spec.ts.
 * Fresh per test.
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
		list: vi.fn(async ({ prefix, cursor }: { prefix: string; cursor?: string }) => {
			void cursor;
			const all = [...store.keys()].filter((k) => k.startsWith(prefix)).map((name) => ({ name }));
			return { keys: all, list_complete: true, cursor: undefined };
		}),
	} as unknown as KVNamespace;
}

interface ITestEnvOverrides {
	email?: unknown | null;
}

function makeEnv(overrides: ITestEnvOverrides = {}): Env {
	const env: Record<string, unknown> = {
		CONTENT_KV: makeKv(),
		ALLOWED_ORIGINS: 'https://admin.example.com',
		ENVIRONMENT: 'development',
		JWT_SIGNING_SECRET: 'test-secret-value-abc-123',
		ADMIN_BASE_URL: 'https://admin.example.com',
		// OWNER_EMAILS bootstraps the owner caller without polluting the user
		// store — happy-path tests can assert on target-only KV state.
		OWNER_EMAILS: 'owner@example.com',
	};
	if (overrides.email === null) {
		// leave EMAIL undefined
	} else if (overrides.email !== undefined) {
		env.EMAIL = overrides.email;
	} else {
		env.EMAIL = { send: vi.fn().mockResolvedValue(undefined) };
	}
	return env as unknown as Env;
}

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
	pathEmail?: string; // last URL segment before /reinvite (may be URL-encoded)
	rawBody?: string;
	body?: unknown;
}

function buildRequest(opts: IRequestOpts = {}): Request {
	const headers: Record<string, string> = {
		Origin: opts.origin ?? 'https://admin.example.com',
	};
	if (opts.devEmail) headers['X-Dev-Email'] = opts.devEmail;
	let body: BodyInit | undefined;
	if (opts.rawBody !== undefined) {
		body = opts.rawBody;
		headers['Content-Type'] = 'application/json';
	} else if (opts.body !== undefined) {
		body = JSON.stringify(opts.body);
		headers['Content-Type'] = 'application/json';
	}
	const path = opts.pathEmail ?? 'target@example.com';
	return new Request(`https://admin.example.com/users/${path}/reinvite`, {
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

async function readAllInvites(env: Env): Promise<IInvite[]> {
	const keys = await listInviteKeys(env);
	const out: IInvite[] = [];
	for (const key of keys) {
		const raw = await env.CONTENT_KV.get(key);
		if (raw) out.push(JSON.parse(raw) as IInvite);
	}
	return out;
}

describe('reinviteUser handler', () => {
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
			const response = await reinviteUserHandler.fetch(buildRequest(), env);
			expect(response.status).toBe(401);
			const body = (await response.json()) as { ok: boolean; error: { code: string } };
			expect(body.ok).toBe(false);
			expect(body.error.code).toBe('UNAUTHORIZED');
			expect(sendInviteSpy).not.toHaveBeenCalled();
		});

		it('VENDOR caller → 403 FORBIDDEN with requiredRole=OWNER', async () => {
			const env = makeEnv();
			await seedUsers(env, [{ email: 'vendor@example.com', role: EStaffRole.VENDOR }]);
			const response = await reinviteUserHandler.fetch(buildRequest({ devEmail: 'vendor@example.com' }), env);
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
			const response = await reinviteUserHandler.fetch(buildRequest({ devEmail: 'manager@example.com' }), env);
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
			const response = await reinviteUserHandler.fetch(buildRequest({ devEmail: 'employee@example.com' }), env);
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

	describe('OWNER caller — guards', () => {
		it('non-existent target → 404 USER_NOT_FOUND', async () => {
			const env = makeEnv();
			await createUser(env, await buildUser({ email: 'owner@example.com', role: EStaffRole.OWNER }));
			const response = await reinviteUserHandler.fetch(
				buildRequest({
					devEmail: 'owner@example.com',
					pathEmail: 'ghost@example.com',
				}),
				env,
			);
			expect(response.status).toBe(404);
			const body = (await response.json()) as { ok: boolean; error: { code: string } };
			expect(body.error.code).toBe('USER_NOT_FOUND');
			expect(sendInviteSpy).not.toHaveBeenCalled();
		});

		it('ACTIVE target → 409 USER_ALREADY_ACTIVE; no new invite, no email', async () => {
			const env = makeEnv();
			await createUser(env, await buildUser({ email: 'owner@example.com', role: EStaffRole.OWNER }));
			await createUser(
				env,
				await buildUser({
					email: 'active@example.com',
					role: EStaffRole.EMPLOYEE,
					status: EUserStatus.ACTIVE,
				}),
			);
			const response = await reinviteUserHandler.fetch(
				buildRequest({
					devEmail: 'owner@example.com',
					pathEmail: 'active@example.com',
				}),
				env,
			);
			expect(response.status).toBe(409);
			const body = (await response.json()) as { ok: boolean; error: { code: string } };
			expect(body.error.code).toBe('USER_ALREADY_ACTIVE');
			expect(await listInviteKeys(env)).toEqual([]);
			expect(sendInviteSpy).not.toHaveBeenCalled();
		});

		it('DISABLED target → 409 USER_ALREADY_ACTIVE (widened semantics); no new invite, no email', async () => {
			const env = makeEnv();
			await createUser(env, await buildUser({ email: 'owner@example.com', role: EStaffRole.OWNER }));
			await createUser(
				env,
				await buildUser({
					email: 'disabled@example.com',
					role: EStaffRole.EMPLOYEE,
					status: EUserStatus.DISABLED,
				}),
			);
			const response = await reinviteUserHandler.fetch(
				buildRequest({
					devEmail: 'owner@example.com',
					pathEmail: 'disabled@example.com',
				}),
				env,
			);
			expect(response.status).toBe(409);
			const body = (await response.json()) as { ok: boolean; error: { code: string } };
			expect(body.error.code).toBe('USER_ALREADY_ACTIVE');
			expect(await listInviteKeys(env)).toEqual([]);
			expect(sendInviteSpy).not.toHaveBeenCalled();
		});
	});

	describe('OWNER caller — happy paths', () => {
		it('INVITED target, no prior invites → 200 {inviteSent:true}, new invite in KV, email sent once, invitedBy=caller.email', async () => {
			const env = makeEnv();
			await createUser(
				env,
				await buildUser({
					email: 'owner@example.com',
					role: EStaffRole.OWNER,
				}),
			);
			await createUser(
				env,
				await buildUser({
					email: 'invited@example.com',
					role: EStaffRole.MANAGER,
					status: EUserStatus.INVITED,
					displayName: 'Invited Person',
					passwordHash: null,
				}),
			);

			const response = await reinviteUserHandler.fetch(
				buildRequest({
					devEmail: 'owner@example.com',
					pathEmail: 'invited@example.com',
				}),
				env,
			);
			expect(response.status).toBe(200);
			const body = (await response.json()) as {
				ok: boolean;
				data: { inviteSent: boolean };
			};
			expect(body.ok).toBe(true);
			expect(body.data.inviteSent).toBe(true);

			// New invite in KV, matching target attributes.
			const invites = await readAllInvites(env);
			expect(invites.length).toBe(1);
			expect(invites[0].email).toBe('invited@example.com');
			expect(invites[0].role).toBe(EStaffRole.MANAGER);
			expect(invites[0].displayName).toBe('Invited Person');
			expect(invites[0].invitedBy).toBe('owner@example.com');

			// Email sent exactly once with the fresh invite.
			expect(sendInviteSpy).toHaveBeenCalledTimes(1);
			const [, sentInvite] = sendInviteSpy.mock.calls[0] as [Env, IInvite];
			expect(sentInvite.token).toBe(invites[0].token);
		});

		it('INVITED target with 2 prior invites for same email → old ones cleared, exactly 1 new invite exists, new token differs', async () => {
			const env = makeEnv();
			await createUser(env, await buildUser({ email: 'owner@example.com', role: EStaffRole.OWNER }));
			await createUser(
				env,
				await buildUser({
					email: 'invited@example.com',
					role: EStaffRole.EMPLOYEE,
					status: EUserStatus.INVITED,
					passwordHash: null,
				}),
			);

			// Pre-seed two live invites for the same email.
			const now = Date.now();
			const oldTokens = ['old-token-one', 'old-token-two'];
			for (const token of oldTokens) {
				await createInvite(env, {
					schemaVersion: 1,
					token,
					email: 'invited@example.com',
					role: EStaffRole.EMPLOYEE,
					displayName: 'Invited Person',
					invitedBy: 'owner@example.com',
					createdAt: now,
					expiresAt: now + 24 * 60 * 60 * 1000,
				});
			}
			// Sanity — two invites exist and are readable.
			expect(await listInviteKeys(env)).toHaveLength(2);
			expect(await getInvite(env, 'old-token-one')).not.toBeNull();
			expect(await getInvite(env, 'old-token-two')).not.toBeNull();

			const response = await reinviteUserHandler.fetch(
				buildRequest({
					devEmail: 'owner@example.com',
					pathEmail: 'invited@example.com',
				}),
				env,
			);
			expect(response.status).toBe(200);

			// Old invites are gone; exactly one new invite exists.
			expect(await getInvite(env, 'old-token-one')).toBeNull();
			expect(await getInvite(env, 'old-token-two')).toBeNull();
			const invitesAfter = await readAllInvites(env);
			expect(invitesAfter.length).toBe(1);
			expect(oldTokens).not.toContain(invitesAfter[0].token);
			expect(invitesAfter[0].email).toBe('invited@example.com');
		});

		it('env.EMAIL unbound → still 200 with inviteSent:true, invite persisted, sendInvite never called', async () => {
			const env = makeEnv({ email: null });
			await createUser(env, await buildUser({ email: 'owner@example.com', role: EStaffRole.OWNER }));
			await createUser(
				env,
				await buildUser({
					email: 'invited@example.com',
					role: EStaffRole.EMPLOYEE,
					status: EUserStatus.INVITED,
					passwordHash: null,
				}),
			);

			const response = await reinviteUserHandler.fetch(
				buildRequest({
					devEmail: 'owner@example.com',
					pathEmail: 'invited@example.com',
				}),
				env,
			);
			expect(response.status).toBe(200);
			const body = (await response.json()) as {
				ok: boolean;
				data: { inviteSent: boolean };
			};
			expect(body.data.inviteSent).toBe(true);
			expect(sendInviteSpy).not.toHaveBeenCalled();
			expect((await readAllInvites(env)).length).toBe(1);
		});

		it('sendInvite throws → still 200, invite persisted, console.error called with [reinviteUser]', async () => {
			const env = makeEnv();
			await createUser(env, await buildUser({ email: 'owner@example.com', role: EStaffRole.OWNER }));
			await createUser(
				env,
				await buildUser({
					email: 'invited@example.com',
					role: EStaffRole.EMPLOYEE,
					status: EUserStatus.INVITED,
					passwordHash: null,
				}),
			);
			sendInviteSpy.mockRejectedValueOnce(new Error('SMTP boom'));
			const errorSpy = vi.spyOn(console, 'error');

			const response = await reinviteUserHandler.fetch(
				buildRequest({
					devEmail: 'owner@example.com',
					pathEmail: 'invited@example.com',
				}),
				env,
			);
			expect(response.status).toBe(200);
			const body = (await response.json()) as {
				ok: boolean;
				data: { inviteSent: boolean };
			};
			expect(body.data.inviteSent).toBe(true);
			expect((await readAllInvites(env)).length).toBe(1);
			const wasCalledWithOurPrefix = errorSpy.mock.calls.some((args) => typeof args[0] === 'string' && args[0].includes('[reinviteUser]'));
			expect(wasCalledWithOurPrefix).toBe(true);
		});

		it('invalidateForEmail throws (scoped to invite-list KV.list) → still 200, new invite minted, console.error called', async () => {
			const env = makeEnv();
			await createUser(env, await buildUser({ email: 'owner@example.com', role: EStaffRole.OWNER }));
			await createUser(
				env,
				await buildUser({
					email: 'invited@example.com',
					role: EStaffRole.EMPLOYEE,
					status: EUserStatus.INVITED,
					passwordHash: null,
				}),
			);

			// Scope the failure to KV.list under the `invite:` prefix only, so
			// other prefixes (user index, staff) keep working normally.
			const originalList = env.CONTENT_KV.list.bind(env.CONTENT_KV);
			(env.CONTENT_KV as unknown as { list: unknown }).list = vi.fn(async (args: { prefix: string; cursor?: string }) => {
				if (args.prefix.startsWith('invite:')) {
					throw new Error('kv-list-boom');
				}
				return originalList(args);
			});
			const errorSpy = vi.spyOn(console, 'error');

			const response = await reinviteUserHandler.fetch(
				buildRequest({
					devEmail: 'owner@example.com',
					pathEmail: 'invited@example.com',
				}),
				env,
			);
			expect(response.status).toBe(200);
			const body = (await response.json()) as {
				ok: boolean;
				data: { inviteSent: boolean };
			};
			expect(body.data.inviteSent).toBe(true);

			// Restore KV.list so we can verify the new invite record exists.
			// The failure was scoped to invalidateForEmail; createInvite uses
			// KV.put, not KV.list, so the new invite was still written.
			(env.CONTENT_KV as unknown as { list: typeof originalList }).list = originalList;
			expect((await readAllInvites(env)).length).toBeGreaterThanOrEqual(1);
			// console.error with our prefix.
			const wasCalledWithOurPrefix = errorSpy.mock.calls.some((args) => typeof args[0] === 'string' && args[0].includes('[reinviteUser]'));
			expect(wasCalledWithOurPrefix).toBe(true);
		});
	});

	describe('URL-encoded email in path', () => {
		it('/users/bob%40example.com/reinvite → decoded, hits bob@example.com', async () => {
			const env = makeEnv();
			await createUser(env, await buildUser({ email: 'owner@example.com', role: EStaffRole.OWNER }));
			await createUser(
				env,
				await buildUser({
					email: 'bob@example.com',
					role: EStaffRole.EMPLOYEE,
					status: EUserStatus.INVITED,
					passwordHash: null,
				}),
			);

			const response = await reinviteUserHandler.fetch(
				buildRequest({
					devEmail: 'owner@example.com',
					pathEmail: 'bob%40example.com',
				}),
				env,
			);
			expect(response.status).toBe(200);
			const invites = await readAllInvites(env);
			expect(invites.length).toBe(1);
			expect(invites[0].email).toBe('bob@example.com');
		});
	});

	describe('CORS', () => {
		it('OPTIONS /users/:email/reinvite → 204 with POST + OPTIONS in allow-methods', async () => {
			const env = makeEnv();
			const response = await reinviteUserHandler.fetch(
				new Request('https://admin.example.com/users/target@example.com/reinvite', {
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
