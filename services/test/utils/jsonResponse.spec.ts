import { describe, it, expect } from 'vitest';
import jsonResponse, { httpStatusFor } from '../../src/utils/jsonResponse';

describe('jsonResponse', () => {
	it('returns correct JSON with status', async () => {
		const response = jsonResponse({ message: 'hello' }, 200);
		expect(response.status).toBe(200);
		const body = await response.json();
		expect(body).toEqual({ message: 'hello' });
	});

	it('adds CORS header when origin provided', () => {
		const response = jsonResponse({ data: 'test' }, 200, 'https://example.com');
		expect(response.headers.get('Access-Control-Allow-Origin')).toBe('https://example.com');
		expect(response.headers.get('Access-Control-Allow-Credentials')).toBe('true');
		expect(response.headers.get('Vary')).toBe('Origin');
	});

	it('echoes the request origin (not *) when ALLOWED_ORIGINS=* and origin is present', () => {
		// `Allow-Origin: *` with credentials is rejected by browsers, so we echo
		// the concrete origin even in dev-wildcard mode.
		const env = { ALLOWED_ORIGINS: '*' } as Env;
		const response = jsonResponse({ data: 'test' }, 200, 'https://example.com', env);
		expect(response.headers.get('Access-Control-Allow-Origin')).toBe('https://example.com');
		expect(response.headers.get('Access-Control-Allow-Credentials')).toBe('true');
	});

	it('falls back to * for origin-less callers when ALLOWED_ORIGINS=*', () => {
		const env = { ALLOWED_ORIGINS: '*' } as Env;
		const response = jsonResponse({ data: 'test' }, 200, null, env);
		expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
		// `Allow-Credentials` is invalid with `*`, so it must NOT be set here.
		expect(response.headers.get('Access-Control-Allow-Credentials')).toBeNull();
	});

	it('sets Content-Type to application/json', () => {
		const response = jsonResponse({ test: true }, 201);
		expect(response.headers.get('Content-Type')).toBe('application/json');
	});

	it('handles 204 status with no body', () => {
		const response = jsonResponse({}, 204);
		expect(response.status).toBe(204);
	});

	it('handles 205 status with no body', () => {
		const response = jsonResponse({}, 205);
		expect(response.status).toBe(205);
		const body = async () => await response.text();
		expect(body).not.toContain('{}');
	});

	it('handles 304 status with no body', () => {
		const response = jsonResponse({}, 304);
		expect(response.status).toBe(304);
	});
});

describe('httpStatusFor (auth refactor mappings)', () => {
	it('maps INVALID_CREDENTIALS → 401', () => {
		expect(httpStatusFor({ code: 'INVALID_CREDENTIALS' })).toBe(401);
	});
	it('maps INVALID_REFRESH → 401', () => {
		expect(httpStatusFor({ code: 'INVALID_REFRESH' })).toBe(401);
	});
	it('maps REUSED_REFRESH → 401', () => {
		expect(httpStatusFor({ code: 'REUSED_REFRESH' })).toBe(401);
	});
	it('maps NO_REFRESH → 401', () => {
		expect(httpStatusFor({ code: 'NO_REFRESH' })).toBe(401);
	});
	it('maps ACCOUNT_DISABLED → 403', () => {
		expect(httpStatusFor({ code: 'ACCOUNT_DISABLED' })).toBe(403);
	});
	it('maps BOOTSTRAP_DISABLED → 403', () => {
		expect(httpStatusFor({ code: 'BOOTSTRAP_DISABLED' })).toBe(403);
	});
	it('maps FORBIDDEN_WRITE_ROLE → 403', () => {
		expect(httpStatusFor({ code: 'FORBIDDEN_WRITE_ROLE' })).toBe(403);
	});
	it('maps USER_NOT_FOUND → 404', () => {
		expect(httpStatusFor({ code: 'USER_NOT_FOUND' })).toBe(404);
	});
	it('maps USER_EXISTS → 409', () => {
		expect(httpStatusFor({ code: 'USER_EXISTS' })).toBe(409);
	});
	it('maps USER_ALREADY_ACTIVE → 409', () => {
		expect(httpStatusFor({ code: 'USER_ALREADY_ACTIVE' })).toBe(409);
	});
	it('maps WEAK_PASSWORD → 400', () => {
		expect(httpStatusFor({ code: 'WEAK_PASSWORD', reasons: [] })).toBe(400);
	});
	it('maps INVALID_TOKEN → 400', () => {
		expect(httpStatusFor({ code: 'INVALID_TOKEN' })).toBe(400);
	});
	it('maps EXPIRED_TOKEN → 400', () => {
		expect(httpStatusFor({ code: 'EXPIRED_TOKEN' })).toBe(400);
	});
	it('maps INVALID_EMAIL → 400', () => {
		expect(httpStatusFor({ code: 'INVALID_EMAIL' })).toBe(400);
	});
	it('maps INVALID_ROLE → 400', () => {
		expect(httpStatusFor({ code: 'INVALID_ROLE' })).toBe(400);
	});
	it('maps INVALID_POLICY → 400', () => {
		expect(httpStatusFor({ code: 'INVALID_POLICY' })).toBe(400);
	});
	it('maps EMAIL_MISMATCH → 400', () => {
		expect(httpStatusFor({ code: 'EMAIL_MISMATCH' })).toBe(400);
	});
	it('maps CANNOT_DELETE_LAST_OWNER → 400', () => {
		expect(httpStatusFor({ code: 'CANNOT_DELETE_LAST_OWNER' })).toBe(400);
	});
	it('maps CANNOT_DELETE_SELF → 400', () => {
		expect(httpStatusFor({ code: 'CANNOT_DELETE_SELF' })).toBe(400);
	});
	it('maps CANNOT_DEMOTE_LAST_OWNER → 400', () => {
		expect(httpStatusFor({ code: 'CANNOT_DEMOTE_LAST_OWNER' })).toBe(400);
	});
	it('maps CANNOT_DISABLE_SELF → 400', () => {
		expect(httpStatusFor({ code: 'CANNOT_DISABLE_SELF' })).toBe(400);
	});
});
