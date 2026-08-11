import { describe, it, expect, vi, beforeEach } from 'vitest';
import { consumeReset, createReset, getReset, invalidateForEmail } from '../../../src/auth/repo/resetRepo';
import { RESET_TTL_MS, type IPasswordReset } from '@bee-epic/shared';

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

function buildReset(overrides: Partial<IPasswordReset> = {}): IPasswordReset {
	const now = Date.now();
	return {
		schemaVersion: 1,
		token: 'tok-abc123',
		email: 'alice@example.com',
		createdAt: now,
		expiresAt: now + RESET_TTL_MS,
		...overrides,
	};
}

describe('resetRepo', () => {
	let warnSpy: ReturnType<typeof vi.spyOn>;

	beforeEach(() => {
		warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
	});

	describe('createReset', () => {
		it('stores pwreset:<token> and getReset round-trips the same shape', async () => {
			const env = makeEnv();
			const reset = buildReset();
			await createReset(env, reset);
			const round = await getReset(env, reset.token);
			expect(round).toEqual(reset);
		});

		it('passes expirationTtl to KV.put within the 1-hour envelope', async () => {
			const env = makeEnv();
			const reset = buildReset();
			await createReset(env, reset);
			const putSpy = env.CONTENT_KV.put as unknown as ReturnType<typeof vi.fn>;
			expect(putSpy).toHaveBeenCalled();
			const call = putSpy.mock.calls[0];
			// Call shape: (key, value, options?)
			expect(call[0]).toBe(`pwreset:${reset.token}`);
			const options = call[2] as { expirationTtl?: number } | undefined;
			expect(options).toBeDefined();
			expect(typeof options!.expirationTtl).toBe('number');
			expect(options!.expirationTtl).toBeGreaterThanOrEqual(1);
			expect(options!.expirationTtl).toBeLessThanOrEqual(60 * 60);
		});

		it('clamps expirationTtl to >= 1 when expiresAt is imminent', async () => {
			const env = makeEnv();
			// 100ms in the future → ceil(0.1) = 1 second, but the clamp also covers
			// the case where expiresAt has already passed by call time.
			const reset = buildReset({ expiresAt: Date.now() + 100 });
			await createReset(env, reset);
			const putSpy = env.CONTENT_KV.put as unknown as ReturnType<typeof vi.fn>;
			const options = putSpy.mock.calls[0][2] as { expirationTtl: number };
			expect(options.expirationTtl).toBe(1);
		});
	});

	describe('getReset', () => {
		it('returns null for a missing token', async () => {
			const env = makeEnv();
			expect(await getReset(env, 'no-such-token')).toBeNull();
		});

		it('returns null and warns for a corrupt record', async () => {
			const env = makeEnv();
			await env.CONTENT_KV.put('pwreset:bad', '{not-valid-json');
			const result = await getReset(env, 'bad');
			expect(result).toBeNull();
			expect(warnSpy).toHaveBeenCalled();
		});

		it('returns null and warns for a schema-invalid record (valid JSON, wrong shape)', async () => {
			const env = makeEnv();
			await env.CONTENT_KV.put('pwreset:wrong-shape', JSON.stringify({ token: 'wrong-shape' }));
			const result = await getReset(env, 'wrong-shape');
			expect(result).toBeNull();
			expect(warnSpy).toHaveBeenCalled();
		});

		it('returns null for an expired reset and best-effort deletes the stale record', async () => {
			const env = makeEnv();
			const expired = buildReset({ token: 'old', expiresAt: Date.now() - 1000 });
			// Manually put so we bypass createReset's TTL-clamping path.
			await env.CONTENT_KV.put('pwreset:old', JSON.stringify(expired));
			const deleteSpy = env.CONTENT_KV.delete as unknown as ReturnType<typeof vi.fn>;
			deleteSpy.mockClear();
			const result = await getReset(env, 'old');
			expect(result).toBeNull();
			// fire-and-forget delete: flush microtasks so the promise settles.
			await Promise.resolve();
			await Promise.resolve();
			expect(deleteSpy).toHaveBeenCalledWith('pwreset:old');
		});
	});

	describe('consumeReset', () => {
		it('returns the reset and deletes the key', async () => {
			const env = makeEnv();
			const reset = buildReset();
			await createReset(env, reset);
			const consumed = await consumeReset(env, reset.token);
			expect(consumed).toEqual(reset);
			expect(await getReset(env, reset.token)).toBeNull();
		});

		it('returns null for a missing token without throwing', async () => {
			const env = makeEnv();
			await expect(consumeReset(env, 'ghost-token')).resolves.toBeNull();
		});

		it('returns null for an expired token (and the stale record is gone)', async () => {
			const env = makeEnv();
			const expired = buildReset({ token: 'old', expiresAt: Date.now() - 1000 });
			await env.CONTENT_KV.put('pwreset:old', JSON.stringify(expired));
			const result = await consumeReset(env, 'old');
			expect(result).toBeNull();
			// getReset's stale-cleanup path should have evicted it already; flush
			// microtasks then confirm.
			await Promise.resolve();
			await Promise.resolve();
			expect(await env.CONTENT_KV.get('pwreset:old')).toBeNull();
		});
	});

	describe('invalidateForEmail', () => {
		it('deletes only resets whose email matches', async () => {
			const env = makeEnv();
			await createReset(env, buildReset({ token: 't1', email: 'alice@example.com' }));
			await createReset(env, buildReset({ token: 't2', email: 'alice@example.com' }));
			await createReset(env, buildReset({ token: 't3', email: 'bob@example.com' }));
			const removed = await invalidateForEmail(env, 'alice@example.com');
			expect(removed).toBe(2);
			expect(await getReset(env, 't1')).toBeNull();
			expect(await getReset(env, 't2')).toBeNull();
			expect(await getReset(env, 't3')).not.toBeNull();
		});

		it('is case-insensitive on the email comparison', async () => {
			const env = makeEnv();
			await createReset(env, buildReset({ token: 't1', email: 'alice@example.com' }));
			await createReset(env, buildReset({ token: 't2', email: 'alice@example.com' }));
			const removed = await invalidateForEmail(env, 'ALICE@EXAMPLE.COM');
			expect(removed).toBe(2);
			expect(await getReset(env, 't1')).toBeNull();
			expect(await getReset(env, 't2')).toBeNull();
		});

		it('paginates the prefix scan', async () => {
			// pageSize=2 forces 3 list() calls for 5 records: 2 + 2 + 1.
			const env = makeEnv(2);
			for (const t of ['t1', 't2', 't3', 't4', 't5']) {
				await createReset(env, buildReset({ token: t, email: 'alice@example.com' }));
			}
			const listSpy = env.CONTENT_KV.list as unknown as ReturnType<typeof vi.fn>;
			listSpy.mockClear();
			const removed = await invalidateForEmail(env, 'alice@example.com');
			expect(removed).toBe(5);
			expect(listSpy.mock.calls.length).toBeGreaterThanOrEqual(2);
			for (const t of ['t1', 't2', 't3', 't4', 't5']) {
				expect(await getReset(env, t)).toBeNull();
			}
		});
	});
});
