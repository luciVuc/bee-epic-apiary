import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EStaffRole, EUserStatus, type IUser, type IUserPublic } from '@bee-epic/shared';
import listUsersHandler from '../../../src/auth/handlers/listUsers';
import { createUser } from '../../../src/auth/repo/userRepo';
import { hashPassword } from '../../../src/auth/crypto/passwordHash';

/**
 * In-memory KV mock — same pattern as bootstrapOwner.spec.ts. Fresh per test.
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

function makeEnv(overrides: Partial<Env> = {}): Env {
	return {
		CONTENT_KV: makeKv(),
		ALLOWED_ORIGINS: 'https://admin.example.com',
		// Development so tests can authenticate via X-Dev-Email. The Phase 9
		// bea_at cookie trust-chain lands later; for Phase 8 we exercise the
		// caller-resolution path that resolveCaller already supports.
		ENVIRONMENT: 'development',
		JWT_SIGNING_SECRET: 'test-secret-value-abc-123',
		ADMIN_BASE_URL: 'https://admin.example.com',
		// OWNER_EMAILS lets the "owner@example.com" X-Dev-Email resolve as
		// OWNER via the bootstrap-fallback path, WITHOUT adding the owner to
		// the user store — so happy-path tests can assert on the store
		// contents without the owner polluting expectations.
		OWNER_EMAILS: 'owner@example.com',
		...overrides,
	} as unknown as Env;
}

/**
 * Seed users via `createUser` so `resolveCaller`'s dev-bypass path (which
 * resolves callers through `userRepo`) can map each X-Dev-Email to the
 * requested role.
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
}

function buildRequest(opts: IRequestOpts = {}): Request {
	const headers: Record<string, string> = {
		Origin: opts.origin ?? 'https://admin.example.com',
	};
	if (opts.devEmail) headers['X-Dev-Email'] = opts.devEmail;
	return new Request('https://admin.example.com/users', {
		method: opts.method ?? 'GET',
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

describe('listUsers handler', () => {
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
			// Seed something so we can prove the handler never got to run.
			await seedUsers(env, [{ email: 'owner@example.com', role: EStaffRole.OWNER }]);

			const response = await listUsersHandler.fetch(buildRequest(), env);
			expect(response.status).toBe(401);
			const body = (await response.json()) as { ok: boolean; error: { code: string } };
			expect(body.ok).toBe(false);
			expect(body.error.code).toBe('UNAUTHORIZED');
		});

		it('VENDOR caller → 403 FORBIDDEN with requiredRole=OWNER', async () => {
			const env = makeEnv();
			await seedUsers(env, [{ email: 'vendor@example.com', role: EStaffRole.VENDOR }]);

			const response = await listUsersHandler.fetch(buildRequest({ devEmail: 'vendor@example.com' }), env);
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

			const response = await listUsersHandler.fetch(buildRequest({ devEmail: 'manager@example.com' }), env);
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

			const response = await listUsersHandler.fetch(buildRequest({ devEmail: 'employee@example.com' }), env);
			expect(response.status).toBe(403);
			const body = (await response.json()) as {
				ok: boolean;
				error: { code: string; requiredRole: string };
			};
			expect(body.error.code).toBe('FORBIDDEN');
			expect(body.error.requiredRole).toBe(EStaffRole.OWNER);
		});
	});

	describe('OWNER caller — happy paths', () => {
		it('empty user store → 200 with data.users: []', async () => {
			const env = makeEnv();
			// Owner resolves via OWNER_EMAILS fallback (see makeEnv); the user
			// store is deliberately empty.

			const response = await listUsersHandler.fetch(buildRequest({ devEmail: 'owner@example.com' }), env);
			expect(response.status).toBe(200);
			const body = (await response.json()) as {
				ok: boolean;
				data: { users: IUserPublic[] };
			};
			expect(body.ok).toBe(true);
			expect(body.data.users).toEqual([]);
		});

		it('three users (OWNER + MANAGER + VENDOR) → 200, all three returned, sorted by email, passwordHash absent', async () => {
			const env = makeEnv();
			// Owner resolves via OWNER_EMAILS fallback; only alice/bob/charlie
			// go into the store. Insert in NON-sorted order to prove the
			// handler sorts defensively.
			await createUser(
				env,
				await buildUser({
					email: 'charlie@example.com',
					displayName: 'Charlie',
					role: EStaffRole.VENDOR,
				}),
			);
			await createUser(
				env,
				await buildUser({
					email: 'alice@example.com',
					displayName: 'Alice',
					role: EStaffRole.OWNER,
				}),
			);
			await createUser(
				env,
				await buildUser({
					email: 'bob@example.com',
					displayName: 'Bob',
					role: EStaffRole.MANAGER,
				}),
			);

			const response = await listUsersHandler.fetch(buildRequest({ devEmail: 'owner@example.com' }), env);
			expect(response.status).toBe(200);
			const body = (await response.json()) as {
				ok: boolean;
				data: { users: IUserPublic[] };
			};
			expect(body.ok).toBe(true);
			expect(body.data.users.length).toBe(3);
			expect(body.data.users.map((u) => u.email)).toEqual(['alice@example.com', 'bob@example.com', 'charlie@example.com']);
			// passwordHash must not have been serialized in any record.
			for (const u of body.data.users) {
				expect((u as unknown as Record<string, unknown>).passwordHash).toBeUndefined();
			}
			// Sanity: role fidelity survives the round-trip.
			const byEmail = new Map(body.data.users.map((u) => [u.email, u]));
			expect(byEmail.get('alice@example.com')!.role).toBe(EStaffRole.OWNER);
			expect(byEmail.get('bob@example.com')!.role).toBe(EStaffRole.MANAGER);
			expect(byEmail.get('charlie@example.com')!.role).toBe(EStaffRole.VENDOR);
		});

		it('DISABLED user is INCLUDED in the response (admin UI decides how to display)', async () => {
			const env = makeEnv();
			// Owner resolves via OWNER_EMAILS fallback; only the three probe
			// users go into the store.
			await createUser(
				env,
				await buildUser({
					email: 'active@example.com',
					status: EUserStatus.ACTIVE,
				}),
			);
			await createUser(
				env,
				await buildUser({
					email: 'invited@example.com',
					status: EUserStatus.INVITED,
					passwordHash: null,
				}),
			);
			await createUser(
				env,
				await buildUser({
					email: 'disabled@example.com',
					status: EUserStatus.DISABLED,
				}),
			);

			const response = await listUsersHandler.fetch(buildRequest({ devEmail: 'owner@example.com' }), env);
			expect(response.status).toBe(200);
			const body = (await response.json()) as {
				ok: boolean;
				data: { users: IUserPublic[] };
			};
			expect(body.data.users.map((u) => u.email).sort()).toEqual(['active@example.com', 'disabled@example.com', 'invited@example.com']);
			const disabled = body.data.users.find((u) => u.email === 'disabled@example.com');
			expect(disabled).toBeDefined();
			expect(disabled!.status).toBe(EUserStatus.DISABLED);
		});
	});

	describe('CORS', () => {
		it('OPTIONS /users → 204 with expected preflight headers', async () => {
			const env = makeEnv();
			const response = await listUsersHandler.fetch(
				new Request('https://admin.example.com/users', {
					method: 'OPTIONS',
					headers: {
						Origin: 'https://admin.example.com',
						'Access-Control-Request-Method': 'GET',
						'Access-Control-Request-Headers': 'content-type',
					},
				}),
				env,
			);
			expect(response.status).toBe(204);
			expect(response.headers.get('Access-Control-Allow-Origin')).toBe('https://admin.example.com');
			const allowMethods = response.headers.get('Access-Control-Allow-Methods') ?? '';
			expect(allowMethods).toContain('GET');
			expect(allowMethods).toContain('OPTIONS');
		});
	});
});
