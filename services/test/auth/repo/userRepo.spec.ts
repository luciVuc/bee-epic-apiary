import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
	countByRole,
	createUser,
	deleteUser,
	getUser,
	listUsers,
	rebuildIndex,
	toPublic,
	updateUser,
} from '../../../src/auth/repo/userRepo';
import { EStaffRole, EUserStatus, type IUser } from '@bee-epic/shared';

/**
 * In-memory KV mock that backs get/put/delete/list with a single Map.
 * Built fresh per test so that no state leaks across cases.
 *
 * `pageSize` lets a test force `list` to paginate — the mock will return at
 * most that many keys per call and signal continuation via `list_complete`
 * + an opaque numeric cursor.
 */
function makeKv(pageSize?: number): KVNamespace {
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
			const all = [...store.keys()].filter((k) => k.startsWith(prefix)).map((name) => ({ name }));
			if (!pageSize) {
				return { keys: all, list_complete: true, cursor: undefined };
			}
			const offset = cursor ? Number.parseInt(cursor, 10) : 0;
			const slice = all.slice(offset, offset + pageSize);
			const next = offset + pageSize;
			const done = next >= all.length;
			return {
				keys: slice,
				list_complete: done,
				cursor: done ? undefined : String(next),
			};
		}),
	} as unknown as KVNamespace;
}

type TestEnv = { CONTENT_KV: KVNamespace };

function makeEnv(pageSize?: number): Env {
	const env: TestEnv = { CONTENT_KV: makeKv(pageSize) };
	return env as unknown as Env;
}

function buildUser(overrides: Partial<IUser> = {}): IUser {
	const now = Date.now();
	return {
		schemaVersion: 1,
		email: 'alice@example.com',
		displayName: 'Alice',
		role: EStaffRole.OWNER,
		status: EUserStatus.ACTIVE,
		passwordHash: 'hash-value',
		createdAt: now,
		updatedAt: now,
		lastLoginAt: null,
		lastLoginIp: null,
		...overrides,
	};
}

