import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AUTH_POLICY_MIN_LENGTH_FLOOR, DEFAULT_AUTH_POLICY, EStaffRole, EUserStatus, type IAuthPolicy } from '@bee-epic/shared';
import { getPolicyHandler, putPolicyHandler } from '../../../src/auth/handlers/policyHandlers';
import { _clearCacheForTests, putPolicy } from '../../../src/auth/repo/policyRepo';
import { createUser } from '../../../src/auth/repo/userRepo';

/**
 * In-memory KV mock — mirrors the pattern used by other handler specs
 * (listUsers, changePassword). Fresh per test.
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

function makeEnv(): Env {
	return {
		CONTENT_KV: makeKv(),
		ALLOWED_ORIGINS: 'https://admin.example.com',
		// Development so tests can authenticate via X-Dev-Email; matches the
		// pattern used by every other handler spec on this branch.
		ENVIRONMENT: 'development',
		JWT_SIGNING_SECRET: 'test-secret-value-abc-123',
		ADMIN_BASE_URL: 'https://admin.example.com',
		// OWNER_EMAILS bootstraps owner@example.com as an OWNER caller without
		// polluting the user store — tests that also want an OWNER user record
		// can still seed one explicitly.
		OWNER_EMAILS: 'owner@example.com',
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

interface IReqOpts {
	devEmail?: string;
	method?: string;
	origin?: string;
	body?: unknown;
	rawBody?: string;
}

function buildRequest(opts: IReqOpts = {}): Request {
	const headers: Record<string, string> = {
		Origin: opts.origin ?? 'https://admin.example.com',
	};
	if (opts.devEmail) headers['X-Dev-Email'] = opts.devEmail;
	const method = opts.method ?? 'GET';
	const hasBody = method !== 'GET' && method !== 'OPTIONS';
	if (hasBody) headers['Content-Type'] = 'application/json';
	let body: BodyInit | undefined;
	if (hasBody) {
		if (opts.rawBody !== undefined) body = opts.rawBody;
		else body = JSON.stringify(opts.body ?? {});
	}
	return new Request('https://admin.example.com/settings/auth-policy', {
		method,
		headers,
		body,
	});
}

const CUSTOM_POLICY: IAuthPolicy = {
	schemaVersion: 1,
	minLength: 16,
	checkBreachCorpus: false,
	notifyOnPasswordChange: false,
	updatedAt: 1_700_000_000_000,
	updatedBy: 'seed@example.com',
};

describe('GET /settings/auth-policy', () => {
	beforeEach(() => {
		vi.spyOn(console, 'warn').mockImplementation(() => undefined);
		vi.spyOn(console, 'error').mockImplementation(() => undefined);
		_clearCacheForTests();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('anonymous caller → 401 UNAUTHORIZED', async () => {
		const env = makeEnv();

		const response = await getPolicyHandler.fetch(buildRequest(), env);
		expect(response.status).toBe(401);
		const body = (await response.json()) as { ok: boolean; error: { code: string } };
		expect(body.ok).toBe(false);
		expect(body.error.code).toBe('UNAUTHORIZED');
	});

	it('VENDOR caller (lowest rank) → 200 with DEFAULT_AUTH_POLICY when nothing persisted', async () => {
		const env = makeEnv();
		await seedUsers(env, [{ email: 'vendor@example.com', role: EStaffRole.VENDOR }]);

		const response = await getPolicyHandler.fetch(buildRequest({ devEmail: 'vendor@example.com' }), env);
		expect(response.status).toBe(200);
		const body = (await response.json()) as { ok: boolean; data: IAuthPolicy };
		expect(body.ok).toBe(true);
		expect(body.data).toEqual(DEFAULT_AUTH_POLICY);
	});

	/**
	 * GET is not a mutation, so the write-method floor (EMPLOYEE ≥ rank 1) does
	 * NOT apply. Any authenticated caller — VENDOR through OWNER — must succeed.
	 * We spot-check EMPLOYEE + MANAGER + OWNER here; VENDOR is proven above.
	 */
	it('EMPLOYEE caller → 200', async () => {
		const env = makeEnv();
		await seedUsers(env, [{ email: 'employee@example.com', role: EStaffRole.EMPLOYEE }]);

		const response = await getPolicyHandler.fetch(buildRequest({ devEmail: 'employee@example.com' }), env);
		expect(response.status).toBe(200);
	});

	it('MANAGER caller → 200', async () => {
		const env = makeEnv();
		await seedUsers(env, [{ email: 'manager@example.com', role: EStaffRole.MANAGER }]);

		const response = await getPolicyHandler.fetch(buildRequest({ devEmail: 'manager@example.com' }), env);
		expect(response.status).toBe(200);
	});

	it('OWNER caller → 200', async () => {
		const env = makeEnv();

		const response = await getPolicyHandler.fetch(buildRequest({ devEmail: 'owner@example.com' }), env);
		expect(response.status).toBe(200);
	});

	it('KV pre-seeded with a custom policy → GET returns that policy (not DEFAULT)', async () => {
		const env = makeEnv();
		await seedUsers(env, [{ email: 'vendor@example.com', role: EStaffRole.VENDOR }]);
		// Persist via the repo so the on-disk shape matches production writes.
		await putPolicy(env, CUSTOM_POLICY);
		// Repo populates its in-isolate cache on putPolicy — clear so we prove GET
		// re-reads (or at minimum that the cached value IS the custom one, not
		// DEFAULT). Either way, the assertion below is what matters.
		_clearCacheForTests();

		const response = await getPolicyHandler.fetch(buildRequest({ devEmail: 'vendor@example.com' }), env);
		expect(response.status).toBe(200);
		const body = (await response.json()) as { ok: boolean; data: IAuthPolicy };
		expect(body.data.minLength).toBe(16);
		expect(body.data.checkBreachCorpus).toBe(false);
		expect(body.data.notifyOnPasswordChange).toBe(false);
		expect(body.data.updatedBy).toBe('seed@example.com');
	});

	it('OPTIONS /settings/auth-policy on GET handler → 204 with GET, OPTIONS allow-methods', async () => {
		const env = makeEnv();
		const response = await getPolicyHandler.fetch(buildRequest({ method: 'OPTIONS' }), env);
		expect(response.status).toBe(204);
		expect(response.headers.get('Access-Control-Allow-Methods')).toBe('GET, OPTIONS');
	});
});

