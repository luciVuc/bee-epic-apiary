import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
	createFamily,
	deleteAllForEmail,
	deleteFamily,
	getFamily,
	listForEmail,
	rotateFamily,
} from '../../../src/auth/repo/refreshFamilyRepo';
import { MAX_REFRESH_FAMILIES_PER_USER, REFRESH_TTL_MS, type IRefreshFamily } from '@bee-epic/shared';

/**
 * In-memory KV mock that backs get/put/delete/list with a single Map and
 * records the per-put options bag so we can assert on `expirationTtl`.
 *
 * `pageSize` lets a test force `list` to paginate — same shape as the helper
 * in inviteRepo.spec.ts (copy-pasted intentionally; extraction is Phase 6).
 */
function makeKv(pageSize?: number): KVNamespace {
	const store = new Map<string, string>();
	return {
		get: vi.fn(async (key: string) => store.get(key) ?? null),
		put: vi.fn(async (key: string, value: string, _options?: unknown) => {
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

function buildFamily(overrides: Partial<IRefreshFamily> = {}): IRefreshFamily {
	const now = Date.now();
	return {
		schemaVersion: 1,
		familyId: 'fam-abc123',
		email: 'alice@example.com',
		currentJti: 'jti-1',
		createdAt: now,
		lastRefreshedAt: now,
		expiresAt: now + REFRESH_TTL_MS,
		userAgent: 'Mozilla/5.0',
		ip: '127.0.0.1',
		...overrides,
	};
}

describe('refreshFamilyRepo', () => {
	let warnSpy: ReturnType<typeof vi.spyOn>;

	beforeEach(() => {
		warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
	});

	describe('getFamily', () => {
		it('returns null for a missing family', async () => {
			const env = makeEnv();
			expect(await getFamily(env, 'alice@example.com', 'no-such-fam')).toBeNull();
		});

		it('returns null and warns for a corrupt record', async () => {
			const env = makeEnv();
			await env.CONTENT_KV.put('refresh:alice@example.com:bad', '{not-valid-json');
			const result = await getFamily(env, 'alice@example.com', 'bad');
			expect(result).toBeNull();
			expect(warnSpy).toHaveBeenCalled();
		});

		it('returns null and warns for a schema-invalid record', async () => {
			const env = makeEnv();
			await env.CONTENT_KV.put('refresh:alice@example.com:wrong', JSON.stringify({ familyId: 'wrong' }));
			const result = await getFamily(env, 'alice@example.com', 'wrong');
			expect(result).toBeNull();
			expect(warnSpy).toHaveBeenCalled();
		});

		it('returns null for an expired family and best-effort deletes the stale record', async () => {
			const env = makeEnv();
			const expired = buildFamily({
				familyId: 'old',
				expiresAt: Date.now() - 1000,
			});
			await env.CONTENT_KV.put('refresh:alice@example.com:old', JSON.stringify(expired));
			const deleteSpy = env.CONTENT_KV.delete as unknown as ReturnType<typeof vi.fn>;
			deleteSpy.mockClear();
			const result = await getFamily(env, 'alice@example.com', 'old');
			expect(result).toBeNull();
			// fire-and-forget delete: flush microtasks so the promise settles.
			await Promise.resolve();
			await Promise.resolve();
			expect(deleteSpy).toHaveBeenCalledWith('refresh:alice@example.com:old');
		});

		it('lowercases email on lookup', async () => {
			const env = makeEnv();
			const family = buildFamily({ familyId: 'f1', email: 'alice@example.com' });
			await env.CONTENT_KV.put('refresh:alice@example.com:f1', JSON.stringify(family));
			const result = await getFamily(env, 'ALICE@EXAMPLE.COM', 'f1');
			expect(result).toEqual(family);
		});
	});

	describe('createFamily', () => {
		it('writes refresh:<email-lower>:<familyId> — round-trips via getFamily', async () => {
			const env = makeEnv();
			const family = buildFamily();
			await createFamily(env, family);
			const round = await getFamily(env, family.email, family.familyId);
			expect(round).toEqual(family);
		});

		it('passes expirationTtl to KV.put bounded by REFRESH_TTL_MS', async () => {
			const env = makeEnv();
			const family = buildFamily();
			await createFamily(env, family);
			const putSpy = env.CONTENT_KV.put as unknown as ReturnType<typeof vi.fn>;
			expect(putSpy).toHaveBeenCalled();
			const call = putSpy.mock.calls[0];
			expect(call[0]).toBe(`refresh:${family.email}:${family.familyId}`);
			const options = call[2] as { expirationTtl?: number } | undefined;
			expect(options).toBeDefined();
			expect(typeof options!.expirationTtl).toBe('number');
			expect(options!.expirationTtl).toBeGreaterThanOrEqual(1);
			expect(options!.expirationTtl).toBeLessThanOrEqual(30 * 24 * 3600);
		});

		it('stores email lowercased even if caller passes mixed case', async () => {
			const env = makeEnv();
			const family = buildFamily({
				familyId: 'mixed',
				email: 'Alice@Example.COM',
			});
			await createFamily(env, family);
			// Key must be lowercased
			const raw = await env.CONTENT_KV.get('refresh:alice@example.com:mixed');
			expect(raw).not.toBeNull();
			const stored = JSON.parse(raw!);
			// Record email must be lowercased
			expect(stored.email).toBe('alice@example.com');
		});

		it('at exactly cap (10 existing) creates 11th and evicts the oldest', async () => {
			const env = makeEnv();
			const base = Date.now();
			// Pre-seed 10 families with strictly increasing createdAt so sort order
			// is unambiguous. The oldest is f0 (createdAt = base).
			for (let i = 0; i < MAX_REFRESH_FAMILIES_PER_USER; i++) {
				await createFamily(
					env,
					buildFamily({
						familyId: `f${i}`,
						createdAt: base + i,
						lastRefreshedAt: base + i,
					}),
				);
			}
			// Confirm we are at cap before creating the 11th.
			expect((await listForEmail(env, 'alice@example.com')).length).toBe(MAX_REFRESH_FAMILIES_PER_USER);
			// Create the 11th — should evict f0.
			await createFamily(
				env,
				buildFamily({
					familyId: 'f-new',
					createdAt: base + 1000,
					lastRefreshedAt: base + 1000,
				}),
			);
			const after = await listForEmail(env, 'alice@example.com');
			expect(after.length).toBe(MAX_REFRESH_FAMILIES_PER_USER);
			const ids = after.map((f) => f.familyId);
			expect(ids).not.toContain('f0');
			expect(ids).toContain('f-new');
		});

		it('below cap (9 existing) does not evict — 10th leaves all 10 intact', async () => {
			const env = makeEnv();
			const base = Date.now();
			for (let i = 0; i < MAX_REFRESH_FAMILIES_PER_USER - 1; i++) {
				await createFamily(
					env,
					buildFamily({
						familyId: `f${i}`,
						createdAt: base + i,
						lastRefreshedAt: base + i,
					}),
				);
			}
			expect((await listForEmail(env, 'alice@example.com')).length).toBe(9);
			await createFamily(
				env,
				buildFamily({
					familyId: 'f-tenth',
					createdAt: base + 1000,
					lastRefreshedAt: base + 1000,
				}),
			);
			const after = await listForEmail(env, 'alice@example.com');
			expect(after.length).toBe(MAX_REFRESH_FAMILIES_PER_USER);
			const ids = after.map((f) => f.familyId);
			expect(ids).toContain('f0');
			expect(ids).toContain('f-tenth');
		});

		it('recovers from over-cap state — seeding 12 then creating a 13th leaves exactly the cap', async () => {
			// Defensive: validates the `while` loop (vs. an `if`) in cap eviction.
			// A prior partial failure could have left the user over cap; one
			// createFamily call should bring them back under cap in a single pass.
			const env = makeEnv();
			const base = Date.now();
			const overSeed = MAX_REFRESH_FAMILIES_PER_USER + 2;
			// Pre-seed by bypassing createFamily's cap-eviction so we genuinely
			// land in an over-cap state. Write each record directly through KV
			// with strictly increasing createdAt for unambiguous eviction order.
			for (let i = 0; i < overSeed; i++) {
				const fam = buildFamily({
					familyId: `seed${i}`,
					createdAt: base + i,
					lastRefreshedAt: base + i,
				});
				await env.CONTENT_KV.put(`refresh:alice@example.com:${fam.familyId}`, JSON.stringify(fam));
			}
			expect((await listForEmail(env, 'alice@example.com')).length).toBe(overSeed);
			// Add a 13th via createFamily — eviction should bring us to exactly cap.
			await createFamily(
				env,
				buildFamily({
					familyId: 'f-new',
					createdAt: base + 10_000,
					lastRefreshedAt: base + 10_000,
				}),
			);
			const after = await listForEmail(env, 'alice@example.com');
			expect(after.length).toBe(MAX_REFRESH_FAMILIES_PER_USER);
			expect(after.map((f) => f.familyId)).toContain('f-new');
		});
	});

	describe('rotateFamily', () => {
		it('updates currentJti and lastRefreshedAt, preserves expiresAt', async () => {
			const env = makeEnv();
			const original = buildFamily({
				familyId: 'rot1',
				currentJti: 'old-jti',
				lastRefreshedAt: 1000,
			});
			await createFamily(env, original);
			const now = 50_000;
			const rotated = await rotateFamily(env, original.email, original.familyId, 'new-jti', now);
			expect(rotated).not.toBeNull();
			expect(rotated!.currentJti).toBe('new-jti');
			expect(rotated!.lastRefreshedAt).toBe(now);
			expect(rotated!.expiresAt).toBe(original.expiresAt);
			// Verify persisted state matches
			const reread = await getFamily(env, original.email, original.familyId);
			expect(reread).toEqual(rotated);
		});

		it('returns null on missing family', async () => {
			const env = makeEnv();
			const result = await rotateFamily(env, 'alice@example.com', 'no-such', 'new-jti', Date.now());
			expect(result).toBeNull();
		});

		it('returns null on expired family', async () => {
			const env = makeEnv();
			const expired = buildFamily({
				familyId: 'exp',
				expiresAt: Date.now() - 1000,
			});
			await env.CONTENT_KV.put('refresh:alice@example.com:exp', JSON.stringify(expired));
			const result = await rotateFamily(env, 'alice@example.com', 'exp', 'new-jti', Date.now());
			expect(result).toBeNull();
		});

		it('shrinks expirationTtl on rotate — does not extend the platform-side TTL', async () => {
			// Pins the invariant: rotation preserves expiresAt, and the put's
			// expirationTtl is recomputed against `now`, so a later rotate must
			// produce a strictly smaller TTL than the create. Catches a
			// regression that recomputes `expirationTtl` from `now + REFRESH_TTL_MS`.
			const env = makeEnv();
			const base = Date.now();
			const original = buildFamily({
				familyId: 'rot-ttl',
				createdAt: base,
				lastRefreshedAt: base,
				expiresAt: base + REFRESH_TTL_MS,
			});
			await createFamily(env, original);
			const putSpy = env.CONTENT_KV.put as unknown as ReturnType<typeof vi.fn>;
			const createCall = putSpy.mock.calls[0];
			const createTtl = (createCall[2] as { expirationTtl: number }).expirationTtl;

			// Advance wall clock so the rotate's `Date.now()` is strictly later.
			vi.useFakeTimers();
			try {
				vi.setSystemTime(base + 5000);
				const rotated = await rotateFamily(env, original.email, original.familyId, 'new-jti', base + 5000);
				expect(rotated).not.toBeNull();
				const lastCall = putSpy.mock.calls[putSpy.mock.calls.length - 1];
				const rotateTtl = (lastCall[2] as { expirationTtl: number }).expirationTtl;
				expect(rotateTtl).toBeLessThan(createTtl);
				expect(rotateTtl).toBeGreaterThanOrEqual(1);
			} finally {
				vi.useRealTimers();
			}
		});
	});

	describe('deleteFamily', () => {
		it('removes the family', async () => {
			const env = makeEnv();
			const family = buildFamily({ familyId: 'del1' });
			await createFamily(env, family);
			expect(await getFamily(env, family.email, family.familyId)).not.toBeNull();
			await deleteFamily(env, family.email, family.familyId);
			expect(await getFamily(env, family.email, family.familyId)).toBeNull();
		});

		it('is idempotent on missing family (no throw)', async () => {
			const env = makeEnv();
			await expect(deleteFamily(env, 'alice@example.com', 'ghost')).resolves.toBeUndefined();
		});
	});

	describe('deleteAllForEmail', () => {
		it('deletes all families for the email and returns count', async () => {
			const env = makeEnv();
			await createFamily(env, buildFamily({ familyId: 'f1' }));
			await createFamily(env, buildFamily({ familyId: 'f2' }));
			await createFamily(env, buildFamily({ familyId: 'f3' }));
			const removed = await deleteAllForEmail(env, 'alice@example.com');
			expect(removed).toBe(3);
			expect((await listForEmail(env, 'alice@example.com')).length).toBe(0);
		});

		it("does not delete other users' families", async () => {
			const env = makeEnv();
			await createFamily(env, buildFamily({ familyId: 'a1', email: 'alice@example.com' }));
			await createFamily(env, buildFamily({ familyId: 'a2', email: 'alice@example.com' }));
			await createFamily(env, buildFamily({ familyId: 'b1', email: 'bob@example.com' }));
			const removed = await deleteAllForEmail(env, 'alice@example.com');
			expect(removed).toBe(2);
			expect((await listForEmail(env, 'alice@example.com')).length).toBe(0);
			expect((await listForEmail(env, 'bob@example.com')).length).toBe(1);
		});

		it('paginates the prefix scan', async () => {
			const env = makeEnv(2);
			for (const id of ['f1', 'f2', 'f3', 'f4', 'f5']) {
				await createFamily(env, buildFamily({ familyId: id }));
			}
			const listSpy = env.CONTENT_KV.list as unknown as ReturnType<typeof vi.fn>;
			listSpy.mockClear();
			const removed = await deleteAllForEmail(env, 'alice@example.com');
			expect(removed).toBe(5);
			expect(listSpy.mock.calls.length).toBeGreaterThanOrEqual(2);
		});
	});

	describe('listForEmail', () => {
		it('returns families sorted by createdAt ascending', async () => {
			const env = makeEnv();
			const base = Date.now();
			// Insert in scrambled order so the natural KV listing order can't
			// accidentally satisfy the assertion.
			await createFamily(env, buildFamily({ familyId: 'mid', createdAt: base + 500 }));
			await createFamily(env, buildFamily({ familyId: 'old', createdAt: base + 100 }));
			await createFamily(env, buildFamily({ familyId: 'new', createdAt: base + 900 }));
			const list = await listForEmail(env, 'alice@example.com');
			expect(list.map((f) => f.familyId)).toEqual(['old', 'mid', 'new']);
		});

		it('skips parse failures', async () => {
			const env = makeEnv();
			await createFamily(env, buildFamily({ familyId: 'good' }));
			await env.CONTENT_KV.put('refresh:alice@example.com:corrupt', '{not-valid-json');
			await env.CONTENT_KV.put('refresh:alice@example.com:wrong', JSON.stringify({ familyId: 'wrong' }));
			const list = await listForEmail(env, 'alice@example.com');
			expect(list.length).toBe(1);
			expect(list[0].familyId).toBe('good');
		});

		it('paginates the prefix scan', async () => {
			const env = makeEnv(2);
			for (const id of ['f1', 'f2', 'f3', 'f4', 'f5']) {
				await createFamily(env, buildFamily({ familyId: id }));
			}
			const listSpy = env.CONTENT_KV.list as unknown as ReturnType<typeof vi.fn>;
			listSpy.mockClear();
			const list = await listForEmail(env, 'alice@example.com');
			expect(list.length).toBe(5);
			expect(listSpy.mock.calls.length).toBeGreaterThanOrEqual(2);
		});
	});
});
