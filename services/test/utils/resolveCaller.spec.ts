import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ACCESS_TTL_MS, EStaffRole, EUserStatus, type IUser } from '@bee-epic/shared';
import { resolveCaller, roleSatisfies } from '../../src/utils/resolveCaller';
import { ACCESS_COOKIE } from '../../src/auth/cookies';
import { signJwt } from '../../src/auth/crypto/jwt';
import { createUser } from '../../src/auth/repo/userRepo';

/**
 * In-memory KV mock — same shape as the migrated handler specs
 * (see services/test/auth/handlers/listUsers.spec.ts). `get`/`put`/`delete`
 * are exercised by userRepo; `list` is included for parity so this fixture
 * is a drop-in match if a case ever calls `rebuildIndex`.
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
		// Long enough to base64-decode to ≥ 32 bytes; matches the shape used
		// across the migrated handler specs.
		JWT_SIGNING_SECRET: 'test-secret-value-abc-123-must-be-at-least-32-bytes-decoded',
		API_SECRET_KEY: '',
		ENVIRONMENT: 'production',
		...overrides,
	} as unknown as Env;
}

/**
 * Seed users via `createUser` so `resolveCaller`'s cookie + dev-bypass paths
 * (which resolve callers through `userRepo`) can map each identity to the
 * requested role.
 */
async function seedUsers(env: Env, members: Array<{ email: string; role: EStaffRole; status?: EUserStatus }>): Promise<void> {
	const now = Date.now();
	for (const m of members) {
		const user: IUser = {
			schemaVersion: 1,
			email: m.email,
			displayName: m.email,
			role: m.role,
			status: m.status ?? EUserStatus.ACTIVE,
			passwordHash: null,
			createdAt: now,
			updatedAt: now,
			lastLoginAt: null,
			lastLoginIp: null,
		};
		await createUser(env, user);
	}
}

/**
 * Mint a valid `bea_at` cookie header value for `email`. `roleClaim` defaults
 * to OWNER so cases that want to prove role authority (Path A #1 / #9) can
 * mint a JWT claiming OWNER while seeding the user as MANAGER; resolveCaller
 * must ignore the JWT's role claim and use the user record's role.
 *
 * `ttlSeconds` defaults to the production access-cookie TTL. Pass a negative
 * value to mint a pre-expired token.
 */
async function mintAccessCookieHeader(
	env: Env,
	email: string,
	options: { roleClaim?: EStaffRole; ttlSeconds?: number } = {},
): Promise<string> {
	const ttl = options.ttlSeconds ?? Math.floor(ACCESS_TTL_MS / 1000);
	const token = await signJwt({ sub: email, type: 'access', role: options.roleClaim ?? EStaffRole.OWNER }, env.JWT_SIGNING_SECRET, ttl);
	return `${ACCESS_COOKIE}=${token}`;
}

/** Flip a byte in the JWT signature segment. Produces a token that parses but fails HMAC. */
function tamperSignature(cookieHeader: string): string {
	const eq = cookieHeader.indexOf('=');
	const token = cookieHeader.slice(eq + 1);
	const parts = token.split('.');
	const sig = parts[2];
	// Flip the first character of the sig to something else. Both `A` and `B`
	// are valid base64url chars, so the token still parses; the HMAC check
	// is what has to reject it.
	const flipped = (sig[0] === 'A' ? 'B' : 'A') + sig.slice(1);
	parts[2] = flipped;
	return `${cookieHeader.slice(0, eq + 1)}${parts.join('.')}`;
}

