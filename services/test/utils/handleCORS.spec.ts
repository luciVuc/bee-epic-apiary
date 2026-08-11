import { describe, it, expect, vi, afterEach } from 'vitest';
import handleCORS, { HttpMethod } from '../../src/utils/handleCORS';

describe('handleCORS', () => {
	afterEach(() => vi.restoreAllMocks());

	const createOptionsRequest = (origin: string) => {
		return new Request('http://example.com', {
			method: 'OPTIONS',
			headers: { Origin: origin },
		});
	};

	it('returns 204 for valid preflight request', () => {
		const request = createOptionsRequest('https://example.com');
		const env = { ALLOWED_ORIGINS: 'https://example.com' } as Env;
		const response = handleCORS(request, env, 'POST' as HttpMethod);
		expect(response.status).toBe(204);
	});

	it('sets correct Access-Control-Allow-Methods header', () => {
		const request = createOptionsRequest('https://example.com');
		const env = { ALLOWED_ORIGINS: 'https://example.com' } as Env;
		const response = handleCORS(request, env, 'POST' as HttpMethod);
		expect(response.headers.get('Access-Control-Allow-Methods')).toBe('POST, OPTIONS');
	});

	it('echoes the request origin (not *) when ALLOWED_ORIGINS=* and ENVIRONMENT=development', () => {
		// `Allow-Origin: *` is invalid alongside credentialed requests; echo the
		// concrete origin instead so the admin cookie flow works in dev too.
		const request = createOptionsRequest('https://anything.test');
		const env = { ALLOWED_ORIGINS: '*', ENVIRONMENT: 'development' } as unknown as Env;
		const response = handleCORS(request, env, 'POST' as HttpMethod);
		expect(response.headers.get('Access-Control-Allow-Origin')).toBe('https://anything.test');
		expect(response.headers.get('Access-Control-Allow-Credentials')).toBe('true');
		expect(response.headers.get('Vary')).toBe('Origin');
	});

	it('refuses preflight with 403 when ALLOWED_ORIGINS=* outside development (review I12)', () => {
		const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
		const request = createOptionsRequest('https://anything.test');
		const env = { ALLOWED_ORIGINS: '*', ENVIRONMENT: 'production' } as unknown as Env;
		const response = handleCORS(request, env, 'POST' as HttpMethod);
		expect(response.status).toBe(403);
		expect(errSpy).toHaveBeenCalled();
	});

	it('returns 403 for disallowed origin', () => {
		const request = createOptionsRequest('https://evil.com');
		const env = { ALLOWED_ORIGINS: 'https://example.com' } as Env;
		const response = handleCORS(request, env, 'POST' as HttpMethod);
		expect(response.status).toBe(403);
	});

	it('sets Access-Control-Max-Age header', () => {
		const request = createOptionsRequest('https://example.com');
		const env = { ALLOWED_ORIGINS: 'https://example.com' } as Env;
		const response = handleCORS(request, env, 'POST' as HttpMethod);
		expect(response.headers.get('Access-Control-Max-Age')).toBe('86400');
	});

	it('sets Access-Control-Allow-Headers header', () => {
		const request = createOptionsRequest('https://example.com');
		const env = { ALLOWED_ORIGINS: 'https://example.com' } as Env;
		const response = handleCORS(request, env, 'POST' as HttpMethod);
		expect(response.headers.get('Access-Control-Allow-Headers')).toBe('Content-Type, authorization, X-Dev-Email');
	});

	it('sets correct Access-Control-Allow-Methods for OPTIONS method', () => {
		const request = createOptionsRequest('https://example.com');
		const env = { ALLOWED_ORIGINS: 'https://example.com' } as Env;
		const response = handleCORS(request, env, 'OPTIONS' as HttpMethod);
		expect(response.headers.get('Access-Control-Allow-Methods')).toBe('OPTIONS');
	});

	it('sets Access-Control-Allow-Origin when origin is allowed', () => {
		const request = createOptionsRequest('https://example.com');
		const env = { ALLOWED_ORIGINS: 'https://example.com' } as Env;
		const response = handleCORS(request, env, 'POST' as HttpMethod);
		expect(response.headers.get('Access-Control-Allow-Origin')).toBe('https://example.com');
	});

	it('sets correct Access-Control-Allow-Methods for OPTIONS method with wildcard origin (dev)', () => {
		const request = createOptionsRequest('https://anything.test');
		const env = { ALLOWED_ORIGINS: '*', ENVIRONMENT: 'development' } as unknown as Env;
		const response = handleCORS(request, env, 'OPTIONS' as HttpMethod);
		expect(response.headers.get('Access-Control-Allow-Methods')).toBe('OPTIONS');
	});

	it('echoes the request origin (not *) with POST when ALLOWED_ORIGINS=* and ENVIRONMENT=development', () => {
		const request = createOptionsRequest('https://anything.test');
		const env = { ALLOWED_ORIGINS: '*', ENVIRONMENT: 'development' } as unknown as Env;
		const response = handleCORS(request, env, 'POST' as HttpMethod);
		expect(response.headers.get('Access-Control-Allow-Origin')).toBe('https://anything.test');
		expect(response.headers.get('Access-Control-Allow-Methods')).toBe('POST, OPTIONS');
		expect(response.headers.get('Access-Control-Allow-Credentials')).toBe('true');
	});

	it('sets Access-Control-Allow-Credentials on every allowed preflight', () => {
		const request = createOptionsRequest('https://example.com');
		const env = { ALLOWED_ORIGINS: 'https://example.com' } as Env;
		const response = handleCORS(request, env, 'POST' as HttpMethod);
		expect(response.headers.get('Access-Control-Allow-Credentials')).toBe('true');
		expect(response.headers.get('Vary')).toBe('Origin');
	});
});
