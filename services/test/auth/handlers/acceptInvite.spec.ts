import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EStaffRole, EUserStatus, type IAuthPolicy, type IInvite, type IRefreshFamily, type IUser } from '@bee-epic/shared';
import acceptInviteHandler from '../../../src/auth/handlers/acceptInvite';
import { createUser, getUser } from '../../../src/auth/repo/userRepo';
import { createInvite, getInvite } from '../../../src/auth/repo/inviteRepo';
import { listForEmail } from '../../../src/auth/repo/refreshFamilyRepo';
import * as policyRepo from '../../../src/auth/repo/policyRepo';
import { putPolicy, _clearCacheForTests } from '../../../src/auth/repo/policyRepo';
import { verifyJwt } from '../../../src/auth/crypto/jwt';

// vi.mock is hoisted; we keep the real implementations but expose the
// module's exports so individual tests can override with mockImplementationOnce
// (e.g. to force getPolicy to throw and prove the invite is preserved).
vi.mock('../../../src/auth/repo/policyRepo', async (importOriginal) => {
	const actual = await importOriginal<typeof import('../../../src/auth/repo/policyRepo')>();
	return { ...actual };
});

/**
 * In-memory KV mock — mirrors services/test/auth/handlers/login.spec.ts.
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
		ENVIRONMENT: 'production',
		JWT_SIGNING_SECRET: 'test-secret-value-abc-123',
	} as unknown as Env;
}

/**
 * Store a policy that turns off HIBP so tests never touch the network. Length
 * floor stays at 8 (schema-enforced).
 */
async function seedRelaxedPolicy(env: Env): Promise<void> {
	const policy: IAuthPolicy = {
		schemaVersion: 1,
		minLength: 8,
		checkBreachCorpus: false,
		notifyOnPasswordChange: true,
		updatedAt: Date.now(),
		updatedBy: 'test@example.com',
	};
	await putPolicy(env, policy);
}

async function buildInvitedUser(overrides: Partial<IUser> = {}): Promise<IUser> {
	const now = Date.now();
	return {
		schemaVersion: 1,
		email: 'invitee@example.com',
		displayName: 'Pre-Seeded Name',
		role: EStaffRole.EMPLOYEE,
		status: EUserStatus.INVITED,
		passwordHash: null,
		createdAt: now,
		updatedAt: now,
		lastLoginAt: null,
		lastLoginIp: null,
		...overrides,
	};
}

function buildInvite(overrides: Partial<IInvite> = {}): IInvite {
	const now = Date.now();
	return {
		schemaVersion: 1,
		token: 'invite-token-abc',
		email: 'invitee@example.com',
		role: EStaffRole.EMPLOYEE,
		displayName: 'Invited Display',
		invitedBy: 'owner@example.com',
		createdAt: now,
		expiresAt: now + 60_000,
		...overrides,
	};
}

function buildAcceptRequest(body: unknown): Request {
	return new Request('https://admin.example.com/auth/accept-invite', {
		method: 'POST',
		headers: {
			Origin: 'https://admin.example.com',
			'Content-Type': 'application/json',
		},
		body: JSON.stringify(body),
	});
}

const STRONG_PASSWORD = 'zebra-quilt-plum-9';