describe('roleSatisfies', () => {
	it('OWNER satisfies OWNER', () => expect(roleSatisfies(EStaffRole.OWNER, EStaffRole.OWNER)).toBe(true));
	it('OWNER satisfies MANAGER', () => expect(roleSatisfies(EStaffRole.OWNER, EStaffRole.MANAGER)).toBe(true));
	it('OWNER satisfies EMPLOYEE', () => expect(roleSatisfies(EStaffRole.OWNER, EStaffRole.EMPLOYEE)).toBe(true));
	it('OWNER satisfies VENDOR', () => expect(roleSatisfies(EStaffRole.OWNER, EStaffRole.VENDOR)).toBe(true));
	it('MANAGER satisfies MANAGER', () => expect(roleSatisfies(EStaffRole.MANAGER, EStaffRole.MANAGER)).toBe(true));
	it('MANAGER satisfies EMPLOYEE', () => expect(roleSatisfies(EStaffRole.MANAGER, EStaffRole.EMPLOYEE)).toBe(true));
	it('MANAGER satisfies VENDOR', () => expect(roleSatisfies(EStaffRole.MANAGER, EStaffRole.VENDOR)).toBe(true));
	it('MANAGER does not satisfy OWNER', () => expect(roleSatisfies(EStaffRole.MANAGER, EStaffRole.OWNER)).toBe(false));
	it('EMPLOYEE satisfies EMPLOYEE', () => expect(roleSatisfies(EStaffRole.EMPLOYEE, EStaffRole.EMPLOYEE)).toBe(true));
	it('EMPLOYEE satisfies VENDOR', () => expect(roleSatisfies(EStaffRole.EMPLOYEE, EStaffRole.VENDOR)).toBe(true));
	it('EMPLOYEE does not satisfy MANAGER', () => expect(roleSatisfies(EStaffRole.EMPLOYEE, EStaffRole.MANAGER)).toBe(false));
	it('EMPLOYEE does not satisfy OWNER', () => expect(roleSatisfies(EStaffRole.EMPLOYEE, EStaffRole.OWNER)).toBe(false));
	it('VENDOR satisfies VENDOR', () => expect(roleSatisfies(EStaffRole.VENDOR, EStaffRole.VENDOR)).toBe(true));
	it('VENDOR does not satisfy EMPLOYEE', () => expect(roleSatisfies(EStaffRole.VENDOR, EStaffRole.EMPLOYEE)).toBe(false));
	it('VENDOR does not satisfy MANAGER', () => expect(roleSatisfies(EStaffRole.VENDOR, EStaffRole.MANAGER)).toBe(false));
	it('VENDOR does not satisfy OWNER', () => expect(roleSatisfies(EStaffRole.VENDOR, EStaffRole.OWNER)).toBe(false));
});

