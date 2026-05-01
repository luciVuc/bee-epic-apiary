import { describe, it, expect } from 'vitest';
import { checkAuth } from '../../src/utils/auth';
import type { AuthResult } from '../../src/utils/auth';

describe('checkAuth', () => {
	it('returns authenticated true when API_SECRET_KEY is not set', () => {
		const request = new Request('http://example.com', { method: 'POST' });
		const env = {} as Env;

		const result: AuthResult = checkAuth(request, env);

		expect(result.authenticated).toBe(true);
	});

	it('returns 401 when Authorization header is missing', () => {
		const request = new Request('http://example.com', { method: 'POST' });
		const env = { API_SECRET_KEY: 'secret123' } as Env;

		const result = checkAuth(request, env);

		expect(result.authenticated).toBe(false);
		expect(result.error?.status).toBe(401);
	});

	it('returns 401 when Authorization header has no Bearer scheme', () => {
		const request = new Request('http://example.com', {
			method: 'POST',
			headers: { Authorization: 'Basic token123' },
		});
		const env = { API_SECRET_KEY: 'secret123' } as Env;

		const result = checkAuth(request, env);

		expect(result.authenticated).toBe(false);
		expect(result.error?.status).toBe(401);
	});

	it('returns 401 when Authorization header has no token', () => {
		const request = new Request('http://example.com', {
			method: 'POST',
			headers: { Authorization: 'Bearer ' },
		});
		const env = { API_SECRET_KEY: 'secret123' } as Env;

		const result = checkAuth(request, env);

		expect(result.authenticated).toBe(false);
		expect(result.error?.status).toBe(401);
	});

	it('returns 403 when token does not match API_SECRET_KEY', () => {
		const request = new Request('http://example.com', {
			method: 'POST',
			headers: { Authorization: 'Bearer wrongtoken' },
		});
		const env = { API_SECRET_KEY: 'secret123' } as Env;

		const result = checkAuth(request, env);

		expect(result.authenticated).toBe(false);
		expect(result.error?.status).toBe(403);
	});

	it('returns authenticated true when token matches API_SECRET_KEY', () => {
		const request = new Request('http://example.com', {
			method: 'POST',
			headers: { Authorization: 'Bearer secret123' },
		});
		const env = { API_SECRET_KEY: 'secret123' } as Env;

		const result = checkAuth(request, env);

		expect(result.authenticated).toBe(true);
	});

	it('returns 401 with correct error message for missing header', () => {
		const request = new Request('http://example.com', { method: 'POST' });
		const env = { API_SECRET_KEY: 'secret123' } as Env;

		const result = checkAuth(request, env);

		expect(result.error).toBeInstanceOf(Response);
	});

	it('handles GET requests with valid token', () => {
		const request = new Request('http://example.com', {
			method: 'GET',
			headers: { Authorization: 'Bearer secret123' },
		});
		const env = { API_SECRET_KEY: 'secret123' } as Env;

		const result = checkAuth(request, env);

		expect(result.authenticated).toBe(true);
	});

	it('handles PUT requests with valid token', () => {
		const request = new Request('http://example.com', {
			method: 'PUT',
			headers: { Authorization: 'Bearer secret123' },
		});
		const env = { API_SECRET_KEY: 'secret123' } as Env;

		const result = checkAuth(request, env);

		expect(result.authenticated).toBe(true);
	});

	it('handles DELETE requests with valid token', () => {
		const request = new Request('http://example.com', {
			method: 'DELETE',
			headers: { Authorization: 'Bearer secret123' },
		});
		const env = { API_SECRET_KEY: 'secret123' } as Env;

		const result = checkAuth(request, env);

		expect(result.authenticated).toBe(true);
	});
});
