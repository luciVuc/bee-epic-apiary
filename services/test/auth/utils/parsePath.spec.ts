import { describe, it, expect } from 'vitest';
import { extractEmailFromUsersPath } from '../../../src/auth/utils/parsePath';

/**
 * Unit tests for the shared `/users/:email(/suffix)?` path helper.
 *
 * Covers both shapes used by the Phase 8 handlers:
 *   - No suffix: `updateUser` (PUT) + `deleteUser` (DELETE)
 *   - `/reinvite` suffix: `reinviteUser` (POST)
 */

describe('extractEmailFromUsersPath', () => {
	describe('bare /users/:email shape (default no-suffix)', () => {
		it('base shape /users/foo → "foo"', () => {
			expect(extractEmailFromUsersPath('/users/foo')).toBe('foo');
		});

		it('trailing slash /users/foo/ → "foo"', () => {
			expect(extractEmailFromUsersPath('/users/foo/')).toBe('foo');
		});

		it('URL-encoded /users/foo%40example.com → "foo@example.com"', () => {
			expect(extractEmailFromUsersPath('/users/foo%40example.com')).toBe('foo@example.com');
		});

		it('uppercase /users/Foo → "foo" (lowercased)', () => {
			expect(extractEmailFromUsersPath('/users/Foo')).toBe('foo');
		});

		it('missing user /users/ → null', () => {
			expect(extractEmailFromUsersPath('/users/')).toBeNull();
		});

		it('extra segments /users/foo/bar (no suffix) → null', () => {
			expect(extractEmailFromUsersPath('/users/foo/bar')).toBeNull();
		});

		it('malformed encoding /users/foo%GG → null (decodeURIComponent throws, caught)', () => {
			expect(extractEmailFromUsersPath('/users/foo%GG')).toBeNull();
		});

		it('empty pathname → null', () => {
			expect(extractEmailFromUsersPath('')).toBeNull();
		});

		it('unrelated path /orders/foo → null', () => {
			expect(extractEmailFromUsersPath('/orders/foo')).toBeNull();
		});

		it('explicit empty-string suffix behaves identically to default', () => {
			expect(extractEmailFromUsersPath('/users/foo', '')).toBe('foo');
			expect(extractEmailFromUsersPath('/users/foo/reinvite', '')).toBeNull();
		});
	});

	describe('/reinvite suffix shape', () => {
		it('/users/foo/reinvite → "foo"', () => {
			expect(extractEmailFromUsersPath('/users/foo/reinvite', '/reinvite')).toBe('foo');
		});

		it('trailing slash /users/foo/reinvite/ → "foo"', () => {
			expect(extractEmailFromUsersPath('/users/foo/reinvite/', '/reinvite')).toBe('foo');
		});

		it('URL-encoded /users/bob%40example.com/reinvite → "bob@example.com"', () => {
			expect(extractEmailFromUsersPath('/users/bob%40example.com/reinvite', '/reinvite')).toBe('bob@example.com');
		});

		it('missing email /users//reinvite → null', () => {
			expect(extractEmailFromUsersPath('/users//reinvite', '/reinvite')).toBeNull();
		});

		it('bare /users/foo with /reinvite suffix required → null', () => {
			expect(extractEmailFromUsersPath('/users/foo', '/reinvite')).toBeNull();
		});

		it('wrong suffix /users/foo/other → null', () => {
			expect(extractEmailFromUsersPath('/users/foo/other', '/reinvite')).toBeNull();
		});

		it('malformed encoding /users/%GG/reinvite → null', () => {
			expect(extractEmailFromUsersPath('/users/%GG/reinvite', '/reinvite')).toBeNull();
		});

		it('uppercase segment lowercased in suffixed form', () => {
			expect(extractEmailFromUsersPath('/users/Alice/reinvite', '/reinvite')).toBe('alice');
		});
	});
});