describe('resolveCaller — Path A: cookie', () => {
	beforeEach(() => vi.clearAllMocks());

	it('returns caller when bea_at cookie is valid and user is ACTIVE', async () => {
		const env = makeEnv();
		await seedUsers(env, [{ email: 'owner@test.com', role: EStaffRole.OWNER }]);
		const cookie = await mintAccessCookieHeader(env, 'owner@test.com');
		const request = new Request('http://example.com', { headers: { Cookie: cookie } });

		const caller = await resolveCaller(request, env);
		expect(caller).toEqual({ email: 'owner@test.com', role: EStaffRole.OWNER, via: 'cookie' });
	});

	it('returns null when bea_at cookie signature is bad', async () => {
		const env = makeEnv();
		await seedUsers(env, [{ email: 'owner@test.com', role: EStaffRole.OWNER }]);
		const cookie = tamperSignature(await mintAccessCookieHeader(env, 'owner@test.com'));
		const request = new Request('http://example.com', { headers: { Cookie: cookie } });

		// No fallback path is set, so a rejected cookie → null.
		expect(await resolveCaller(request, env)).toBeNull();
	});

	it('returns null when bea_at cookie is expired', async () => {
		const env = makeEnv();
		await seedUsers(env, [{ email: 'owner@test.com', role: EStaffRole.OWNER }]);
		const cookie = await mintAccessCookieHeader(env, 'owner@test.com', { ttlSeconds: -60 });
		const request = new Request('http://example.com', { headers: { Cookie: cookie } });

		expect(await resolveCaller(request, env)).toBeNull();
	});

	it('returns null when bea_at cookie references a non-existent user', async () => {
		const env = makeEnv();
		// User store is deliberately empty — the JWT itself verifies, but there
		// is no user record for `ghost@test.com`.
		const cookie = await mintAccessCookieHeader(env, 'ghost@test.com');
		const request = new Request('http://example.com', { headers: { Cookie: cookie } });

		expect(await resolveCaller(request, env)).toBeNull();
	});

	it('returns null when bea_at cookie references a DISABLED user', async () => {
		// Enforcement point: a valid pre-disable JWT must NOT resurrect a
		// disabled account. The server-side status check is what makes
		// disabled-user login rejection stick.
		const env = makeEnv();
		await seedUsers(env, [{ email: 'ex-employee@test.com', role: EStaffRole.EMPLOYEE, status: EUserStatus.DISABLED }]);
		const cookie = await mintAccessCookieHeader(env, 'ex-employee@test.com');
		const request = new Request('http://example.com', { headers: { Cookie: cookie } });

		expect(await resolveCaller(request, env)).toBeNull();
	});

	it('evaluates bearer after cookie failure', async () => {
		const env = makeEnv({ API_SECRET_KEY: 'valid-key' });
		await seedUsers(env, [{ email: 'owner@test.com', role: EStaffRole.OWNER }]);
		const badCookie = tamperSignature(await mintAccessCookieHeader(env, 'owner@test.com'));
		const request = new Request('http://example.com', {
			headers: {
				Cookie: badCookie,
				Authorization: 'Bearer valid-key',
			},
		});

		const caller = await resolveCaller(request, env);
		expect(caller).toEqual({ email: 'ci@service', role: EStaffRole.OWNER, via: 'bearer' });
	});

	it('evaluates dev-bypass after cookie failure', async () => {
		const env = makeEnv({ ENVIRONMENT: 'development' });
		await seedUsers(env, [{ email: 'manager@test.com', role: EStaffRole.MANAGER }]);
		const badCookie = tamperSignature(await mintAccessCookieHeader(env, 'manager@test.com'));
		const request = new Request('http://example.com', {
			headers: {
				Cookie: badCookie,
				'X-Dev-Email': 'manager@test.com',
			},
		});

		const caller = await resolveCaller(request, env);
		expect(caller).toEqual({ email: 'manager@test.com', role: EStaffRole.MANAGER, via: 'dev' });
	});

	it('treats a missing bea_at cookie the same as an invalid one (falls through)', async () => {
		const env = makeEnv({ API_SECRET_KEY: 'valid-key' });
		const request = new Request('http://example.com', {
			headers: { Authorization: 'Bearer valid-key' },
		});

		const caller = await resolveCaller(request, env);
		expect(caller).toEqual({ email: 'ci@service', role: EStaffRole.OWNER, via: 'bearer' });
	});

	it('resolves role from the current user record, not the JWT claim', async () => {
		// Server-side role authority — a stale JWT that still claims OWNER on
		// an account that has since been demoted must resolve as the current
		// role (MANAGER here), not as OWNER.
		const env = makeEnv();
		await seedUsers(env, [{ email: 'demoted@test.com', role: EStaffRole.MANAGER }]);
		const cookie = await mintAccessCookieHeader(env, 'demoted@test.com', {
			roleClaim: EStaffRole.OWNER,
		});
		const request = new Request('http://example.com', { headers: { Cookie: cookie } });

		const caller = await resolveCaller(request, env);
		expect(caller).toEqual({
			email: 'demoted@test.com',
			role: EStaffRole.MANAGER,
			via: 'cookie',
		});
	});
});

