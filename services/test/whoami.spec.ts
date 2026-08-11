import { describe, it, expect, vi } from 'vitest';
import { EStaffRole, EUserStatus, type IUser } from '@bee-epic/shared';
import worker from '../src/index';
import { createUser } from '../src/auth/repo/userRepo';

/**
 * In-memory KV mock — mirrors the pattern in
 * services/test/auth/handlers/*.spec.ts. Fresh per test.
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

interface IEnvOverrides {
	ownerEmails?: string;
	environment?: string;
}

function makeEnv(overrides: IEnvOverrides = {}): Env {
	return {
		CONTENT_KV: makeKv(),
		ALLOWED_ORIGINS: 'https://admin.example.com',
		// `production` by default — the null-caller branch tests should not
		// accidentally activate dev bypass. Individual tests that need the
		// dev-bypass path override this to 'development'.
		ENVIRONMENT: overrides.environment ?? 'production',
		JWT_SIGNING_SECRET: 'test-secret-value-abc-123',
		ADMIN_BASE_URL: 'https://admin.example.com',
		OWNER_EMAILS: overrides.ownerEmails ?? '',
	} as unknown as Env;
}

async function seedUser(env: Env, patch: Partial<IUser> & { email: string }): Promise<void> {
	const now = Date.now();
	await createUser(env, {
		schemaVersion: 1,
		email: patch.email,
		displayName: patch.displayName ?? patch.email,
		role: patch.role ?? EStaffRole.OWNER,
		status: patch.status ?? EUserStatus.ACTIVE,
		passwordHash: patch.passwordHash ?? null,
		createdAt: now,
		updatedAt: now,
		lastLoginAt: null,
		lastLoginIp: null,
	});
}

function buildRequest(headers: Record<string, string> = {}): Request {
	return new Request('https://admin.example.com/whoami', {
		method: 'GET',
		headers: {
			Origin: 'https://admin.example.com',
			...headers,
		},
	});
}

interface IWhoamiBody {
	ok: boolean;
	data: {
		caller: unknown;
		bootstrapAvailable?: boolean;
	};
}

describe('GET /whoami — bootstrapAvailable flag', () => {
	it('returns bootstrapAvailable: true when no ACTIVE OWNERs exist and no caller', async () => {
		const env = makeEnv();
		const response = await worker.fetch(buildRequest(), env);
		expect(response.status).toBe(200);
		const body = (await response.json()) as IWhoamiBody;
		expect(body.ok).toBe(true);
		expect(body.data.caller).toBeNull();
		expect(body.data.bootstrapAvailable).toBe(true);
	});

	it('returns bootstrapAvailable: false when an ACTIVE OWNER exists and no caller', async () => {
		const env = makeEnv();
		await seedUser(env, {
			email: 'owner@example.com',
			role: EStaffRole.OWNER,
			status: EUserStatus.ACTIVE,
		});
		const response = await worker.fetch(buildRequest(), env);
		expect(response.status).toBe(200);
		const body = (await response.json()) as IWhoamiBody;
		expect(body.data.caller).toBeNull();
		expect(body.data.bootstrapAvailable).toBe(false);
	});

	it('returns bootstrapAvailable: true when only INVITED OWNERs exist and no caller', async () => {
		const env = makeEnv();
		await seedUser(env, {
			email: 'owner@example.com',
			role: EStaffRole.OWNER,
			status: EUserStatus.INVITED,
			passwordHash: null,
		});
		const response = await worker.fetch(buildRequest(), env);
		expect(response.status).toBe(200);
		const body = (await response.json()) as IWhoamiBody;
		expect(body.data.caller).toBeNull();
		expect(body.data.bootstrapAvailable).toBe(true);
	});

	it('omits bootstrapAvailable when caller is present', async () => {
		const env = makeEnv({ environment: 'development' });
		await seedUser(env, {
			email: 'owner@example.com',
			role: EStaffRole.OWNER,
			status: EUserStatus.ACTIVE,
		});
		const response = await worker.fetch(buildRequest({ 'X-Dev-Email': 'owner@example.com' }), env);
		expect(response.status).toBe(200);
		const body = (await response.json()) as IWhoamiBody;
		expect(body.data.caller).toBeTruthy();
		expect(body.data).not.toHaveProperty('bootstrapAvailable');
	});

	it('counts DISABLED OWNERs as non-ACTIVE (bootstrapAvailable stays true)', async () => {
		const env = makeEnv();
		await seedUser(env, {
			email: 'owner@example.com',
			role: EStaffRole.OWNER,
			status: EUserStatus.DISABLED,
		});
		const response = await worker.fetch(buildRequest(), env);
		expect(response.status).toBe(200);
		const body = (await response.json()) as IWhoamiBody;
		expect(body.data.caller).toBeNull();
		expect(body.data.bootstrapAvailable).toBe(true);
	});
});

describe('GET /whoami — Origin allow-list + method gating (now routed through withAuthHandler)', () => {
	it('rejects a disallowed Origin with 403 (previously bypassed the gate)', async () => {
		const env = makeEnv();
		const request = new Request('https://admin.example.com/whoami', {
			method: 'GET',
			headers: { Origin: 'https://evil.example.com' },
		});
		const response = await worker.fetch(request, env);
		expect(response.status).toBe(403);
		const body = (await response.json()) as { ok: boolean; error: { code: string } };
		expect(body.ok).toBe(false);
		expect(body.error.code).toBe('UNAUTHORIZED');
	});

	it('handles OPTIONS preflight via the wrapper (204)', async () => {
		const env = makeEnv();
		const request = new Request('https://admin.example.com/whoami', {
			method: 'OPTIONS',
			headers: { Origin: 'https://admin.example.com' },
		});
		const response = await worker.fetch(request, env);
		expect(response.status).toBe(204);
	});

	it('returns 405 for a non-GET method', async () => {
		const env = makeEnv();
		const request = new Request('https://admin.example.com/whoami', {
			method: 'POST',
			headers: { Origin: 'https://admin.example.com' },
		});
		const response = await worker.fetch(request, env);
		expect(response.status).toBe(405);
	});
});
