import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EStaffRole, EUserStatus, type IInvite, type IPasswordReset, type IRefreshFamily, type IUser } from '@bee-epic/shared';
import deleteUserHandler from '../../../src/auth/handlers/deleteUser';
import { createUser, getUser } from '../../../src/auth/repo/userRepo';
import { createInvite, getInvite } from '../../../src/auth/repo/inviteRepo';
import { createFamily, listForEmail } from '../../../src/auth/repo/refreshFamilyRepo';
import { createReset, getReset } from '../../../src/auth/repo/resetRepo';
import { hashPassword } from '../../../src/auth/crypto/passwordHash';

/**
 * In-memory KV mock — same shape used across Phase 8 handler specs.
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

function makeEnv(): Env {
	return {
		CONTENT_KV: makeKv(),
		ALLOWED_ORIGINS: 'https://admin.example.com',
		ENVIRONMENT: 'development',
		JWT_SIGNING_SECRET: 'test-secret-value-abc-123',
		ADMIN_BASE_URL: 'https://admin.example.com',
		// OWNER_EMAILS bootstraps owner-a as an OWNER caller without polluting
		// the user store — tests that createUser owner-a explicitly still work.
		OWNER_EMAILS: 'owner-a@example.com',
	} as unknown as Env;
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
	pathEmail?: string; // last URL segment (may be URL-encoded)
}

function buildRequest(opts: IRequestOpts = {}): Request {
	const headers: Record<string, string> = {
		Origin: opts.origin ?? 'https://admin.example.com',
	};
	if (opts.devEmail) headers['X-Dev-Email'] = opts.devEmail;
	const path = opts.pathEmail ?? 'target@example.com';
	return new Request(`https://admin.example.com/users/${path}`, {
		method: opts.method ?? 'DELETE',
		headers,
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

describe('deleteUser handler', () => {
	beforeEach(() => {
		vi.spyOn(console, 'warn').mockImplementation(() => undefined);
		vi.spyOn(console, 'error').mockImplementation(() => undefined);
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	describe('authorization', () => {
		it('anonymous request → 401 UNAUTHORIZED', async () => {
			const env = makeEnv();
			const response = await deleteUserHandler.fetch(buildRequest({ pathEmail: 'target@example.com' }), env);
			expect(response.status).toBe(401);
			const body = (await response.json()) as { ok: boolean; error: { code: string } };
			expect(body.ok).toBe(false);
			expect(body.error.code).toBe('UNAUTHORIZED');
		});

		it('VENDOR caller → 403 FORBIDDEN with requiredRole=OWNER', async () => {
			const env = makeEnv();
			await seedUsers(env, [{ email: 'vendor@example.com', role: EStaffRole.VENDOR }]);
			const response = await deleteUserHandler.fetch(buildRequest({ devEmail: 'vendor@example.com' }), env);
			expect(response.status).toBe(403);
			const body = (await response.json()) as {
				ok: boolean;
				error: { code: string; requiredRole: string };
			};
			expect(body.error.code).toBe('FORBIDDEN');
			expect(body.error.requiredRole).toBe(EStaffRole.OWNER);
		});

		it('MANAGER caller → 403 FORBIDDEN with requiredRole=OWNER', async () => {
			const env = makeEnv();
			await seedUsers(env, [{ email: 'manager@example.com', role: EStaffRole.MANAGER }]);
			const response = await deleteUserHandler.fetch(buildRequest({ devEmail: 'manager@example.com' }), env);
			expect(response.status).toBe(403);
			const body = (await response.json()) as {
				ok: boolean;
				error: { code: string; requiredRole: string };
			};
			expect(body.error.code).toBe('FORBIDDEN');
			expect(body.error.requiredRole).toBe(EStaffRole.OWNER);
		});

		it('EMPLOYEE caller → 403 FORBIDDEN with requiredRole=OWNER', async () => {
			const env = makeEnv();
			await seedUsers(env, [{ email: 'employee@example.com', role: EStaffRole.EMPLOYEE }]);
			const response = await deleteUserHandler.fetch(buildRequest({ devEmail: 'employee@example.com' }), env);
			expect(response.status).toBe(403);
			const body = (await response.json()) as {
				ok: boolean;
				error: { code: string; requiredRole: string };
			};
			expect(body.error.code).toBe('FORBIDDEN');
			expect(body.error.requiredRole).toBe(EStaffRole.OWNER);
		});
	});

	describe('OWNER caller — guards', () => {
		it('non-existent target → 404 USER_NOT_FOUND', async () => {
			const env = makeEnv();
			await createUser(env, await buildUser({ email: 'owner@example.com', role: EStaffRole.OWNER }));

			const response = await deleteUserHandler.fetch(
				buildRequest({
					devEmail: 'owner@example.com',
					pathEmail: 'ghost@example.com',
				}),
				env,
			);
			expect(response.status).toBe(404);
			const body = (await response.json()) as { ok: boolean; error: { code: string } };
			expect(body.error.code).toBe('USER_NOT_FOUND');
		});

		it('self-delete (caller === target) → 400 CANNOT_DELETE_SELF', async () => {
			// Two OWNERs so the last-OWNER guard is NOT the reason. This confirms
			// self-delete fires before last-OWNER in the order.
			const env = makeEnv();
			await createUser(env, await buildUser({ email: 'owner-a@example.com', role: EStaffRole.OWNER }));
			await createUser(env, await buildUser({ email: 'owner-b@example.com', role: EStaffRole.OWNER }));

			const response = await deleteUserHandler.fetch(
				buildRequest({
					devEmail: 'owner-a@example.com',
					pathEmail: 'owner-a@example.com',
				}),
				env,
			);
			expect(response.status).toBe(400);
			const body = (await response.json()) as { ok: boolean; error: { code: string } };
			expect(body.error.code).toBe('CANNOT_DELETE_SELF');
			// A still present.
			expect(await getUser(env, 'owner-a@example.com')).not.toBeNull();
		});

		it('last-OWNER delete: caller A (OWNER_EMAILS bootstrap only, no user record), target B is sole ACTIVE OWNER → 400 CANNOT_DELETE_LAST_OWNER', async () => {
			// Reachability of guard 3 (last-OWNER) requires caller.email !== target.email.
			// Under the Phase 9 trust chain, DISABLED users cannot authenticate,
			// so the previous "caller DISABLED in user record but present in staff"
			// scenario no longer applies. Instead we exploit the OWNER_EMAILS
			// bootstrap fallback: owner-a has no user record but resolves as
			// OWNER via env.OWNER_EMAILS, so caller.email is 'owner-a@example.com'
			// while the sole ACTIVE OWNER in the store is B.
			const env = makeEnv();
			await createUser(
				env,
				await buildUser({
					email: 'owner-b@example.com',
					role: EStaffRole.OWNER,
					status: EUserStatus.ACTIVE,
				}),
			);

			const response = await deleteUserHandler.fetch(
				buildRequest({
					devEmail: 'owner-a@example.com',
					pathEmail: 'owner-b@example.com',
				}),
				env,
			);
			expect(response.status).toBe(400);
			const body = (await response.json()) as { ok: boolean; error: { code: string } };
			expect(body.error.code).toBe('CANNOT_DELETE_LAST_OWNER');
			// B still present.
			expect(await getUser(env, 'owner-b@example.com')).not.toBeNull();
		});
	});

	describe('OWNER caller — happy paths', () => {
		it('two OWNERs; A deletes B → 204, B gone from KV', async () => {
			const env = makeEnv();
			await createUser(env, await buildUser({ email: 'owner-a@example.com', role: EStaffRole.OWNER }));
			await createUser(env, await buildUser({ email: 'owner-b@example.com', role: EStaffRole.OWNER }));

			const response = await deleteUserHandler.fetch(
				buildRequest({
					devEmail: 'owner-a@example.com',
					pathEmail: 'owner-b@example.com',
				}),
				env,
			);
			expect(response.status).toBe(204);
			// 204 = no body per jsonResponse.
			expect(await response.text()).toBe('');
			expect(await getUser(env, 'owner-b@example.com')).toBeNull();
			// A untouched.
			expect(await getUser(env, 'owner-a@example.com')).not.toBeNull();
		});

		it('OWNER deletes MANAGER with no side-effect artifacts → 204, user gone, CONTENT_KV.delete called for user:<email>', async () => {
			const env = makeEnv();
			await createUser(env, await buildUser({ email: 'owner@example.com', role: EStaffRole.OWNER }));
			await createUser(env, await buildUser({ email: 'manager@example.com', role: EStaffRole.MANAGER }));

			const deleteSpy = env.CONTENT_KV.delete as unknown as ReturnType<typeof vi.fn>;
			// Reset counters — createUser didn't touch delete but we want a clean
			// call log for the assertion below.
			deleteSpy.mockClear();

			const response = await deleteUserHandler.fetch(
				buildRequest({
					devEmail: 'owner@example.com',
					pathEmail: 'manager@example.com',
				}),
				env,
			);
			expect(response.status).toBe(204);
			expect(await getUser(env, 'manager@example.com')).toBeNull();
			// The user record key must have been deleted.
			const deletedKeys = deleteSpy.mock.calls.map((c) => c[0] as string);
			expect(deletedKeys).toContain('user:manager@example.com');
		});

		it('OWNER deletes MANAGER with pre-seeded refresh family + invite + reset → 204, all three artifacts gone', async () => {
			const env = makeEnv();
			await createUser(env, await buildUser({ email: 'owner@example.com', role: EStaffRole.OWNER }));
			await createUser(env, await buildUser({ email: 'manager@example.com', role: EStaffRole.MANAGER }));

			const now = Date.now();
			const family: IRefreshFamily = {
				schemaVersion: 1,
				familyId: 'family-abc',
				email: 'manager@example.com',
				currentJti: 'jti-1',
				createdAt: now,
				lastRefreshedAt: now,
				expiresAt: now + 30 * 24 * 60 * 60 * 1000,
				userAgent: null,
				ip: null,
			};
			await createFamily(env, family);

			const invite: IInvite = {
				schemaVersion: 1,
				token: 'invite-token-xyz',
				email: 'manager@example.com',
				role: EStaffRole.MANAGER,
				displayName: 'Manager',
				invitedBy: 'owner@example.com',
				createdAt: now,
				expiresAt: now + 24 * 60 * 60 * 1000,
			};
			await createInvite(env, invite);

			const reset: IPasswordReset = {
				schemaVersion: 1,
				token: 'reset-token-xyz',
				email: 'manager@example.com',
				createdAt: now,
				expiresAt: now + 60 * 60 * 1000,
			};
			await createReset(env, reset);

			// Sanity — artifacts exist.
			expect((await listForEmail(env, 'manager@example.com')).length).toBe(1);
			expect(await getInvite(env, 'invite-token-xyz')).not.toBeNull();
			expect(await getReset(env, 'reset-token-xyz')).not.toBeNull();

			const response = await deleteUserHandler.fetch(
				buildRequest({
					devEmail: 'owner@example.com',
					pathEmail: 'manager@example.com',
				}),
				env,
			);
			expect(response.status).toBe(204);

			// User gone.
			expect(await getUser(env, 'manager@example.com')).toBeNull();
			// Refresh family gone.
			expect((await listForEmail(env, 'manager@example.com')).length).toBe(0);
			// Invite gone.
			expect(await getInvite(env, 'invite-token-xyz')).toBeNull();
			// Reset gone.
			expect(await getReset(env, 'reset-token-xyz')).toBeNull();
		});
	});

	describe('OWNER caller — side-effect resilience', () => {
		it('refresh-family cleanup throws → still 204, user record still deleted, console.error called', async () => {
			const env = makeEnv();
			await createUser(env, await buildUser({ email: 'owner@example.com', role: EStaffRole.OWNER }));
			await createUser(env, await buildUser({ email: 'manager@example.com', role: EStaffRole.MANAGER }));

			// Make KV.list throw ONLY when listing under the refresh-family
			// prefix (which is `refresh:<email>:` per emailPrefix in
			// refreshFamilyRepo). Other prefixes (invites, resets, user index)
			// still work so those side effects run normally.
			const originalList = env.CONTENT_KV.list.bind(env.CONTENT_KV);
			(env.CONTENT_KV as unknown as { list: unknown }).list = vi.fn(async (args: { prefix: string; cursor?: string }) => {
				if (args.prefix.startsWith('refresh:')) {
					throw new Error('kv-list-boom');
				}
				return originalList(args);
			});
			const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

			const response = await deleteUserHandler.fetch(
				buildRequest({
					devEmail: 'owner@example.com',
					pathEmail: 'manager@example.com',
				}),
				env,
			);
			expect(response.status).toBe(204);
			// User record still gone.
			expect(await getUser(env, 'manager@example.com')).toBeNull();
			// A [deleteUser]-scoped console.error was emitted.
			const emitted = errorSpy.mock.calls.map((c) => String(c[0]));
			expect(emitted.some((m) => m.includes('[deleteUser]'))).toBe(true);
		});

		it('userRepo.deleteUser throws → 500 INTERNAL (wrapper catches)', async () => {
			const env = makeEnv();
			await createUser(env, await buildUser({ email: 'owner@example.com', role: EStaffRole.OWNER }));
			await createUser(env, await buildUser({ email: 'manager@example.com', role: EStaffRole.MANAGER }));

			// Force env.CONTENT_KV.delete to throw for the user record key. The
			// side-effect helpers use KV.delete on OTHER keys — those must still
			// work — so we scope the failure to the exact key we care about.
			const originalDelete = env.CONTENT_KV.delete.bind(env.CONTENT_KV);
			(env.CONTENT_KV as unknown as { delete: unknown }).delete = vi.fn(async (key: string) => {
				if (key === 'user:manager@example.com') {
					throw new Error('kv-delete-boom');
				}
				return originalDelete(key);
			});

			const response = await deleteUserHandler.fetch(
				buildRequest({
					devEmail: 'owner@example.com',
					pathEmail: 'manager@example.com',
				}),
				env,
			);
			expect(response.status).toBe(500);
			const body = (await response.json()) as { ok: boolean; error: { code: string } };
			expect(body.error.code).toBe('INTERNAL');
		});
	});

	describe('URL-encoded email in path', () => {
		it('/users/bob%40example.com resolves to bob@example.com', async () => {
			const env = makeEnv();
			await createUser(env, await buildUser({ email: 'owner@example.com', role: EStaffRole.OWNER }));
			await createUser(env, await buildUser({ email: 'bob@example.com' }));

			const response = await deleteUserHandler.fetch(
				buildRequest({
					devEmail: 'owner@example.com',
					pathEmail: 'bob%40example.com',
				}),
				env,
			);
			expect(response.status).toBe(204);
			expect(await getUser(env, 'bob@example.com')).toBeNull();
		});
	});

	describe('CORS', () => {
		it('OPTIONS /users/:email → 204 with DELETE + OPTIONS in allow-methods', async () => {
			const env = makeEnv();
			const response = await deleteUserHandler.fetch(
				new Request('https://admin.example.com/users/target@example.com', {
					method: 'OPTIONS',
					headers: {
						Origin: 'https://admin.example.com',
						'Access-Control-Request-Method': 'DELETE',
						'Access-Control-Request-Headers': 'content-type',
					},
				}),
				env,
			);
			expect(response.status).toBe(204);
			expect(response.headers.get('Access-Control-Allow-Origin')).toBe('https://admin.example.com');
			const allowMethods = response.headers.get('Access-Control-Allow-Methods') ?? '';
			expect(allowMethods).toContain('DELETE');
			expect(allowMethods).toContain('OPTIONS');
		});
	});
});