describe('PUT /settings/auth-policy', () => {
	beforeEach(() => {
		vi.spyOn(console, 'warn').mockImplementation(() => undefined);
		vi.spyOn(console, 'error').mockImplementation(() => undefined);
		_clearCacheForTests();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	const validBody = {
		minLength: 14,
		checkBreachCorpus: true,
		notifyOnPasswordChange: true,
	};

	it('anonymous caller → 401 UNAUTHORIZED', async () => {
		const env = makeEnv();

		const response = await putPolicyHandler.fetch(buildRequest({ method: 'PUT', body: validBody }), env);
		expect(response.status).toBe(401);
		const body = (await response.json()) as { ok: boolean; error: { code: string } };
		expect(body.error.code).toBe('UNAUTHORIZED');
	});

	it('VENDOR caller → 403 FORBIDDEN with requiredRole=OWNER', async () => {
		const env = makeEnv();
		await seedUsers(env, [{ email: 'vendor@example.com', role: EStaffRole.VENDOR }]);

		const response = await putPolicyHandler.fetch(buildRequest({ method: 'PUT', devEmail: 'vendor@example.com', body: validBody }), env);
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

		const response = await putPolicyHandler.fetch(buildRequest({ method: 'PUT', devEmail: 'manager@example.com', body: validBody }), env);
		expect(response.status).toBe(403);
		const body = (await response.json()) as {
			ok: boolean;
			error: { code: string; requiredRole: string };
		};
		expect(body.error.code).toBe('FORBIDDEN');
		expect(body.error.requiredRole).toBe(EStaffRole.OWNER);
	});

	it('OWNER + valid full body → 200, server-stamped fields honoured, KV state matches', async () => {
		const env = makeEnv();
		const before = Date.now();

		const response = await putPolicyHandler.fetch(buildRequest({ method: 'PUT', devEmail: 'owner@example.com', body: validBody }), env);
		expect(response.status).toBe(200);
		const body = (await response.json()) as { ok: boolean; data: IAuthPolicy };
		expect(body.ok).toBe(true);
		expect(body.data.schemaVersion).toBe(1);
		expect(body.data.minLength).toBe(14);
		expect(body.data.checkBreachCorpus).toBe(true);
		expect(body.data.notifyOnPasswordChange).toBe(true);
		expect(body.data.updatedBy).toBe('owner@example.com');
		expect(typeof body.data.updatedAt).toBe('number');
		expect(body.data.updatedAt).toBeGreaterThanOrEqual(before);

		// Verify KV state matches the returned policy.
		const stored = await env.CONTENT_KV.get('auth-policy');
		expect(stored).not.toBeNull();
		const parsed = JSON.parse(stored!) as IAuthPolicy;
		expect(parsed).toEqual(body.data);
	});

	it('OWNER + minLength below floor → 400 INVALID_POLICY (Zod rejects before putPolicy)', async () => {
		const env = makeEnv();

		const response = await putPolicyHandler.fetch(
			buildRequest({
				method: 'PUT',
				devEmail: 'owner@example.com',
				body: { ...validBody, minLength: 4 },
			}),
			env,
		);
		expect(response.status).toBe(400);
		const body = (await response.json()) as { ok: boolean; error: { code: string } };
		expect(body.error.code).toBe('INVALID_POLICY');
		// Sanity: below-floor value never made it to KV.
		expect(await env.CONTENT_KV.get('auth-policy')).toBeNull();
		// Sanity: the shared floor is what we think it is.
		expect(AUTH_POLICY_MIN_LENGTH_FLOOR).toBe(8);
	});

	it('OWNER + missing checkBreachCorpus field → 400 INVALID_POLICY', async () => {
		const env = makeEnv();

		const response = await putPolicyHandler.fetch(
			buildRequest({
				method: 'PUT',
				devEmail: 'owner@example.com',
				body: { minLength: 14, notifyOnPasswordChange: true },
			}),
			env,
		);
		expect(response.status).toBe(400);
		const body = (await response.json()) as { ok: boolean; error: { code: string } };
		expect(body.error.code).toBe('INVALID_POLICY');
	});

	it('OWNER + checkBreachCorpus wrong type (string "true") → 400 INVALID_POLICY', async () => {
		const env = makeEnv();

		const response = await putPolicyHandler.fetch(
			buildRequest({
				method: 'PUT',
				devEmail: 'owner@example.com',
				body: { ...validBody, checkBreachCorpus: 'true' },
			}),
			env,
		);
		expect(response.status).toBe(400);
		const body = (await response.json()) as { ok: boolean; error: { code: string } };
		expect(body.error.code).toBe('INVALID_POLICY');
	});

	it('OWNER + valid body, then GET → returns the newly PUT policy', async () => {
		const env = makeEnv();
		await seedUsers(env, [{ email: 'vendor@example.com', role: EStaffRole.VENDOR }]);

		const putRes = await putPolicyHandler.fetch(
			buildRequest({
				method: 'PUT',
				devEmail: 'owner@example.com',
				body: { minLength: 20, checkBreachCorpus: false, notifyOnPasswordChange: true },
			}),
			env,
		);
		expect(putRes.status).toBe(200);
		const putBody = (await putRes.json()) as { data: IAuthPolicy };
		expect(putBody.data.minLength).toBe(20);

		const getRes = await getPolicyHandler.fetch(buildRequest({ devEmail: 'vendor@example.com' }), env);
		expect(getRes.status).toBe(200);
		const getBody = (await getRes.json()) as { data: IAuthPolicy };
		expect(getBody.data.minLength).toBe(20);
		expect(getBody.data.checkBreachCorpus).toBe(false);
		expect(getBody.data.notifyOnPasswordChange).toBe(true);
		expect(getBody.data.updatedBy).toBe('owner@example.com');
	});

	it('OWNER + attempts to forge updatedBy → server-stamped value wins', async () => {
		const env = makeEnv();

		const response = await putPolicyHandler.fetch(
			buildRequest({
				method: 'PUT',
				devEmail: 'owner@example.com',
				// Note the extra `updatedBy` — Zod's stripUnknown behaviour on
				// `z.object` drops it, and even if the client bypassed schema
				// stripping, the handler explicitly constructs `toPersist` with
				// caller.email — so the forged value can never leak into KV.
				body: {
					...validBody,
					updatedBy: 'attacker@example.com',
					updatedAt: 0,
					schemaVersion: 99,
				},
			}),
			env,
		);
		expect(response.status).toBe(200);
		const body = (await response.json()) as { ok: boolean; data: IAuthPolicy };
		expect(body.data.updatedBy).toBe('owner@example.com');
		expect(body.data.updatedBy).not.toBe('attacker@example.com');
		expect(body.data.schemaVersion).toBe(1);
		expect(body.data.updatedAt).toBeGreaterThan(0);
	});

	it('OWNER + non-JSON body → 400 INVALID_POLICY', async () => {
		const env = makeEnv();

		const response = await putPolicyHandler.fetch(
			buildRequest({
				method: 'PUT',
				devEmail: 'owner@example.com',
				rawBody: 'not-json-at-all{[',
			}),
			env,
		);
		expect(response.status).toBe(400);
		const body = (await response.json()) as { ok: boolean; error: { code: string } };
		expect(body.error.code).toBe('INVALID_POLICY');
	});

	it('OWNER + valid body but KV put throws → 400 INVALID_POLICY (handler try/catch)', async () => {
		const env = makeEnv();
		// Rig CONTENT_KV.put to succeed for the initial staff seed but fail for
		// the auth-policy write. Simpler: swap put to throw only for the
		// `auth-policy` key.
		const originalPut = env.CONTENT_KV.put.bind(env.CONTENT_KV);
		(env.CONTENT_KV as unknown as { put: KVNamespace['put'] }).put = vi.fn(async (key: string, value: string) => {
			if (key === 'auth-policy') {
				throw new Error('KV boom');
			}
			return originalPut(key, value);
		}) as unknown as KVNamespace['put'];
		const errorSpy = vi.spyOn(console, 'error');

		const response = await putPolicyHandler.fetch(buildRequest({ method: 'PUT', devEmail: 'owner@example.com', body: validBody }), env);
		expect(response.status).toBe(400);
		const body = (await response.json()) as { ok: boolean; error: { code: string } };
		expect(body.error.code).toBe('INVALID_POLICY');

		// The design justifies 400-with-log by pointing at the log. Assert it
		// actually fired — otherwise a future refactor could silently drop the
		// only signal an operator has for a KV outage on this endpoint.
		expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('[policyHandlers] putPolicy failed'), expect.any(Error));
	});

	it('OPTIONS /settings/auth-policy on PUT handler → 204 with PUT, OPTIONS allow-methods', async () => {
		const env = makeEnv();
		const response = await putPolicyHandler.fetch(buildRequest({ method: 'OPTIONS' }), env);
		expect(response.status).toBe(204);
		expect(response.headers.get('Access-Control-Allow-Methods')).toBe('PUT, OPTIONS');
	});
});
