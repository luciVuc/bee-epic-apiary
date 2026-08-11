import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EStaffRole, EUserStatus, type IUser, type IUserPublic } from '@bee-epic/shared';
import updateMeHandler from '../../../src/auth/handlers/updateMe';
import { createUser, getUser } from '../../../src/auth/repo/userRepo';
import { hashPassword } from '../../../src/auth/crypto/passwordHash';

/**
 * In-memory KV mock — same pattern as updateUser.spec.ts / listUsers.spec.ts.
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
	} as unknown as Env;
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
	return new Request('https://admin.example.com/users/me', {
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

describe('updateMe handler', () => {
	beforeEach(() => {
		vi.spyOn(console, 'warn').mockImplementation(() => undefined);
		vi.spyOn(console, 'error').mockImplementation(() => undefined);
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	describe('authorization (write-method floor)', () => {
		it('anonymous request → 401 UNAUTHORIZED (via wrapper write-floor)', async () => {
			const env = makeEnv();
			const response = await updateMeHandler.fetch(buildRequest({ body: { displayName: 'Anonymous' } }), env);
			expect(response.status).toBe(401);
			const body = (await response.json()) as { ok: boolean; error: { code: string } };
			expect(body.ok).toBe(false);
			expect(body.error.code).toBe('UNAUTHORIZED');
		});

		it('VENDOR caller → 403 FORBIDDEN_WRITE_ROLE', async () => {
			const env = makeEnv();
			await createUser(env, await buildUser({ email: 'vendor@example.com', role: EStaffRole.VENDOR }));
			const response = await updateMeHandler.fetch(buildRequest({ devEmail: 'vendor@example.com', body: { displayName: 'Nope' } }), env);
			expect(response.status).toBe(403);
			const body = (await response.json()) as {
				ok: boolean;
				error: { code: string; requiredRole: string };
			};
			expect(body.error.code).toBe('FORBIDDEN_WRITE_ROLE');
			expect(body.error.requiredRole).toBe(EStaffRole.EMPLOYEE);
		});
	});

	describe('happy paths', () => {
		it('EMPLOYEE caller updates own displayName → 200, KV persisted, updatedAt bumped', async () => {
			const env = makeEnv();
			await createUser(
				env,
				await buildUser({
					email: 'emp@example.com',
					displayName: 'Old Name',
					role: EStaffRole.EMPLOYEE,
					status: EUserStatus.ACTIVE,
				}),
			);
			const before = (await getUser(env, 'emp@example.com'))!;
			// Ensure updatedAt is strictly less than post-update.
			await new Promise((r) => setTimeout(r, 20));

			const response = await updateMeHandler.fetch(buildRequest({ devEmail: 'emp@example.com', body: { displayName: 'New Name' } }), env);
			expect(response.status).toBe(200);
			const body = (await response.json()) as {
				ok: boolean;
				data: { user: IUserPublic };
			};
			expect(body.ok).toBe(true);
			expect(body.data.user.email).toBe('emp@example.com');
			expect(body.data.user.displayName).toBe('New Name');

			const persisted = await getUser(env, 'emp@example.com');
			expect(persisted).not.toBeNull();
			expect(persisted!.displayName).toBe('New Name');
			expect(persisted!.updatedAt).toBeGreaterThan(before.updatedAt);
		});

		it('MANAGER caller → 200', async () => {
			const env = makeEnv();
			await createUser(env, await buildUser({ email: 'mgr@example.com', role: EStaffRole.MANAGER }));

			const response = await updateMeHandler.fetch(buildRequest({ devEmail: 'mgr@example.com', body: { displayName: 'Manager' } }), env);
			expect(response.status).toBe(200);
			const persisted = await getUser(env, 'mgr@example.com');
			expect(persisted!.displayName).toBe('Manager');
		});

		it('OWNER caller → 200', async () => {
			const env = makeEnv();
			await createUser(env, await buildUser({ email: 'own@example.com', role: EStaffRole.OWNER }));

			const response = await updateMeHandler.fetch(buildRequest({ devEmail: 'own@example.com', body: { displayName: 'Owner' } }), env);
			expect(response.status).toBe(200);
			const persisted = await getUser(env, 'own@example.com');
			expect(persisted!.displayName).toBe('Owner');
		});

		it('leading/trailing whitespace displayName is trimmed → "Bob"', async () => {
			const env = makeEnv();
			await createUser(env, await buildUser({ email: 'emp@example.com', role: EStaffRole.EMPLOYEE }));

			const response = await updateMeHandler.fetch(buildRequest({ devEmail: 'emp@example.com', body: { displayName: '  Bob  ' } }), env);
			expect(response.status).toBe(200);
			const body = (await response.json()) as {
				ok: boolean;
				data: { user: IUserPublic };
			};
			expect(body.data.user.displayName).toBe('Bob');
			const persisted = await getUser(env, 'emp@example.com');
			expect(persisted!.displayName).toBe('Bob');
		});
	});

	describe('caller resolves without a user record', () => {
		it('OWNER_EMAILS bootstrap caller with no user:* record → 404 USER_NOT_FOUND', async () => {
			// Under the Phase 9 trust chain, resolveCaller only returns a
			// caller for the dev-bypass path if EITHER the user record exists
			// OR the email is in env.OWNER_EMAILS. This test uses the
			// OWNER_EMAILS bootstrap escape hatch: ghost@example.com is not
			// in the user store, but is allowed as OWNER by the env override
			// — so resolveCaller returns a caller, and updateMe's internal
			// getUser call then returns null, tripping USER_NOT_FOUND.
			const env = makeEnv();
			(env as unknown as { OWNER_EMAILS: string }).OWNER_EMAILS = 'ghost@example.com';

			const response = await updateMeHandler.fetch(buildRequest({ devEmail: 'ghost@example.com', body: { displayName: 'Ghost' } }), env);
			expect(response.status).toBe(404);
			const body = (await response.json()) as { ok: boolean; error: { code: string } };
			expect(body.error.code).toBe('USER_NOT_FOUND');
		});
	});

	describe('body validation', () => {
		it('missing displayName → 400 VALIDATION_FAILED with fields.displayName', async () => {
			const env = makeEnv();
			await createUser(env, await buildUser({ email: 'emp@example.com' }));

			const response = await updateMeHandler.fetch(buildRequest({ devEmail: 'emp@example.com', body: {} }), env);
			expect(response.status).toBe(400);
			const body = (await response.json()) as {
				ok: boolean;
				error: { code: string; fields: Record<string, string> };
			};
			expect(body.error.code).toBe('VALIDATION_FAILED');
			expect(body.error.fields.displayName).toBeDefined();
		});

		it('empty string displayName → 400 VALIDATION_FAILED', async () => {
			const env = makeEnv();
			await createUser(env, await buildUser({ email: 'emp@example.com' }));

			const response = await updateMeHandler.fetch(buildRequest({ devEmail: 'emp@example.com', body: { displayName: '' } }), env);
			expect(response.status).toBe(400);
			const body = (await response.json()) as {
				ok: boolean;
				error: { code: string; fields: Record<string, string> };
			};
			expect(body.error.code).toBe('VALIDATION_FAILED');
			expect(body.error.fields.displayName).toBeDefined();
		});

		it('whitespace-only displayName → 400 VALIDATION_FAILED (trim + min-1)', async () => {
			const env = makeEnv();
			await createUser(env, await buildUser({ email: 'emp@example.com' }));

			const response = await updateMeHandler.fetch(buildRequest({ devEmail: 'emp@example.com', body: { displayName: '   ' } }), env);
			expect(response.status).toBe(400);
			const body = (await response.json()) as {
				ok: boolean;
				error: { code: string; fields: Record<string, string> };
			};
			expect(body.error.code).toBe('VALIDATION_FAILED');
			expect(body.error.fields.displayName).toBeDefined();
		});

		it('displayName over 120 chars → 400 VALIDATION_FAILED', async () => {
			const env = makeEnv();
			await createUser(env, await buildUser({ email: 'emp@example.com' }));

			const tooLong = 'a'.repeat(121);
			const response = await updateMeHandler.fetch(buildRequest({ devEmail: 'emp@example.com', body: { displayName: tooLong } }), env);
			expect(response.status).toBe(400);
			const body = (await response.json()) as {
				ok: boolean;
				error: { code: string; fields: Record<string, string> };
			};
			expect(body.error.code).toBe('VALIDATION_FAILED');
			expect(body.error.fields.displayName).toBeDefined();
		});

		it('non-JSON body → 400 VALIDATION_FAILED with fields.body="Invalid JSON"', async () => {
			const env = makeEnv();
			await createUser(env, await buildUser({ email: 'emp@example.com' }));

			const response = await updateMeHandler.fetch(buildRequest({ devEmail: 'emp@example.com', rawBody: 'not-json{{{' }), env);
			expect(response.status).toBe(400);
			const body = (await response.json()) as {
				ok: boolean;
				error: { code: string; fields: Record<string, string> };
			};
			expect(body.error.code).toBe('VALIDATION_FAILED');
			expect(body.error.fields.body).toBe('Invalid JSON');
		});
	});

	describe('privilege escalation resistance', () => {
		it('extra role field is stripped: sending {displayName,role:"OWNER"} does NOT change role', async () => {
			const env = makeEnv();
			await createUser(
				env,
				await buildUser({
					email: 'emp@example.com',
					role: EStaffRole.EMPLOYEE,
					status: EUserStatus.ACTIVE,
				}),
			);

			const response = await updateMeHandler.fetch(
				buildRequest({
					devEmail: 'emp@example.com',
					body: { displayName: 'Sneaky', role: EStaffRole.OWNER },
				}),
				env,
			);
			expect(response.status).toBe(200);
			const body = (await response.json()) as {
				ok: boolean;
				data: { user: IUserPublic };
			};
			expect(body.data.user.role).toBe(EStaffRole.EMPLOYEE);
			expect(body.data.user.displayName).toBe('Sneaky');

			const persisted = await getUser(env, 'emp@example.com');
			expect(persisted!.role).toBe(EStaffRole.EMPLOYEE);
			expect(persisted!.displayName).toBe('Sneaky');
		});
	});

	describe('response envelope', () => {
		it('data.user.passwordHash is stripped (undefined)', async () => {
			const env = makeEnv();
			await createUser(env, await buildUser({ email: 'emp@example.com' }));

			const response = await updateMeHandler.fetch(buildRequest({ devEmail: 'emp@example.com', body: { displayName: 'Public' } }), env);
			expect(response.status).toBe(200);
			const body = (await response.json()) as {
				ok: boolean;
				data: { user: IUserPublic };
			};
			expect((body.data.user as unknown as Record<string, unknown>).passwordHash).toBeUndefined();
		});
	});

	describe('CORS', () => {
		it('OPTIONS /users/me → 204 with PUT + OPTIONS in allow-methods', async () => {
			const env = makeEnv();
			const response = await updateMeHandler.fetch(
				new Request('https://admin.example.com/users/me', {
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
});
