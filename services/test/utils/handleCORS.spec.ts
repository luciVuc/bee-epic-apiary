import { describe, it, expect } from 'vitest';
import handleCORS, { HttpMethod } from '../../src/utils/handleCORS';

describe('handleCORS', () => {
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

	it('sets Access-Control-Allow-Origin to * when ALLOWED_ORIGINS is *', () => {
		const request = createOptionsRequest('https://evil.com');
		const env = { ALLOWED_ORIGINS: '*' } as Env;
		const response = handleCORS(request, env, 'POST' as HttpMethod);
		expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
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
		expect(response.headers.get('Access-Control-Allow-Headers')).toBe('Content-Type');
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

	it('sets correct Access-Control-Allow-Methods for OPTIONS method with wildcard origin', () => {
		const request = createOptionsRequest('https://evil.com');
		const env = { ALLOWED_ORIGINS: '*' } as Env;
		const response = handleCORS(request, env, 'OPTIONS' as HttpMethod);
		expect(response.headers.get('Access-Control-Allow-Methods')).toBe('OPTIONS');
	});

	it('sets Access-Control-Allow-Origin to * when ALLOWED_ORIGINS is * with POST', () => {
		const request = createOptionsRequest('https://evil.com');
		const env = { ALLOWED_ORIGINS: '*' } as Env;
		const response = handleCORS(request, env, 'POST' as HttpMethod);
		expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
		expect(response.headers.get('Access-Control-Allow-Methods')).toBe('POST, OPTIONS');
	});
});
