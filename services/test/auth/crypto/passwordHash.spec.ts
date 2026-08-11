import { describe, it, expect } from 'vitest';
import { hashPassword, verifyPassword } from '../../../src/auth/crypto/passwordHash';

describe('passwordHash', () => {
	it('hash format is pbkdf2$sha256$<iters>$<salt>$<hash>', async () => {
		const stored = await hashPassword('hunter2hunter2');
		const parts = stored.split('$');
		expect(parts).toHaveLength(5);
		expect(parts[0]).toBe('pbkdf2');
		expect(parts[1]).toBe('sha256');
		expect(parseInt(parts[2], 10)).toBeGreaterThanOrEqual(600_000);
	});

	it('verify returns true for the correct password', async () => {
		const stored = await hashPassword('correct horse battery staple');
		expect(await verifyPassword('correct horse battery staple', stored)).toBe(true);
	});

	it('verify returns false for the wrong password', async () => {
		const stored = await hashPassword('correct horse battery staple');
		expect(await verifyPassword('wrong password!', stored)).toBe(false);
	});

	it('two hashes of the same password differ (random salt)', async () => {
		const a = await hashPassword('samepassword12');
		const b = await hashPassword('samepassword12');
		expect(a).not.toBe(b);
	});

	it('verify reads iteration count from the stored string', async () => {
		// Manually craft a low-iteration hash (still valid format) and verify it works.
		const stored = await hashPassword('p');
		const [scheme, hash, _iters, salt, digest] = stored.split('$');
		const lowerIter = [scheme, hash, '100000', salt, digest].join('$');
		// Won't verify because digest was computed with higher iters; just confirm parser doesn't crash.
		expect(await verifyPassword('p', lowerIter)).toBe(false);
	});

	it('verify returns false for malformed stored strings', async () => {
		expect(await verifyPassword('any', 'not-a-hash')).toBe(false);
		expect(await verifyPassword('any', '')).toBe(false);
	});

	it('verify rejects stored strings with non-numeric or out-of-range iters', async () => {
		const stored = await hashPassword('p');
		const [scheme, hash, _iters, salt, digest] = stored.split('$');
		// Trailing garbage in iters
		expect(await verifyPassword('p', [scheme, hash, '600000abc', salt, digest].join('$'))).toBe(false);
		// Zero / negative iters
		expect(await verifyPassword('p', [scheme, hash, '0', salt, digest].join('$'))).toBe(false);
		expect(await verifyPassword('p', [scheme, hash, '-1', salt, digest].join('$'))).toBe(false);
		// Above the 10M cap
		expect(await verifyPassword('p', [scheme, hash, '99999999', salt, digest].join('$'))).toBe(false);
	});
});