describe('POST /auth/accept-invite', () => {
	beforeEach(() => {
		vi.spyOn(console, 'warn').mockImplementation(() => undefined);
		_clearCacheForTests();
	});

	it('happy path: INVITED user + valid invite + strong password + body displayName → 200 caller returned, user flipped ACTIVE, invite consumed, family created', async () => {
		const env = makeEnv();
		await seedRelaxedPolicy(env);
		await createUser(env, await buildInvitedUser());
		await createInvite(env, buildInvite());

		const response = await acceptInviteHandler.fetch(
			buildAcceptRequest({
				token: 'invite-token-abc',
				password: STRONG_PASSWORD,
				displayName: 'Chosen Name',
			}),
			env,
		);
		expect(response.status).toBe(200);
		const body = (await response.json()) as {
			ok: boolean;
			data: { caller: { email: string; role: string; displayName: string } };
		};
		expect(body.ok).toBe(true);
		expect(body.data.caller.email).toBe('invitee@example.com');
		expect(body.data.caller.role).toBe(EStaffRole.EMPLOYEE);
		expect(body.data.caller.displayName).toBe('Chosen Name');

		const setCookie = (response.headers as unknown as { getSetCookie?: () => string[] }).getSetCookie?.() ?? [];
		expect(setCookie.some((c) => c.startsWith('bea_at='))).toBe(true);
		expect(setCookie.some((c) => c.startsWith('bea_rt='))).toBe(true);

		const stored = await getUser(env, 'invitee@example.com');
		expect(stored?.status).toBe(EUserStatus.ACTIVE);
		expect(stored?.passwordHash).toBeTruthy();
		expect(stored?.displayName).toBe('Chosen Name');

		// invite must be consumed
		expect(await env.CONTENT_KV.get('invite:invite-token-abc')).toBeNull();

		// refresh family exists
		const families: IRefreshFamily[] = await listForEmail(env, 'invitee@example.com');
		expect(families.length).toBe(1);
	});

	it('displayName fallback: body omits → uses invite.displayName', async () => {
		const env = makeEnv();
		await seedRelaxedPolicy(env);
		await createUser(env, await buildInvitedUser({ displayName: 'Pre-Seeded' }));
		await createInvite(env, buildInvite({ displayName: 'Invited Display' }));

		const response = await acceptInviteHandler.fetch(buildAcceptRequest({ token: 'invite-token-abc', password: STRONG_PASSWORD }), env);
		expect(response.status).toBe(200);
		const stored = await getUser(env, 'invitee@example.com');
		expect(stored?.displayName).toBe('Invited Display');
	});

	it('displayName fallback: body + invite omit → uses existing user.displayName', async () => {
		const env = makeEnv();
		await seedRelaxedPolicy(env);
		await createUser(env, await buildInvitedUser({ displayName: 'Pre-Seeded Name' }));
		await createInvite(env, buildInvite({ displayName: undefined }));

		const response = await acceptInviteHandler.fetch(buildAcceptRequest({ token: 'invite-token-abc', password: STRONG_PASSWORD }), env);
		expect(response.status).toBe(200);
		const stored = await getUser(env, 'invitee@example.com');
		expect(stored?.displayName).toBe('Pre-Seeded Name');
	});

	it('displayName fallback: create path with no existing user + no invite displayName + no body → uses "User"', async () => {
		const env = makeEnv();
		await seedRelaxedPolicy(env);
		await createInvite(
			env,
			buildInvite({
				token: 'fresh-token',
				email: 'brand-new@example.com',
				displayName: undefined,
				role: EStaffRole.VENDOR,
			}),
		);

		const response = await acceptInviteHandler.fetch(buildAcceptRequest({ token: 'fresh-token', password: STRONG_PASSWORD }), env);
		expect(response.status).toBe(200);
		const stored = await getUser(env, 'brand-new@example.com');
		expect(stored?.displayName).toBe('User');
		expect(stored?.status).toBe(EUserStatus.ACTIVE);
		expect(stored?.role).toBe(EStaffRole.VENDOR);
	});

	it('missing token → 400 VALIDATION_FAILED with fields.token', async () => {
		const env = makeEnv();
		await seedRelaxedPolicy(env);
		const response = await acceptInviteHandler.fetch(buildAcceptRequest({ password: STRONG_PASSWORD }), env);
		expect(response.status).toBe(400);
		const body = (await response.json()) as {
			error: { code: string; fields: Record<string, string> };
		};
		expect(body.error.code).toBe('VALIDATION_FAILED');
		expect(body.error.fields.token).toBeDefined();
	});

	it('missing password → 400 VALIDATION_FAILED with fields.password', async () => {
		const env = makeEnv();
		await seedRelaxedPolicy(env);
		const response = await acceptInviteHandler.fetch(buildAcceptRequest({ token: 'x' }), env);
		expect(response.status).toBe(400);
		const body = (await response.json()) as {
			error: { code: string; fields: Record<string, string> };
		};
		expect(body.error.code).toBe('VALIDATION_FAILED');
		expect(body.error.fields.password).toBeDefined();
	});

	it('weak password does NOT consume the invite (allows retry with stronger password)', async () => {
		const env = makeEnv();
		await seedRelaxedPolicy(env);
		await createUser(env, await buildInvitedUser());
		await createInvite(env, buildInvite());

		const response = await acceptInviteHandler.fetch(buildAcceptRequest({ token: 'invite-token-abc', password: 'short' }), env);
		expect(response.status).toBe(400);
		const body = (await response.json()) as { error: { code: string; reasons: string[] } };
		expect(body.error.code).toBe('WEAK_PASSWORD');
		expect(Array.isArray(body.error.reasons)).toBe(true);
		expect(body.error.reasons.length).toBeGreaterThan(0);

		// validate-then-consume: invite is PRESERVED so the user can retry
		// with a stronger password.
		const stillThere = await env.CONTENT_KV.get('invite:invite-token-abc');
		expect(stillThere).not.toBeNull();
		const invite = await getInvite(env, 'invite-token-abc');
		expect(invite).not.toBeNull();
		expect(invite?.email).toBe('invitee@example.com');
	});

	it('invalid token (never existed) → 400 INVALID_TOKEN', async () => {
		const env = makeEnv();
		await seedRelaxedPolicy(env);
		const response = await acceptInviteHandler.fetch(buildAcceptRequest({ token: 'no-such-token', password: STRONG_PASSWORD }), env);
		expect(response.status).toBe(400);
		const body = (await response.json()) as { error: { code: string } };
		expect(body.error.code).toBe('INVALID_TOKEN');
	});

	it('expired invite → 400 INVALID_TOKEN (repo collapses expired-vs-missing)', async () => {
		const env = makeEnv();
		await seedRelaxedPolicy(env);
		await createUser(env, await buildInvitedUser());
		// Manually put an already-expired invite bypassing createInvite's TTL clamp.
		const expired: IInvite = buildInvite({ expiresAt: Date.now() - 1_000 });
		await env.CONTENT_KV.put(`invite:${expired.token}`, JSON.stringify(expired));

		const response = await acceptInviteHandler.fetch(buildAcceptRequest({ token: expired.token, password: STRONG_PASSWORD }), env);
		expect(response.status).toBe(400);
		const body = (await response.json()) as { error: { code: string } };
		expect(body.error.code).toBe('INVALID_TOKEN');
	});

	it('user already ACTIVE → 409 USER_ALREADY_ACTIVE (invite preserved — status check runs before consume)', async () => {
		const env = makeEnv();
		await seedRelaxedPolicy(env);
		await createUser(env, await buildInvitedUser({ status: EUserStatus.ACTIVE, passwordHash: 'existing' }));
		await createInvite(env, buildInvite());

		const response = await acceptInviteHandler.fetch(buildAcceptRequest({ token: 'invite-token-abc', password: STRONG_PASSWORD }), env);
		expect(response.status).toBe(409);
		const body = (await response.json()) as { error: { code: string } };
		expect(body.error.code).toBe('USER_ALREADY_ACTIVE');
		// Status check now runs BEFORE consume: invite is untouched.
		expect(await env.CONTENT_KV.get('invite:invite-token-abc')).not.toBeNull();
	});

	it('user DISABLED → 400 INVALID_TOKEN (invite preserved — status check runs before consume)', async () => {
		const env = makeEnv();
		await seedRelaxedPolicy(env);
		await createUser(env, await buildInvitedUser({ status: EUserStatus.DISABLED }));
		await createInvite(env, buildInvite());

		const response = await acceptInviteHandler.fetch(buildAcceptRequest({ token: 'invite-token-abc', password: STRONG_PASSWORD }), env);
		expect(response.status).toBe(400);
		const body = (await response.json()) as { error: { code: string } };
		expect(body.error.code).toBe('INVALID_TOKEN');
		// Status check now runs BEFORE consume: invite is untouched.
		expect(await env.CONTENT_KV.get('invite:invite-token-abc')).not.toBeNull();
	});

	it('fresh path: invite for new email, no seeded user → 200, user created ACTIVE with invite role, family exists', async () => {
		const env = makeEnv();
		await seedRelaxedPolicy(env);
		await createInvite(
			env,
			buildInvite({
				token: 'fresh-2',
				email: 'newuser@example.com',
				role: EStaffRole.OWNER,
				displayName: 'From Invite',
			}),
		);

		const response = await acceptInviteHandler.fetch(buildAcceptRequest({ token: 'fresh-2', password: STRONG_PASSWORD }), env);
		expect(response.status).toBe(200);
		const stored = await getUser(env, 'newuser@example.com');
		expect(stored).toBeTruthy();
		expect(stored?.status).toBe(EUserStatus.ACTIVE);
		expect(stored?.role).toBe(EStaffRole.OWNER);
		expect(stored?.displayName).toBe('From Invite');
		expect(stored?.passwordHash).toBeTruthy();

		const families = await listForEmail(env, 'newuser@example.com');
		expect(families.length).toBe(1);
	});

	it('no handler-level rate limiter: acceptInvite works when env.RATE_LIMITER is absent (spec has no per-token bucket)', async () => {
		// Explicitly omit RATE_LIMITER — login.ts adds a per-(ip,email) limiter
		// even without one via a guard; acceptInvite must not add a similar
		// handler-level limiter that would need the DO to exist. This test
		// simply confirms the handler still succeeds with no limiter binding.
		const env = makeEnv();
		expect((env as unknown as { RATE_LIMITER?: unknown }).RATE_LIMITER).toBeUndefined();
		await seedRelaxedPolicy(env);
		await createUser(env, await buildInvitedUser());
		await createInvite(env, buildInvite());

		const response = await acceptInviteHandler.fetch(
			buildAcceptRequest({
				token: 'invite-token-abc',
				password: STRONG_PASSWORD,
			}),
			env,
		);
		expect(response.status).toBe(200);
	});

	it('invite role overrides existing INVITED user role (re-invite with role change)', async () => {
		// Seed an INVITED user with role=EMPLOYEE (a stale invite went out and
		// expired), then a fresh invite with role=MANAGER (OWNER's new intent).
		const env = makeEnv();
		await seedRelaxedPolicy(env);
		await createUser(env, await buildInvitedUser({ role: EStaffRole.EMPLOYEE }));
		await createInvite(env, buildInvite({ role: EStaffRole.MANAGER }));

		const response = await acceptInviteHandler.fetch(
			buildAcceptRequest({
				token: 'invite-token-abc',
				password: STRONG_PASSWORD,
			}),
			env,
		);
		expect(response.status).toBe(200);

		// User record now reflects the invite's role, not the pre-existing one.
		const stored = await getUser(env, 'invitee@example.com');
		expect(stored?.role).toBe(EStaffRole.MANAGER);
		expect(stored?.status).toBe(EUserStatus.ACTIVE);

		// Response body's caller.role reflects the new role.
		const body = (await response.json()) as {
			ok: boolean;
			data: { caller: { email: string; role: string; displayName: string } };
		};
		expect(body.data.caller.role).toBe(EStaffRole.MANAGER);

		// Access JWT signs the new role.
		const setCookie = (response.headers as unknown as { getSetCookie?: () => string[] }).getSetCookie?.() ?? [];
		const atCookie = setCookie.find((c) => c.startsWith('bea_at='));
		expect(atCookie).toBeDefined();
		const accessToken = atCookie!.split(';')[0].slice('bea_at='.length);
		const payload = await verifyJwt(accessToken, env.JWT_SIGNING_SECRET, 'access');
		expect(payload).not.toBeNull();
		expect(payload?.role).toBe(EStaffRole.MANAGER);
	});

	it('getPolicy failure preserves the invite (validate-then-consume)', async () => {
		const env = makeEnv();
		await seedRelaxedPolicy(env);
		await createUser(env, await buildInvitedUser());
		await createInvite(env, buildInvite());

		// Force getPolicy to throw once — simulating a transient KV or parse
		// blowup that escapes the repo's normal fail-open default. Under the
		// new ordering, this must NOT consume the invite.
		vi.spyOn(policyRepo, 'getPolicy').mockRejectedValueOnce(new Error('kv boom'));

		const response = await acceptInviteHandler.fetch(
			buildAcceptRequest({
				token: 'invite-token-abc',
				password: STRONG_PASSWORD,
			}),
			env,
		);
		expect(response.status).toBe(500);
		const body = (await response.json()) as { error: { code: string } };
		expect(body.error.code).toBe('INTERNAL');

		// Invite is still there — the OWNER's onboarding link survives the blip.
		const stillThere = await env.CONTENT_KV.get('invite:invite-token-abc');
		expect(stillThere).not.toBeNull();
		const invite = await getInvite(env, 'invite-token-abc');
		expect(invite).not.toBeNull();

		// User is still INVITED — no ACTIVE flip happened.
		const stored = await getUser(env, 'invitee@example.com');
		expect(stored?.status).toBe(EUserStatus.INVITED);
		expect(stored?.passwordHash).toBeNull();
	});
});
