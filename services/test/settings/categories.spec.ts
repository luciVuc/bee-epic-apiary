import { describe, it, expect, vi } from 'vitest';
import { fetch } from 'undici';
import { router } from '../../src/router';
import { Env } from '../../worker-configuration';

const TEST_CATEGORIES = [
	{ id: 'HONEY', label: 'Honey' },
	{ id: 'BEESWAX', label: 'Beeswax' },
];

describe('categories settings endpoint', () => {
	const env = {
		CONTENT_KV: {
			get: vi.fn((key: string) => Promise.resolve(key === 'categories' ? JSON.stringify({ name: 'Test Category' }) : null)),
			put: vi.fn(() => Promise.resolve()),
		} as unknown as KVNamespace,
		STRIPE_SECRET_KEY: 'sk_test_123',
		STRIPE_WEBHOOK_SECRET: 'whsec_123',
		ALLOWED_ORIGINS: 'http://localhost:3000',
		API_SECRET_KEY: 'test-secret-key',
	} satisfies Env;

	const createRequest = (method: string, body?: unknown, headers?: Record<string, string>) => {
		return new Request(`http://localhost/settings/categories`, {
			method,
			headers: {
				'Content-Type': 'application/json',
				Origin: 'http://localhost:3000',
				...headers,
			},
			body: body ? JSON.stringify(body) : undefined,
		});
	};

	it('should return 405 for unsupported methods', async () => {
		const request = createRequest('POST');
		const response = await router(request, env);
		expect(response.status).toBe(405);
	});

	it('should return 400 for invalid JSON on PUT', async () => {
		const request = new Request('http://localhost/settings/categories', {
			method: 'PUT',
			headers: {
				'Content-Type': 'application/json',
				Authorization: 'Bearer test-secret-key',
				Origin: 'http://localhost:3000',
			},
			body: 'invalid-json',
		});
		const response = await router(request, env);
		expect(response.status).toBe(400);
		const data = await response.json();
		expect(data.error).toBe('Invalid JSON body');
	});

	it('should return 400 for validation failure on PUT', async () => {
		const request = createRequest(
			'PUT',
			{ notAnArray: true },
			{
				Authorization: 'Bearer test-secret-key',
				'Content-Type': 'application/json',
			},
		);
		const response = await router(request, env);
		expect(response.status).toBe(400);
		const data = await response.json();
		expect(data.error).toBe('Invalid categories data');
	});

	it('should return 401 without auth on PUT', async () => {
		const request = createRequest('PUT', TEST_CATEGORIES);
		const response = await router(request, env);
		expect(response.status).toBe(401);
	});

	it('should return 200 for valid PUT request', async () => {
		const mockPut = vi.fn().mockResolvedValue(undefined);
		env.CONTENT_KV.put = mockPut;

		const request = createRequest('PUT', TEST_CATEGORIES, {
			Authorization: 'Bearer test-secret-key',
			'Content-Type': 'application/json',
		});
		const response = await router(request, env);
		expect(response.status).toBe(200);
		const data = await response.json();
		expect(data.success).toBe(true);
		expect(data.type).toBe('categories');
	});

	it('should return 200 for GET request', async () => {
		const request = createRequest('GET');
		const response = await router(request, env);
		expect(response.status).toBe(200);
		const data = await response.json();
		expect(data.name).toBe('Test Category');
	});

	it('should return 204 for OPTIONS request', async () => {
		const request = new Request('http://localhost/settings/categories', {
			method: 'OPTIONS',
			headers: {
				Origin: 'http://localhost:3000',
			},
		});
		const response = await router(request, env);
		expect(response.status).toBe(204);
		expect(response.headers.get('Access-Control-Allow-Methods')).toContain('GET');
		expect(response.headers.get('Access-Control-Allow-Methods')).toContain('PUT');
	});
});
