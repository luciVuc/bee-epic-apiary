import { describe, it, expect } from 'vitest';
import jsonResponse from '../../src/utils/jsonResponse';

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
	});

	it('uses * for CORS when ALLOWED_ORIGINS is *', () => {
		const env = { ALLOWED_ORIGINS: '*' } as Env;
		const response = jsonResponse({ data: 'test' }, 200, 'https://example.com', env);
		expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
	});

	it('sets Content-Type to application/json', () => {
		const response = jsonResponse({ test: true }, 201);
		expect(response.headers.get('Content-Type')).toBe('application/json');
	});

	it('handles 204 status with no body', () => {
		const response = jsonResponse({}, 204);
		expect(response.status).toBe(204);
	});
});