describe('resolveCaller — Path B: bearer fallback', () => {
	beforeEach(() => vi.clearAllMocks());

	it('returns OWNER caller when bearer token matches API_SECRET_KEY', async () => {
		const request = new Request('http://example.com', {
			headers: { Authorization: 'Bearer my-secret' },
		});
		const env = makeEnv({ API_SECRET_KEY: 'my-secret' });

		const caller = await resolveCaller(request, env);
		expect(caller).toEqual({ email: 'ci@service', role: EStaffRole.OWNER, via: 'bearer' });
	});

	it('returns null when bearer token does not match API_SECRET_KEY', async () => {
		const request = new Request('http://example.com', {
			headers: { Authorization: 'Bearer wrong-key' },
		});
		const env = makeEnv({ API_SECRET_KEY: 'my-secret' });
		expect(await resolveCaller(request, env)).toBeNull();
	});

	it('returns null when there is no Authorization header', async () => {
		const request = new Request('http://example.com');
		const env = makeEnv({ API_SECRET_KEY: 'my-secret' });
		expect(await resolveCaller(request, env)).toBeNull();
	});

	it('returns null when Authorization header uses a non-Bearer scheme', async () => {
		// Locks in the scheme check: even if the token bytes match
		// API_SECRET_KEY, a Basic scheme must not resolve as an OWNER caller.
		const request = new Request('http://example.com', {
			headers: { Authorization: 'Basic my-secret' },
		});
		const env = makeEnv({ API_SECRET_KEY: 'my-secret' });
		expect(await resolveCaller(request, env)).toBeNull();
	});

	it('returns null when API_SECRET_KEY is not configured', async () => {
		const request = new Request('http://example.com', {
			headers: { Authorization: 'Bearer anything' },
		});
		const env = makeEnv({ API_SECRET_KEY: '' });
		expect(await resolveCaller(request, env)).toBeNull();
	});
});

describe('resolveCaller — Path C: dev bypass', () => {
	beforeEach(() => vi.clearAllMocks());

	it('returns null when X-Dev-Email is absent in dev mode', async () => {
		const env = makeEnv({ ENVIRONMENT: 'development' });
		await seedUsers(env, [{ email: 'owner@test.com', role: EStaffRole.OWNER }]);
		const request = new Request('http://example.com');
		expect(await resolveCaller(request, env)).toBeNull();
	});

	it('returns caller when email matches an ACTIVE user record', async () => {
		const env = makeEnv({ ENVIRONMENT: 'development' });
		await seedUsers(env, [{ email: 'manager@test.com', role: EStaffRole.MANAGER }]);
		const request = new Request('http://example.com', {
			headers: { 'X-Dev-Email': 'manager@test.com' },
		});
		const caller = await resolveCaller(request, env);
		expect(caller).toEqual({ email: 'manager@test.com', role: EStaffRole.MANAGER, via: 'dev' });
	});

	it('returns null when X-Dev-Email matches a DISABLED user record', async () => {
		// Same status gate the cookie path enforces — a disabled user cannot
		// be resurrected via the dev-bypass header.
		const env = makeEnv({ ENVIRONMENT: 'development' });
		await seedUsers(env, [{ email: 'ex-employee@test.com', role: EStaffRole.EMPLOYEE, status: EUserStatus.DISABLED }]);
		const request = new Request('http://example.com', {
			headers: { 'X-Dev-Email': 'ex-employee@test.com' },
		});
		expect(await resolveCaller(request, env)).toBeNull();
	});

	it('returns OWNER via OWNER_EMAILS fallback when no user record exists', async () => {
		// Bootstrap-flow escape hatch: the very first dev-loop request
		// succeeds before any user records exist.
		const env = makeEnv({
			ENVIRONMENT: 'development',
			OWNER_EMAILS: 'bootstrap@test.com,other@test.com',
		});
		const request = new Request('http://example.com', {
			headers: { 'X-Dev-Email': 'bootstrap@test.com' },
		});
		const caller = await resolveCaller(request, env);
		expect(caller).toEqual({ email: 'bootstrap@test.com', role: EStaffRole.OWNER, via: 'dev' });
	});

	it('returns null when email is in neither user store nor OWNER_EMAILS', async () => {
		const env = makeEnv({
			ENVIRONMENT: 'development',
			OWNER_EMAILS: 'bootstrap@test.com',
		});
		await seedUsers(env, [{ email: 'owner@test.com', role: EStaffRole.OWNER }]);
		const request = new Request('http://example.com', {
			headers: { 'X-Dev-Email': 'random@test.com' },
		});
		expect(await resolveCaller(request, env)).toBeNull();
	});

	it('does not apply dev bypass in production even with X-Dev-Email', async () => {
		const env = makeEnv({ ENVIRONMENT: 'production' });
		await seedUsers(env, [{ email: 'owner@test.com', role: EStaffRole.OWNER }]);
		const request = new Request('http://example.com', {
			headers: { 'X-Dev-Email': 'owner@test.com' },
		});
		expect(await resolveCaller(request, env)).toBeNull();
	});

	it('is case-insensitive for user lookup via getUser', async () => {
		const env = makeEnv({ ENVIRONMENT: 'development' });
		await seedUsers(env, [{ email: 'owner@test.com', role: EStaffRole.OWNER }]);
		const request = new Request('http://example.com', {
			headers: { 'X-Dev-Email': 'OWNER@TEST.COM' },
		});
		const caller = await resolveCaller(request, env);
		expect(caller?.role).toBe(EStaffRole.OWNER);
		expect(caller?.email).toBe('owner@test.com');
	});

	it('OWNER_EMAILS fallback is case-insensitive', async () => {
		const env = makeEnv({
			ENVIRONMENT: 'development',
			OWNER_EMAILS: 'bootstrap@test.com',
		});
		const request = new Request('http://example.com', {
			headers: { 'X-Dev-Email': 'BOOTSTRAP@TEST.COM' },
		});
		const caller = await resolveCaller(request, env);
		expect(caller?.role).toBe(EStaffRole.OWNER);
	});
});

