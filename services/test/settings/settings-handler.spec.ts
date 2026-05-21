import { describe, it, expect, vi, beforeEach } from 'vitest';
import settingsHandler from '../../src/settings/settings-handler';
import { checkAuth, isAllowedOrigin } from '../../src/utils';

describe('settings-handler', () => {
	const env = {
		CONTENT_KV: {
			get: vi.fn(),
			put: vi.fn(),
		} as unknown as KVNamespace,
		STRIPE_SECRET_KEY: 'sk_test_123',
		ALLOWED_ORIGINS: 'http://localhost:3000',
		API_SECRET_KEY: 'test-secret-key',
	} as any;

	beforeEach(() => {
		vi.restoreAllMocks();
		env.CONTENT_KV.get = vi.fn();
		env.CONTENT_KV.put = vi.fn();
	});

	it('returns 404 when path does not match settings pattern', async () => {
		const request = new Request('http://localhost/settings/invalid', {
			method: 'GET',
			headers: { Origin: 'http://localhost:3000' },
		});
		const response = await settingsHandler.fetch(request, env);
		expect(response.status).toBe(404);
	});

	it('returns 404 for GET when no content found', async () => {
		env.CONTENT_KV.get.mockResolvedValue(null);

		const request = new Request('http://localhost/settings/site', {
			method: 'GET',
			headers: { Origin: 'http://localhost:3000' },
		});
		const response = await settingsHandler.fetch(request, env);
		expect(response.status).toBe(404);
		const body = (await response.json()) as any;
		expect(body.error).toBe('No content found for "site"');
	});

	it('returns 500 for GET when stored data is invalid JSON', async () => {
		env.CONTENT_KV.get.mockResolvedValue('not-valid-json');

		const request = new Request('http://localhost/settings/site', {
			method: 'GET',
			headers: { Origin: 'http://localhost:3000' },
		});
		const response = await settingsHandler.fetch(request, env);
		expect(response.status).toBe(500);
		const body = (await response.json()) as any;
		expect(body.error).toBe('Invalid stored data');
	});

	it('returns 200 for GET with valid stored data', async () => {
		env.CONTENT_KV.get.mockResolvedValue(JSON.stringify({ name: 'Bee Epic' }));

		const request = new Request('http://localhost/settings/site', {
			method: 'GET',
			headers: { Origin: 'http://localhost:3000' },
		});
		const response = await settingsHandler.fetch(request, env);
		expect(response.status).toBe(200);
		const body = (await response.json()) as any;
		expect(body.name).toBe('Bee Epic');
	});

	it('returns 403 for PUT with disallowed origin', async () => {
		const request = new Request('http://localhost/settings/site', {
			method: 'PUT',
			headers: {
				'Content-Type': 'application/json',
				Origin: 'http://evil.com',
				Authorization: 'Bearer test-secret-key',
			},
			body: JSON.stringify({ name: 'Updated' }),
		});
		const response = await settingsHandler.fetch(request, { ...env, ALLOWED_ORIGINS: 'http://localhost:3000' });
		expect(response.status).toBe(403);
	});

	it('returns 401 for PUT without auth header when API_SECRET_KEY is set', async () => {
		const request = new Request('http://localhost/settings/site', {
			method: 'PUT',
			headers: {
				'Content-Type': 'application/json',
				Origin: 'http://localhost:3000',
			},
			body: JSON.stringify({ name: 'Updated' }),
		});
		const response = await settingsHandler.fetch(request, env);
		expect(response.status).toBe(401);
	});

	it('returns 405 for unsupported method', async () => {
		const request = new Request('http://localhost/settings/site', {
			method: 'DELETE',
			headers: { Origin: 'http://localhost:3000' },
		});
		const response = await settingsHandler.fetch(request, env);
		expect(response.status).toBe(405);
	});

	it('returns 400 for invalid JSON body on PUT', async () => {
		const request = new Request('http://localhost/settings/site', {
			method: 'PUT',
			headers: {
				'Content-Type': 'application/json',
				Origin: 'http://localhost:3000',
				Authorization: 'Bearer test-secret-key',
			},
			body: 'invalid-json',
		});
		const response = await settingsHandler.fetch(request, env);
		expect(response.status).toBe(400);
		const body = (await response.json()) as any;
		expect(body.error).toBe('Invalid JSON body');
	});

	it('returns 200 for PUT with valid data (non-categories type)', async () => {
		const mockPut = vi.fn().mockResolvedValue(undefined);
		env.CONTENT_KV.put = mockPut;
		env.CONTENT_KV.get = vi.fn().mockResolvedValue(null);

		const request = new Request('http://localhost/settings/site', {
			method: 'PUT',
			headers: {
				'Content-Type': 'application/json',
				Origin: 'http://localhost:3000',
				Authorization: 'Bearer test-secret-key',
			},
			body: JSON.stringify({ name: 'Bee Epic Apiary', tagline: 'Best honey' }),
		});
		const response = await settingsHandler.fetch(request, env);
		expect(response.status).toBe(200);
		const body = (await response.json()) as any;
		expect(body.success).toBe(true);
		expect(body.type).toBe('site');
	});

	it('returns 200 for PUT with valid categories data', async () => {
		const mockPut = vi.fn().mockResolvedValue(undefined);
		env.CONTENT_KV.put = mockPut;

		const request = new Request('http://localhost/settings/categories', {
			method: 'PUT',
			headers: {
				'Content-Type': 'application/json',
				Origin: 'http://localhost:3000',
				Authorization: 'Bearer test-secret-key',
			},
			body: JSON.stringify([
				{ id: 'HONEY', label: 'Honey' },
				{ id: 'BEESWAX', label: 'Beeswax' },
			]),
		});
		const response = await settingsHandler.fetch(request, env);
		expect(response.status).toBe(200);
		const body = (await response.json()) as any;
		expect(body.success).toBe(true);
	});
});