describe('userRepo', () => {
	let warnSpy: ReturnType<typeof vi.spyOn>;

	beforeEach(() => {
		warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
	});

	describe('getUser', () => {
		it('returns null for a missing user', async () => {
			const env = makeEnv();
			expect(await getUser(env, 'nobody@example.com')).toBeNull();
		});

		it('returns null and warns for a corrupt record', async () => {
			const env = makeEnv();
			await env.CONTENT_KV.put('user:alice@example.com', '{not-valid-json');
			const result = await getUser(env, 'alice@example.com');
			expect(result).toBeNull();
			expect(warnSpy).toHaveBeenCalled();
		});

		it('returns null and warns for a schema-invalid record (valid JSON, wrong shape)', async () => {
			const env = makeEnv();
			// Valid JSON, but missing required IUser fields — exercises the safeParse
			// failure branch separately from the JSON.parse-throw branch above.
			await env.CONTENT_KV.put('user:alice@example.com', JSON.stringify({ email: 'alice@example.com' }));
			const result = await getUser(env, 'alice@example.com');
			expect(result).toBeNull();
			expect(warnSpy).toHaveBeenCalled();
		});

		it('lowercases the email on lookup', async () => {
			const env = makeEnv();
			const user = buildUser({ email: 'alice@example.com' });
			await env.CONTENT_KV.put('user:alice@example.com', JSON.stringify(user));
			const found = await getUser(env, 'Alice@Example.COM');
			expect(found).not.toBeNull();
			expect(found?.email).toBe('alice@example.com');
		});
	});

	describe('createUser', () => {
		it('writes user:<lower> and adds to user-index', async () => {
			const env = makeEnv();
			const user = buildUser();
			await createUser(env, user);
			const raw = await env.CONTENT_KV.get('user:alice@example.com');
			expect(raw).not.toBeNull();
			const indexRaw = await env.CONTENT_KV.get('user-index');
			expect(indexRaw).not.toBeNull();
			expect(JSON.parse(indexRaw!)).toContain('alice@example.com');
		});

		it('throws on duplicate email', async () => {
			const env = makeEnv();
			await createUser(env, buildUser());
			await expect(createUser(env, buildUser())).rejects.toThrow();
		});

		it('stores email lowercased even if caller passes mixed case', async () => {
			const env = makeEnv();
			const user = buildUser({ email: 'Bob@Example.COM', displayName: 'Bob' });
			await createUser(env, user);
			const raw = await env.CONTENT_KV.get('user:bob@example.com');
			expect(raw).not.toBeNull();
			const parsed = JSON.parse(raw!);
			expect(parsed.email).toBe('bob@example.com');
			const indexRaw = await env.CONTENT_KV.get('user-index');
			expect(JSON.parse(indexRaw!)).toContain('bob@example.com');
		});
	});

	describe('updateUser', () => {
		it('merges patch, bumps updatedAt, persists', async () => {
			const env = makeEnv();
			const original = buildUser({ updatedAt: 1000 });
			await createUser(env, original);
			const before = Date.now();
			const updated = await updateUser(env, 'alice@example.com', { displayName: 'Alice Renamed' });
			expect(updated.displayName).toBe('Alice Renamed');
			expect(updated.email).toBe('alice@example.com');
			expect(updated.updatedAt).toBeGreaterThanOrEqual(before);
			const raw = await env.CONTENT_KV.get('user:alice@example.com');
			const persisted = JSON.parse(raw!);
			expect(persisted.displayName).toBe('Alice Renamed');
			expect(persisted.updatedAt).toBe(updated.updatedAt);
		});

		it('throws when the user does not exist', async () => {
			const env = makeEnv();
			await expect(updateUser(env, 'ghost@example.com', { displayName: 'X' })).rejects.toThrow();
		});
	});

	describe('deleteUser', () => {
		it('removes record and index entry', async () => {
			const env = makeEnv();
			await createUser(env, buildUser());
			await deleteUser(env, 'alice@example.com');
			expect(await env.CONTENT_KV.get('user:alice@example.com')).toBeNull();
			const indexRaw = await env.CONTENT_KV.get('user-index');
			expect(JSON.parse(indexRaw!)).not.toContain('alice@example.com');
		});

		it('is idempotent on a missing user', async () => {
			const env = makeEnv();
			await expect(deleteUser(env, 'ghost@example.com')).resolves.toBeUndefined();
		});
	});

	describe('listUsers', () => {
		it('returns all non-corrupt users', async () => {
			const env = makeEnv();
			await createUser(env, buildUser({ email: 'alice@example.com' }));
			await createUser(env, buildUser({ email: 'bob@example.com', displayName: 'Bob' }));
			const users = await listUsers(env);
			expect(users.map((u) => u.email).sort()).toEqual(['alice@example.com', 'bob@example.com']);
		});

		it('skips corrupt records but keeps valid ones', async () => {
			const env = makeEnv();
			await createUser(env, buildUser({ email: 'alice@example.com' }));
			// Inject a corrupt record + manually patch the index to reference it.
			await env.CONTENT_KV.put('user:broken@example.com', '{not-valid-json');
			await env.CONTENT_KV.put('user-index', JSON.stringify(['alice@example.com', 'broken@example.com']));
			const users = await listUsers(env);
			expect(users.map((u) => u.email)).toEqual(['alice@example.com']);
		});
	});

	describe('countByRole', () => {
		it('counts only non-DISABLED users of the given role', async () => {
			const env = makeEnv();
			await createUser(env, buildUser({ email: 'owner1@example.com', role: EStaffRole.OWNER, status: EUserStatus.ACTIVE }));
			await createUser(env, buildUser({ email: 'owner2@example.com', role: EStaffRole.OWNER, status: EUserStatus.ACTIVE }));
			await createUser(env, buildUser({ email: 'owner3@example.com', role: EStaffRole.OWNER, status: EUserStatus.DISABLED }));
			await createUser(env, buildUser({ email: 'mgr@example.com', role: EStaffRole.MANAGER, status: EUserStatus.ACTIVE }));
			expect(await countByRole(env, EStaffRole.OWNER)).toBe(2);
			expect(await countByRole(env, EStaffRole.MANAGER)).toBe(1);
		});

		it('includes INVITED users (they can still complete signup and log in)', async () => {
			const env = makeEnv();
			// One ACTIVE + one INVITED OWNER, plus one DISABLED OWNER (excluded).
			await createUser(env, buildUser({ email: 'active@example.com', role: EStaffRole.OWNER, status: EUserStatus.ACTIVE }));
			await createUser(
				env,
				buildUser({
					email: 'invited@example.com',
					role: EStaffRole.OWNER,
					status: EUserStatus.INVITED,
					passwordHash: null,
				}),
			);
			await createUser(env, buildUser({ email: 'disabled@example.com', role: EStaffRole.OWNER, status: EUserStatus.DISABLED }));
			// Spec semantic: "non-DISABLED of that role" — INVITED counts.
			expect(await countByRole(env, EStaffRole.OWNER)).toBe(2);
		});
	});

	describe('rebuildIndex', () => {
		it('rebuilds the index from prefix scan', async () => {
			const env = makeEnv();
			// Manually put 3 user records.
			const u1 = buildUser({ email: 'a@example.com' });
			const u2 = buildUser({ email: 'b@example.com' });
			const u3 = buildUser({ email: 'c@example.com' });
			await env.CONTENT_KV.put('user:a@example.com', JSON.stringify(u1));
			await env.CONTENT_KV.put('user:b@example.com', JSON.stringify(u2));
			await env.CONTENT_KV.put('user:c@example.com', JSON.stringify(u3));
			// Write a stale index containing only one.
			await env.CONTENT_KV.put('user-index', JSON.stringify(['a@example.com']));
			const count = await rebuildIndex(env);
			expect(count).toBe(3);
			const users = await listUsers(env);
			expect(users.map((u) => u.email).sort()).toEqual(['a@example.com', 'b@example.com', 'c@example.com']);
		});

		it('walks every list() page when results exceed one page', async () => {
			// pageSize=2 forces three list() calls for 5 records: 2 + 2 + 1.
			const env = makeEnv(2);
			for (const email of ['a', 'b', 'c', 'd', 'e'].map((c) => `${c}@example.com`)) {
				await env.CONTENT_KV.put(`user:${email}`, JSON.stringify(buildUser({ email })));
			}
			// Spy on list() to confirm pagination actually happened.
			const listSpy = env.CONTENT_KV.list as unknown as ReturnType<typeof vi.fn>;
			const count = await rebuildIndex(env);
			expect(count).toBe(5);
			// At least 2 calls — proves the cursor loop ran more than once.
			expect(listSpy.mock.calls.length).toBeGreaterThanOrEqual(2);
			const indexRaw = await env.CONTENT_KV.get('user-index');
			expect(JSON.parse(indexRaw!).sort()).toEqual(['a@example.com', 'b@example.com', 'c@example.com', 'd@example.com', 'e@example.com']);
		});
	});

	describe('toPublic', () => {
		it('strips passwordHash', () => {
			const user = buildUser({ passwordHash: 'secret' });
			const pub = toPublic(user);
			expect((pub as Record<string, unknown>).passwordHash).toBeUndefined();
			expect(pub.email).toBe(user.email);
		});
	});
});
