import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EStaffRole, EUserStatus, type IInvite, type IRefreshFamily, type IUser, type IUserPublic } from '@bee-epic/shared';
import updateUserHandler from '../../../src/auth/handlers/updateUser';
import { createUser, getUser } from '../../../src/auth/repo/userRepo';
import { createInvite, getInvite } from '../../../src/auth/repo/inviteRepo';
import { createFamily, listForEmail } from '../../../src/auth/repo/refreshFamilyRepo';
import { hashPassword } from '../../../src/auth/crypto/passwordHash';

/**
 * In-memory KV mock — same pattern as listUsers.spec.ts / inviteUser.spec.ts.
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
	body?: unknown;
	rawBody?: string;
	pathEmail?: string; // last URL segment (may be URL-encoded)
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
	const path = opts.pathEmail ?? 'target@example.com';
	return new Request(`https://admin.example.com/users/${path}`, {
		method: opts.method ?? 'PUT',
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

describe('updateUser handler', () => {
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
			const response = await updateUserHandler.fetch(
				buildRequest({
					pathEmail: 'target@example.com',
					body: { displayName: 'Nope' },
				}),
				env,
			);
			expect(response.status).toBe(401);
			const body = (await response.json()) as { ok: boolean; error: { code: string } };
			expect(body.ok).toBe(false);
			expect(body.error.code).toBe('UNAUTHORIZED');
		});

		it('VENDOR caller → 403 FORBIDDEN with requiredRole=OWNER', async () => {
			const env = makeEnv();
			await seedUsers(env, [{ email: 'vendor@example.com', role: EStaffRole.VENDOR }]);
			const response = await updateUserHandler.fetch(
				buildRequest({
					devEmail: 'vendor@example.com',
					body: { displayName: 'Nope' },
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
		});

		it('MANAGER caller → 403 FORBIDDEN with requiredRole=OWNER', async () => {
			const env = makeEnv();
			await seedUsers(env, [{ email: 'manager@example.com', role: EStaffRole.MANAGER }]);
			const response = await updateUserHandler.fetch(
				buildRequest({
					devEmail: 'manager@example.com',
					body: { displayName: 'Nope' },
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
		});

		it('EMPLOYEE caller → 403 FORBIDDEN with requiredRole=OWNER', async () => {
			const env = makeEnv();
			await seedUsers(env, [{ email: 'employee@example.com', role: EStaffRole.EMPLOYEE }]);
			const response = await updateUserHandler.fetch(
				buildRequest({
					devEmail: 'employee@example.com',
					body: { displayName: 'Nope' },
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
		});
	});

	describe('OWNER caller — not-found', () => {
		it('non-existent target → 404 USER_NOT_FOUND', async () => {
			const env = makeEnv();
			await createUser(env, await buildUser({ email: 'owner@example.com', role: EStaffRole.OWNER }));

			const response = await updateUserHandler.fetch(
				buildRequest({
					devEmail: 'owner@example.com',
					pathEmail: 'ghost@example.com',
					body: { displayName: 'Ghost' },
				}),
				env,
			);
			expect(response.status).toBe(404);
			const body = (await response.json()) as { ok: boolean; error: { code: string } };
			expect(body.error.code).toBe('USER_NOT_FOUND');
		});
	});

	describe('OWNER caller — happy paths', () => {
		it('updates displayName → 200, KV persisted, updatedAt bumped', async () => {
			const env = makeEnv();
			await createUser(env, await buildUser({ email: 'owner@example.com', role: EStaffRole.OWNER }));
			const original = await buildUser({
				email: 'target@example.com',
				displayName: 'Old Name',
				role: EStaffRole.EMPLOYEE,
			});
			await createUser(env, original);

			const before = (await getUser(env, 'target@example.com'))!;
			// Ensure updatedAt is strictly less than post-update by nudging the clock.
			// 20ms is comfortably above Date.now() resolution + CI scheduling noise.
			await new Promise((r) => setTimeout(r, 20));

			const response = await updateUserHandler.fetch(
				buildRequest({
					devEmail: 'owner@example.com',
					pathEmail: 'target@example.com',
					body: { displayName: 'New Name' },
				}),
				env,
			);
			expect(response.status).toBe(200);
			const body = (await response.json()) as {
				ok: boolean;
				data: { user: IUserPublic };
			};
			expect(body.ok).toBe(true);
			expect(body.data.user.email).toBe('target@example.com');
			expect(body.data.user.displayName).toBe('New Name');
			expect((body.data.user as unknown as Record<string, unknown>).passwordHash).toBeUndefined();

			const persisted = await getUser(env, 'target@example.com');
			expect(persisted).not.toBeNull();
			expect(persisted!.displayName).toBe('New Name');
			expect(persisted!.updatedAt).toBeGreaterThan(before.updatedAt);
		});

		it('updates role MANAGER→EMPLOYEE when two OWNERs also present → 200', async () => {
			const env = makeEnv();
			await createUser(env, await buildUser({ email: 'owner-a@example.com', role: EStaffRole.OWNER }));
			await createUser(env, await buildUser({ email: 'owner-b@example.com', role: EStaffRole.OWNER }));
			await createUser(env, await buildUser({ email: 'target@example.com', role: EStaffRole.MANAGER }));

			const response = await updateUserHandler.fetch(
				buildRequest({
					devEmail: 'owner-a@example.com',
					pathEmail: 'target@example.com',
					body: { role: EStaffRole.EMPLOYEE },
				}),
				env,
			);
			expect(response.status).toBe(200);
			const body = (await response.json()) as {
				ok: boolean;
				data: { user: IUserPublic };
			};
			expect(body.data.user.role).toBe(EStaffRole.EMPLOYEE);
			const persisted = await getUser(env, 'target@example.com');
			expect(persisted!.role).toBe(EStaffRole.EMPLOYEE);
		});

		it('two OWNERs; OWNER-A demotes OWNER-B to MANAGER → 200', async () => {
			const env = makeEnv();
			await createUser(env, await buildUser({ email: 'owner-a@example.com', role: EStaffRole.OWNER }));
			await createUser(env, await buildUser({ email: 'owner-b@example.com', role: EStaffRole.OWNER }));

			const response = await updateUserHandler.fetch(
				buildRequest({
					devEmail: 'owner-a@example.com',
					pathEmail: 'owner-b@example.com',
					body: { role: EStaffRole.MANAGER },
				}),
				env,
			);
			expect(response.status).toBe(200);
			const body = (await response.json()) as {
				ok: boolean;
				data: { user: IUserPublic };
			};
			expect(body.data.user.role).toBe(EStaffRole.MANAGER);
		});
	});

	describe('OWNER caller — guards', () => {
		it('last-OWNER demotion: lone OWNER demotes self → 400 CANNOT_DEMOTE_LAST_OWNER', async () => {
			const env = makeEnv();
			await createUser(env, await buildUser({ email: 'owner@example.com', role: EStaffRole.OWNER }));

			const response = await updateUserHandler.fetch(
				buildRequest({
					devEmail: 'owner@example.com',
					pathEmail: 'owner@example.com',
					body: { role: EStaffRole.MANAGER },
				}),
				env,
			);
			expect(response.status).toBe(400);
			const body = (await response.json()) as { ok: boolean; error: { code: string } };
			expect(body.error.code).toBe('CANNOT_DEMOTE_LAST_OWNER');
			// State unchanged.
			const persisted = await getUser(env, 'owner@example.com');
			expect(persisted!.role).toBe(EStaffRole.OWNER);
		});

		it('self-disable guard fires ahead of the write (two OWNERs so last-OWNER guard does not fire) → 400 CANNOT_DISABLE_SELF', async () => {
			const env = makeEnv();
			await createUser(env, await buildUser({ email: 'owner-a@example.com', role: EStaffRole.OWNER }));
			await createUser(env, await buildUser({ email: 'owner-b@example.com', role: EStaffRole.OWNER }));

			const response = await updateUserHandler.fetch(
				buildRequest({
					devEmail: 'owner-a@example.com',
					pathEmail: 'owner-a@example.com',
					body: { status: EUserStatus.DISABLED },
				}),
				env,
			);
			expect(response.status).toBe(400);
			const body = (await response.json()) as { ok: boolean; error: { code: string } };
			expect(body.error.code).toBe('CANNOT_DISABLE_SELF');
			// State unchanged.
			const persisted = await getUser(env, 'owner-a@example.com');
			expect(persisted!.status).toBe(EUserStatus.ACTIVE);
		});

		it('last-OWNER disable: caller OWNER-A (OWNER_EMAILS bootstrap only), target OWNER-B (only ACTIVE OWNER) → 400 CANNOT_DEMOTE_LAST_OWNER', async () => {
			// Reachability of the last-OWNER guard requires caller.email !== target.email.
			// Under the Phase 9 trust chain, DISABLED users cannot authenticate,
			// so the previous "caller DISABLED in user record but present in staff"
			// scenario no longer applies. Instead we exploit the OWNER_EMAILS
			// bootstrap fallback: owner-a has no user record but resolves as
			// OWNER via env.OWNER_EMAILS, so caller.email is 'owner-a@example.com'
			// while the sole ACTIVE OWNER in the store is B. Patching B with
			// {status: DISABLED} must trip the last-OWNER guard, NOT the
			// self-disable guard (caller != target).
			const env = makeEnv();
			await createUser(
				env,
				await buildUser({
					email: 'owner-b@example.com',
					role: EStaffRole.OWNER,
					status: EUserStatus.ACTIVE,
				}),
			);

			const response = await updateUserHandler.fetch(
				buildRequest({
					devEmail: 'owner-a@example.com',
					pathEmail: 'owner-b@example.com',
					body: { status: EUserStatus.DISABLED },
				}),
				env,
			);
			expect(response.status).toBe(400);
			const body = (await response.json()) as { ok: boolean; error: { code: string } };
			expect(body.error.code).toBe('CANNOT_DEMOTE_LAST_OWNER');
			// B still ACTIVE.
			const persisted = await getUser(env, 'owner-b@example.com');
			expect(persisted!.status).toBe(EUserStatus.ACTIVE);
		});
	});

	describe('OWNER caller — disable side effects', () => {
		it('disabling a non-owner target kills refresh families + invalidates invites', async () => {
			const env = makeEnv();
			await createUser(env, await buildUser({ email: 'owner@example.com', role: EStaffRole.OWNER }));
			await createUser(
				env,
				await buildUser({
					email: 'manager-b@example.com',
					role: EStaffRole.MANAGER,
					status: EUserStatus.ACTIVE,
				}),
			);

			// Pre-seed a refresh family for the target.
			const now = Date.now();
			const family: IRefreshFamily = {
				schemaVersion: 1,
				familyId: 'family-abc',
				email: 'manager-b@example.com',
				currentJti: 'jti-1',
				createdAt: now,
				lastRefreshedAt: now,
				expiresAt: now + 30 * 24 * 60 * 60 * 1000,
				userAgent: null,
				ip: null,
			};
			await createFamily(env, family);

			// Pre-seed an invite for the target (stale, but shouldn't matter).
			const invite: IInvite = {
				schemaVersion: 1,
				token: 'token-abc-xyz',
				email: 'manager-b@example.com',
				role: EStaffRole.MANAGER,
				displayName: 'Manager B',
				invitedBy: 'owner@example.com',
				createdAt: now,
				expiresAt: now + 24 * 60 * 60 * 1000,
			};
			await createInvite(env, invite);

			// Sanity checks — artifacts exist before the update.
			expect((await listForEmail(env, 'manager-b@example.com')).length).toBe(1);
			expect(await getInvite(env, 'token-abc-xyz')).not.toBeNull();

			const response = await updateUserHandler.fetch(
				buildRequest({
					devEmail: 'owner@example.com',
					pathEmail: 'manager-b@example.com',
					body: { status: EUserStatus.DISABLED },
				}),
				env,
			);
			expect(response.status).toBe(200);
			const body = (await response.json()) as {
				ok: boolean;
				data: { user: IUserPublic };
			};
			expect(body.data.user.status).toBe(EUserStatus.DISABLED);

			// User persisted as DISABLED.
			const persisted = await getUser(env, 'manager-b@example.com');
			expect(persisted!.status).toBe(EUserStatus.DISABLED);

			// Refresh family GONE.
			expect((await listForEmail(env, 'manager-b@example.com')).length).toBe(0);
			// Invite GONE.
			expect(await getInvite(env, 'token-abc-xyz')).toBeNull();
		});
	});

	describe('OWNER caller — body validation', () => {
		it('empty body {} → 400 VALIDATION_FAILED with fields.body (Zod refine)', async () => {
			const env = makeEnv();
			await createUser(env, await buildUser({ email: 'owner@example.com', role: EStaffRole.OWNER }));
			await createUser(env, await buildUser({ email: 'target@example.com' }));

			const response = await updateUserHandler.fetch(
				buildRequest({
					devEmail: 'owner@example.com',
					pathEmail: 'target@example.com',
					body: {},
				}),
				env,
			);
			expect(response.status).toBe(400);
			const body = (await response.json()) as {
				ok: boolean;
				error: { code: string; fields: Record<string, string> };
			};
			expect(body.error.code).toBe('VALIDATION_FAILED');
			expect(body.error.fields.body).toBeDefined();
		});

		it('invalid role "ROOT" → 400 VALIDATION_FAILED with fields.role', async () => {
			const env = makeEnv();
			await createUser(env, await buildUser({ email: 'owner@example.com', role: EStaffRole.OWNER }));
			await createUser(env, await buildUser({ email: 'target@example.com' }));

			const response = await updateUserHandler.fetch(
				buildRequest({
					devEmail: 'owner@example.com',
					pathEmail: 'target@example.com',
					body: { role: 'ROOT' },
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
		});

		it('invalid status "SUSPENDED" → 400 VALIDATION_FAILED with fields.status', async () => {
			const env = makeEnv();
			await createUser(env, await buildUser({ email: 'owner@example.com', role: EStaffRole.OWNER }));
			await createUser(env, await buildUser({ email: 'target@example.com' }));

			const response = await updateUserHandler.fetch(
				buildRequest({
					devEmail: 'owner@example.com',
					pathEmail: 'target@example.com',
					body: { status: 'SUSPENDED' },
				}),
				env,
			);
			expect(response.status).toBe(400);
			const body = (await response.json()) as {
				ok: boolean;
				error: { code: string; fields: Record<string, string> };
			};
			expect(body.error.code).toBe('VALIDATION_FAILED');
			expect(body.error.fields.status).toBeDefined();
		});

		it('non-JSON body → 400 VALIDATION_FAILED with fields.body="Invalid JSON"', async () => {
			const env = makeEnv();
			await createUser(env, await buildUser({ email: 'owner@example.com', role: EStaffRole.OWNER }));

			const response = await updateUserHandler.fetch(
				buildRequest({
					devEmail: 'owner@example.com',
					pathEmail: 'target@example.com',
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
		});
	});

	describe('CORS', () => {
		it('OPTIONS /users/:email → 204 with expected preflight headers', async () => {
			const env = makeEnv();
			const response = await updateUserHandler.fetch(
				new Request('https://admin.example.com/users/target@example.com', {
					method: 'OPTIONS',
					headers: {
						Origin: 'https://admin.example.com',
						'Access-Control-Request-Method': 'PUT',
						'Access-Control-Request-Headers': 'content-type',
					},
				}),
				env,
			);
			expect(response.status).toBe(204);
			expect(response.headers.get('Access-Control-Allow-Origin')).toBe('https://admin.example.com');
			const allowMethods = response.headers.get('Access-Control-Allow-Methods') ?? '';
			expect(allowMethods).toContain('PUT');
			expect(allowMethods).toContain('OPTIONS');
		});
	});

	describe('URL-encoded email in path', () => {
		it('/users/alice%40example.com resolves to alice@example.com', async () => {
			const env = makeEnv();
			await createUser(env, await buildUser({ email: 'owner@example.com', role: EStaffRole.OWNER }));
			await createUser(env, await buildUser({ email: 'alice@example.com', displayName: 'Old' }));

			// Note: pathEmail is inserted RAW into the URL — encodeURIComponent
			// on `@` produces `%40`. buildRequest passes it through untouched.
			const response = await updateUserHandler.fetch(
				buildRequest({
					devEmail: 'owner@example.com',
					pathEmail: 'alice%40example.com',
					body: { displayName: 'New' },
				}),
				env,
			);
			expect(response.status).toBe(200);
			const body = (await response.json()) as {
				ok: boolean;
				data: { user: IUserPublic };
			};
			expect(body.data.user.email).toBe('alice@example.com');
			expect(body.data.user.displayName).toBe('New');

			const persisted = await getUser(env, 'alice@example.com');
			expect(persisted!.displayName).toBe('New');
		});
	});
});
