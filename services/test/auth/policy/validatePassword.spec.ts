import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { validatePassword, PASSWORD_DENYLIST } from '../../../src/auth/policy/validatePassword';
import { DEFAULT_AUTH_POLICY, type IAuthPolicy } from '@bee-epic/shared';

/**
 * Helper — spread DEFAULT_AUTH_POLICY with per-test overrides so we don't
 * repeat the six field names in every case.
 */
function policyWith(overrides: Partial<IAuthPolicy> = {}): IAuthPolicy {
	return { ...DEFAULT_AUTH_POLICY, ...overrides };
}

/**
 * Compute the SHA-1 hex-uppercase of a password using WebCrypto — same path
 * production takes so tests exercise the real digest.
 */
async function sha1UpperHex(input: string): Promise<string> {
	const digest = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(input));
	const bytes = new Uint8Array(digest);
	let out = '';
	for (const b of bytes) {
		out += b.toString(16).padStart(2, '0');
	}
	return out.toUpperCase();
}

describe('validatePassword', () => {
	let warnSpy: ReturnType<typeof vi.spyOn>;

	beforeEach(() => {
		warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
	});

	afterEach(() => {
		warnSpy.mockRestore();
		vi.unstubAllGlobals();
	});

	describe('length', () => {
		it('fails when shorter than policy.minLength', async () => {
			const fetchSpy = vi.fn();
			vi.stubGlobal('fetch', fetchSpy);
			const result = await validatePassword('short', policyWith({ minLength: 12, checkBreachCorpus: false }));
			expect(result.ok).toBe(false);
			expect(result.reasons.some((r) => r.includes('at least 12 characters'))).toBe(true);
			expect(fetchSpy).not.toHaveBeenCalled();
		});

		it('passes when at or above minLength (breach check off)', async () => {
			const result = await validatePassword('abcdefghijkl', policyWith({ minLength: 12, checkBreachCorpus: false }));
			expect(result.ok).toBe(true);
			expect(result.reasons).toEqual([]);
		});
	});

	describe('denylist', () => {
		it('rejects a denylisted password (exact case match)', async () => {
			// "password123" is 11 chars — use minLength 8 so the denylist rule fires
			// without length noise.
			const result = await validatePassword('password123', policyWith({ minLength: 8, checkBreachCorpus: false }));
			expect(result.ok).toBe(false);
			expect(result.reasons.some((r) => r.toLowerCase().includes('too common'))).toBe(true);
		});

		it('rejects denylisted case-insensitively', async () => {
			const result = await validatePassword('PASSWORD123', policyWith({ minLength: 8, checkBreachCorpus: false }));
			expect(result.ok).toBe(false);
			expect(result.reasons.some((r) => r.toLowerCase().includes('too common'))).toBe(true);
		});

		it('non-denylisted long password passes (breach check off)', async () => {
			const result = await validatePassword('correct-horse-battery-staple-8734', policyWith({ minLength: 12, checkBreachCorpus: false }));
			expect(result.ok).toBe(true);
			expect(result.reasons).toEqual([]);
		});
	});

	describe('HIBP — off', () => {
		it('does not call fetch when policy.checkBreachCorpus=false', async () => {
			const fetchSpy = vi.fn();
			vi.stubGlobal('fetch', fetchSpy);
			await validatePassword('correct-horse-battery-staple-8734', policyWith({ minLength: 12, checkBreachCorpus: false }));
			expect(fetchSpy).not.toHaveBeenCalled();
		});
	});

	describe('HIBP — on', () => {
		it('calls fetch with the correct URL prefix + Add-Padding header', async () => {
			const password = 'correct-horse-battery-staple-8734';
			const hash = await sha1UpperHex(password);
			const prefix = hash.substring(0, 5);
			const fetchSpy = vi.fn(async () => ({ ok: true, status: 200, text: async () => '' }) as Response);
			vi.stubGlobal('fetch', fetchSpy);

			await validatePassword(password, policyWith({ minLength: 12, checkBreachCorpus: true }));

			expect(fetchSpy).toHaveBeenCalledTimes(1);
			const [url, init] = fetchSpy.mock.calls[0]!;
			expect(url).toBe(`https://api.pwnedpasswords.com/range/${prefix}`);
			const headers = (init as RequestInit).headers as Record<string, string>;
			expect(headers['Add-Padding']).toBe('true');
		});

		it('adds a reason when the suffix appears with count > 0', async () => {
			const password = 'correct-horse-battery-staple-8734';
			const hash = await sha1UpperHex(password);
			const suffix = hash.substring(5);
			const otherSuffix = 'FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF';
			const body = `${suffix}:42\r\n${otherSuffix}:99\r\n`;
			vi.stubGlobal(
				'fetch',
				vi.fn(async () => ({ ok: true, status: 200, text: async () => body }) as Response),
			);

			const result = await validatePassword(password, policyWith({ minLength: 12, checkBreachCorpus: true }));

			expect(result.ok).toBe(false);
			expect(result.reasons.some((r) => r.includes('known-breach corpus (42 known exposures)'))).toBe(true);
		});

		it('does NOT add a reason when only OTHER suffixes match', async () => {
			const password = 'correct-horse-battery-staple-8734';
			const otherSuffix = 'FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF';
			const body = `${otherSuffix}:99\r\nAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA:1\r\n`;
			vi.stubGlobal(
				'fetch',
				vi.fn(async () => ({ ok: true, status: 200, text: async () => body }) as Response),
			);

			const result = await validatePassword(password, policyWith({ minLength: 12, checkBreachCorpus: true }));

			expect(result.ok).toBe(true);
			expect(result.reasons).toEqual([]);
		});

		it('handles \\r\\n and \\n line separators', async () => {
			const password = 'correct-horse-battery-staple-8734';
			const hash = await sha1UpperHex(password);
			const suffix = hash.substring(5);
			const otherSuffix = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
			// Mix separators: first line uses \r\n, our line uses \n
			const body = `${otherSuffix}:1\r\n${suffix}:5\n`;
			vi.stubGlobal(
				'fetch',
				vi.fn(async () => ({ ok: true, status: 200, text: async () => body }) as Response),
			);

			const result = await validatePassword(password, policyWith({ minLength: 12, checkBreachCorpus: true }));

			expect(result.ok).toBe(false);
			expect(result.reasons.some((r) => r.includes('(5 known exposures)'))).toBe(true);
		});

		it('fails open on fetch throw', async () => {
			vi.stubGlobal(
				'fetch',
				vi.fn(async () => {
					throw new Error('network down');
				}),
			);

			const result = await validatePassword('correct-horse-battery-staple-8734', policyWith({ minLength: 12, checkBreachCorpus: true }));

			expect(result.ok).toBe(true);
			expect(result.reasons).toEqual([]);
			expect(warnSpy).toHaveBeenCalled();
		});

		it('fails open on non-OK response', async () => {
			vi.stubGlobal(
				'fetch',
				vi.fn(async () => ({ ok: false, status: 503, text: async () => '' }) as Response),
			);

			const result = await validatePassword('correct-horse-battery-staple-8734', policyWith({ minLength: 12, checkBreachCorpus: true }));

			expect(result.ok).toBe(true);
			expect(result.reasons).toEqual([]);
			expect(warnSpy).toHaveBeenCalled();
		});

		it('fails open on fetch timeout', async () => {
			vi.stubGlobal(
				'fetch',
				vi.fn(async () => {
					const err = new Error('The operation was aborted due to timeout');
					err.name = 'TimeoutError';
					throw err;
				}),
			);

			const result = await validatePassword('correct-horse-battery-staple-8734', policyWith({ minLength: 12, checkBreachCorpus: true }));

			expect(result.ok).toBe(true);
			expect(result.reasons).toEqual([]);
			expect(warnSpy).toHaveBeenCalled();
		});
	});

	describe('denylist integrity', () => {
		it('every denylist entry is all-lowercase', () => {
			for (const entry of PASSWORD_DENYLIST) {
				expect(entry).toBe(entry.toLowerCase());
			}
		});
	});

	describe('combined', () => {
		it('reports MULTIPLE reasons at once (do not short-circuit)', async () => {
			// "password" is on the denylist AND shorter than minLength=12.
			const result = await validatePassword('password', policyWith({ minLength: 12, checkBreachCorpus: false }));
			expect(result.ok).toBe(false);
			expect(result.reasons.length).toBeGreaterThanOrEqual(2);
			expect(result.reasons.some((r) => r.includes('at least 12 characters'))).toBe(true);
			expect(result.reasons.some((r) => r.toLowerCase().includes('too common'))).toBe(true);
		});
	});
});
