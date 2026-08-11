import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { authFromAddress } from '../../../src/auth/emails/from';

/**
 * Build a minimal `Env` for these tests — only `AUTH_FROM_ADDRESS` and
 * `ADMIN_BASE_URL` are read by `authFromAddress`, so the rest is cast away
 * through `unknown` rather than stubbing every binding.
 */
function makeEnv(
	overrides: {
		AUTH_FROM_ADDRESS?: string | undefined;
		ADMIN_BASE_URL?: string;
	} = {},
): Env {
	return {
		AUTH_FROM_ADDRESS: undefined,
		ADMIN_BASE_URL: 'https://admin.example.com',
		...overrides,
	} as unknown as Env;
}

describe('authFromAddress', () => {
	let warnSpy: ReturnType<typeof vi.spyOn>;

	beforeEach(() => {
		warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
	});

	afterEach(() => {
		warnSpy.mockRestore();
	});

	describe('AUTH_FROM_ADDRESS preference', () => {
		it('returns AUTH_FROM_ADDRESS when set to a valid-shaped address', () => {
			const env = makeEnv({ AUTH_FROM_ADDRESS: 'admin@example.com' });
			const result = authFromAddress(env, 'invite');
			expect(result.email).toBe('admin@example.com');
		});
	});

	describe('display name by kind', () => {
		it('uses the invite display name for kind=invite', () => {
			const env = makeEnv({ AUTH_FROM_ADDRESS: 'admin@example.com' });
			const result = authFromAddress(env, 'invite');
			expect(result.name).toBe('Bee Epic Admin — Invitation');
		});

		it('uses the reset display name for kind=reset', () => {
			const env = makeEnv({ AUTH_FROM_ADDRESS: 'admin@example.com' });
			const result = authFromAddress(env, 'reset');
			expect(result.name).toBe('Bee Epic Admin — Password Reset');
		});

		it('uses the password-changed display name for kind=password-changed', () => {
			const env = makeEnv({ AUTH_FROM_ADDRESS: 'admin@example.com' });
			const result = authFromAddress(env, 'password-changed');
			expect(result.name).toBe('Bee Epic Admin — Security');
		});
	});

	describe('fallback to ADMIN_BASE_URL hostname', () => {
		it('falls back to noreply@<hostname> when AUTH_FROM_ADDRESS is unset', () => {
			const env = makeEnv({
				AUTH_FROM_ADDRESS: undefined,
				ADMIN_BASE_URL: 'https://admin.example.com',
			});
			const result = authFromAddress(env, 'invite');
			expect(result.email).toBe('noreply@admin.example.com');
			expect(warnSpy).not.toHaveBeenCalled();
		});

		it('falls back to noreply@<hostname> when AUTH_FROM_ADDRESS is invalid shape', () => {
			const env = makeEnv({
				AUTH_FROM_ADDRESS: 'not-an-email',
				ADMIN_BASE_URL: 'https://admin.example.com',
			});
			const result = authFromAddress(env, 'invite');
			expect(result.email).toBe('noreply@admin.example.com');
			expect(warnSpy).toHaveBeenCalled();
		});

		it('falls back to noreply@<hostname> when AUTH_FROM_ADDRESS is empty string (no warn)', () => {
			const env = makeEnv({
				AUTH_FROM_ADDRESS: '',
				ADMIN_BASE_URL: 'https://admin.example.com',
			});
			const result = authFromAddress(env, 'invite');
			expect(result.email).toBe('noreply@admin.example.com');
			expect(warnSpy).not.toHaveBeenCalled();
		});

		it('strips the port from ADMIN_BASE_URL when deriving hostname', () => {
			const env = makeEnv({
				AUTH_FROM_ADDRESS: undefined,
				ADMIN_BASE_URL: 'https://admin.example.com:5174',
			});
			const result = authFromAddress(env, 'invite');
			expect(result.email).toBe('noreply@admin.example.com');
		});

		it('handles bare hostname ADMIN_BASE_URL (localhost)', () => {
			const env = makeEnv({
				AUTH_FROM_ADDRESS: undefined,
				ADMIN_BASE_URL: 'http://localhost:5174',
			});
			const result = authFromAddress(env, 'invite');
			expect(result.email).toBe('noreply@localhost');
		});
	});

	describe('final fallback', () => {
		it('falls back to noreply@localhost when neither AUTH_FROM_ADDRESS nor ADMIN_BASE_URL are usable', () => {
			const env = makeEnv({
				AUTH_FROM_ADDRESS: undefined,
				ADMIN_BASE_URL: '',
			});
			const result = authFromAddress(env, 'invite');
			expect(result.email).toBe('noreply@localhost');
		});

		it('handles unparseable ADMIN_BASE_URL without throwing', () => {
			const env = makeEnv({
				AUTH_FROM_ADDRESS: undefined,
				ADMIN_BASE_URL: 'not a url',
			});
			expect(() => authFromAddress(env, 'invite')).not.toThrow();
			const result = authFromAddress(env, 'invite');
			expect(result.email).toBe('noreply@localhost');
		});
	});
});
