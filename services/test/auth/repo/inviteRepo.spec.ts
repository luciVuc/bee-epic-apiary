import { describe, it, expect, vi, beforeEach } from 'vitest';
import { consumeInvite, createInvite, getInvite, invalidateForEmail } from '../../../src/auth/repo/inviteRepo';
import { EStaffRole, INVITE_TTL_MS, type IInvite } from '@bee-epic/shared';

/**
 * In-memory KV mock that backs get/put/delete/list with a single Map and
 * records the per-put options bag so we can assert on `expirationTtl`.
 *
 * `pageSize` lets a test force `list` to paginate — same shape as the helper
 * in userRepo.spec.ts (copy-pasted intentionally; extraction is Phase 6).
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

function buildInvite(overrides: Partial<IInvite> = {}): IInvite {
	const now = Date.now();
	return {
		schemaVersion: 1,
		token: 'tok-abc123',
		email: 'alice@example.com',
		role: EStaffRole.MANAGER,
		displayName: 'Alice',
		invitedBy: 'owner@example.com',
		createdAt: now,
		expiresAt: now + INVITE_TTL_MS,
		...overrides,
	};
}

describe('inviteRepo', () => {
	let warnSpy: ReturnType<typeof vi.spyOn>;

	beforeEach(() => {
		warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
	});

	describe('createInvite', () => {
		it('stores invite:<token> and getInvite round-trips the same shape', async () => {
			const env = makeEnv();
			const invite = buildInvite();
			await createInvite(env, invite);
			const round = await getInvite(env, invite.token);
			expect(round).toEqual(invite);
		});

		it('passes expirationTtl to KV.put within the 7-day envelope', async () => {
			const env = makeEnv();
			const invite = buildInvite();
			await createInvite(env, invite);
			const putSpy = env.CONTENT_KV.put as unknown as ReturnType<typeof vi.fn>;
			expect(putSpy).toHaveBeenCalled();
			const call = putSpy.mock.calls[0];
			// Call shape: (key, value, options?)
			expect(call[0]).toBe(`invite:${invite.token}`);
			const options = call[2] as { expirationTtl?: number } | undefined;
			expect(options).toBeDefined();
			expect(typeof options!.expirationTtl).toBe('number');
			expect(options!.expirationTtl).toBeGreaterThanOrEqual(1);
			expect(options!.expirationTtl).toBeLessThanOrEqual(7 * 24 * 3600);
		});

		it('clamps expirationTtl to >= 1 when expiresAt is imminent', async () => {
			const env = makeEnv();
			// 100ms in the future → ceil(0.1) = 1 second, but the clamp also covers
			// the case where expiresAt has already passed by call time.
			const invite = buildInvite({ expiresAt: Date.now() + 100 });
			await createInvite(env, invite);
			const putSpy = env.CONTENT_KV.put as unknown as ReturnType<typeof vi.fn>;
			const options = putSpy.mock.calls[0][2] as { expirationTtl: number };
			expect(options.expirationTtl).toBe(1);
		});
	});

	describe('getInvite', () => {
		it('returns null for a missing token', async () => {
			const env = makeEnv();
			expect(await getInvite(env, 'no-such-token')).toBeNull();
		});

		it('returns null and warns for a corrupt record', async () => {
			const env = makeEnv();
			await env.CONTENT_KV.put('invite:bad', '{not-valid-json');
			const result = await getInvite(env, 'bad');
			expect(result).toBeNull();
			expect(warnSpy).toHaveBeenCalled();
		});

		it('returns null and warns for a schema-invalid record (valid JSON, wrong shape)', async () => {
			const env = makeEnv();
			await env.CONTENT_KV.put('invite:wrong-shape', JSON.stringify({ token: 'wrong-shape' }));
			const result = await getInvite(env, 'wrong-shape');
			expect(result).toBeNull();
			expect(warnSpy).toHaveBeenCalled();
		});

		it('returns null for an expired invite and best-effort deletes the stale record', async () => {
			const env = makeEnv();
			const expired = buildInvite({ token: 'old', expiresAt: Date.now() - 1000 });
			// Manually put so we bypass createInvite's TTL-clamping path.
			await env.CONTENT_KV.put('invite:old', JSON.stringify(expired));
			const deleteSpy = env.CONTENT_KV.delete as unknown as ReturnType<typeof vi.fn>;
			deleteSpy.mockClear();
			const result = await getInvite(env, 'old');
			expect(result).toBeNull();
			// fire-and-forget delete: flush microtasks so the promise settles.
			await Promise.resolve();
			await Promise.resolve();
			expect(deleteSpy).toHaveBeenCalledWith('invite:old');
		});
	});

	describe('consumeInvite', () => {
		it('returns the invite and deletes the key', async () => {
			const env = makeEnv();
			const invite = buildInvite();
			await createInvite(env, invite);
			const consumed = await consumeInvite(env, invite.token);
			expect(consumed).toEqual(invite);
			expect(await getInvite(env, invite.token)).toBeNull();
		});

		it('returns null for a missing token without throwing', async () => {
			const env = makeEnv();
			await expect(consumeInvite(env, 'ghost-token')).resolves.toBeNull();
		});

		it('returns null for an expired token (and the stale record is gone)', async () => {
			const env = makeEnv();
			const expired = buildInvite({ token: 'old', expiresAt: Date.now() - 1000 });
			await env.CONTENT_KV.put('invite:old', JSON.stringify(expired));
			const result = await consumeInvite(env, 'old');
			expect(result).toBeNull();
			// getInvite's stale-cleanup path should have evicted it already; flush
			// microtasks then confirm.
			await Promise.resolve();
			await Promise.resolve();
			expect(await env.CONTENT_KV.get('invite:old')).toBeNull();
		});
	});

	describe('invalidateForEmail', () => {
		it('deletes only invites whose email matches', async () => {
			const env = makeEnv();
			await createInvite(env, buildInvite({ token: 't1', email: 'alice@example.com' }));
			await createInvite(env, buildInvite({ token: 't2', email: 'alice@example.com' }));
			await createInvite(env, buildInvite({ token: 't3', email: 'bob@example.com' }));
			const removed = await invalidateForEmail(env, 'alice@example.com');
			expect(removed).toBe(2);
			expect(await getInvite(env, 't1')).toBeNull();
			expect(await getInvite(env, 't2')).toBeNull();
			expect(await getInvite(env, 't3')).not.toBeNull();
		});

		it('is case-insensitive on the email comparison', async () => {
			const env = makeEnv();
			await createInvite(env, buildInvite({ token: 't1', email: 'alice@example.com' }));
			await createInvite(env, buildInvite({ token: 't2', email: 'alice@example.com' }));
			const removed = await invalidateForEmail(env, 'ALICE@EXAMPLE.COM');
			expect(removed).toBe(2);
			expect(await getInvite(env, 't1')).toBeNull();
			expect(await getInvite(env, 't2')).toBeNull();
		});

		it('paginates the prefix scan', async () => {
			// pageSize=2 forces 3 list() calls for 5 records: 2 + 2 + 1.
			const env = makeEnv(2);
			for (const t of ['t1', 't2', 't3', 't4', 't5']) {
				await createInvite(env, buildInvite({ token: t, email: 'alice@example.com' }));
			}
			const listSpy = env.CONTENT_KV.list as unknown as ReturnType<typeof vi.fn>;
			listSpy.mockClear();
			const removed = await invalidateForEmail(env, 'alice@example.com');
			expect(removed).toBe(5);
			expect(listSpy.mock.calls.length).toBeGreaterThanOrEqual(2);
			for (const t of ['t1', 't2', 't3', 't4', 't5']) {
				expect(await getInvite(env, t)).toBeNull();
			}
		});
	});
});