describe('resolveCaller — ENVIRONMENT defaulting', () => {
	beforeEach(() => vi.clearAllMocks());

	it('does NOT honor X-Dev-Email when ENVIRONMENT is undefined (treated as production)', async () => {
		// Fail-safe default: a binding missing from wrangler.jsonc must not
		// open the dev-bypass door. Build env without the ENVIRONMENT key.
		const env = {
			ALLOWED_ORIGINS: '*',
			API_SECRET_KEY: 'k',
			JWT_SIGNING_SECRET: 'test-secret-value-abc-123-must-be-at-least-32-bytes-decoded',
			OWNER_EMAILS: 'owner@test.com',
			CONTENT_KV: makeKv(),
		} as unknown as Env;
		await seedUsers(env, [{ email: 'owner@test.com', role: EStaffRole.OWNER }]);
		const request = new Request('http://example.com', {
			headers: { 'X-Dev-Email': 'owner@test.com' },
		});
		expect(await resolveCaller(request, env)).toBeNull();
	});

	it('does NOT honor X-Dev-Email when ENVIRONMENT is the empty string', async () => {
		const env = makeEnv({ ENVIRONMENT: '' });
		await seedUsers(env, [{ email: 'owner@test.com', role: EStaffRole.OWNER }]);
		const request = new Request('http://example.com', {
			headers: { 'X-Dev-Email': 'owner@test.com' },
		});
		expect(await resolveCaller(request, env)).toBeNull();
	});

	it('honors X-Dev-Email when ENVIRONMENT is "DEVELOPMENT" (case-insensitive)', async () => {
		const env = makeEnv({ ENVIRONMENT: 'DEVELOPMENT' });
		await seedUsers(env, [{ email: 'owner@test.com', role: EStaffRole.OWNER }]);
		const request = new Request('http://example.com', {
			headers: { 'X-Dev-Email': 'owner@test.com' },
		});
		const caller = await resolveCaller(request, env);
		expect(caller?.role).toBe(EStaffRole.OWNER);
	});
});
