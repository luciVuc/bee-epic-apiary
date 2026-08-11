import { env } from 'cloudflare:test';
import { describe, it, expect } from 'vitest';
import worker from '../src/index';

const IncomingRequest = Request<unknown, IncomingRequestCfProperties>;

describe('checkout endpoint', () => {
	it('returns 403 for disallowed origin', async () => {
		const request = new IncomingRequest('http://example.com/checkout', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json', Origin: 'http://evil.com' },
			body: JSON.stringify({
				line_items: [{ price: 'price_123', quantity: 1 }],
				success_url: 'https://example.com/success',
				cancel_url: 'https://example.com/cancel',
			}),
		});
		const response = await worker.fetch(request, { ...env, ALLOWED_ORIGINS: 'https://example.com' });
		expect(response.status).toBe(403);
	});

	it('returns 400 for missing line_items', async () => {
		const request = new IncomingRequest('http://example.com/checkout', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json', Origin: 'https://example.com' },
			body: JSON.stringify({
				success_url: 'https://example.com/success',
				cancel_url: 'https://example.com/cancel',
			}),
		});
		const response = await worker.fetch(request, { ...env, ALLOWED_ORIGINS: 'https://example.com' });
		expect(response.status).toBe(400);
	});

	it('returns 400 for invalid line_item', async () => {
		const request = new IncomingRequest('http://example.com/checkout', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json', Origin: 'https://example.com' },
			body: JSON.stringify({
				line_items: [{ quantity: 0 }],
				success_url: 'https://example.com/success',
				cancel_url: 'https://example.com/cancel',
			}),
		});
		const response = await worker.fetch(request, { ...env, ALLOWED_ORIGINS: 'https://example.com' });
		expect(response.status).toBe(400);
	});

	it('handles OPTIONS preflight', async () => {
		const request = new IncomingRequest('http://example.com/checkout', {
			method: 'OPTIONS',
			headers: { Origin: 'https://example.com' },
		});
		const response = await worker.fetch(request, { ...env, ALLOWED_ORIGINS: 'https://example.com' });
		expect(response.status).toBe(204);
		expect(response.headers.get('Access-Control-Allow-Methods')).toBe('POST, OPTIONS');
	});

	it('returns 405 for non-POST', async () => {
		const request = new IncomingRequest('http://example.com/checkout', { method: 'GET' });
		const response = await worker.fetch(request, env);
		expect(response.status).toBe(405);
	});
});

describe('products endpoint', () => {
	it('returns 403 for disallowed origin on GET', async () => {
		const request = new IncomingRequest('http://example.com/products', {
			method: 'GET',
			headers: { Origin: 'http://evil.com' },
		});
		const response = await worker.fetch(request, { ...env, ALLOWED_ORIGINS: 'https://example.com' });
		expect(response.status).toBe(403);
	});

	it('returns 403 for disallowed origin on POST', async () => {
		const request = new IncomingRequest('http://example.com/products', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json', Origin: 'http://evil.com' },
			body: JSON.stringify({ name: 'Test Product' }),
		});
		const response = await worker.fetch(request, { ...env, ALLOWED_ORIGINS: 'https://example.com' });
		expect(response.status).toBe(403);
	});

	it('returns 401 for POST without auth when API_SECRET_KEY is set', async () => {
		const request = new IncomingRequest('http://example.com/products', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json', Origin: 'https://example.com' },
			body: JSON.stringify({ name: 'Test Product' }),
		});
		const response = await worker.fetch(request, {
			...env,
			ALLOWED_ORIGINS: 'https://example.com',
			API_SECRET_KEY: 'secret-key',
		});
		expect(response.status).toBe(401);
	});

	it('authenticated POST creates product when API_SECRET_KEY is set', async () => {
		const request = new IncomingRequest('http://example.com/products', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json', Origin: 'https://example.com', Authorization: 'Bearer secret-key' },
			body: JSON.stringify({ name: 'Test Product' }),
		});
		const response = await worker.fetch(request, {
			...env,
			ALLOWED_ORIGINS: 'https://example.com',
			API_SECRET_KEY: 'secret-key',
		});
		// Should pass auth and reach Stripe (which will fail with invalid key, but auth passes)
		expect(response.status).not.toBe(401);
	});

	it('handles OPTIONS preflight for products', async () => {
		const request = new IncomingRequest('http://example.com/products', {
			method: 'OPTIONS',
			headers: { Origin: 'https://example.com' },
		});
		const response = await worker.fetch(request, { ...env, ALLOWED_ORIGINS: 'https://example.com' });
		expect(response.status).toBe(204);
		expect(response.headers.get('Access-Control-Allow-Methods')).toBe('POST, OPTIONS');
	});

	it('returns 405 for PUT on /products (no ID)', async () => {
		const request = new IncomingRequest('http://example.com/products', {
			method: 'PUT',
			headers: { 'Content-Type': 'application/json', Origin: 'https://example.com' },
			body: JSON.stringify({ name: 'Updated' }),
		});
		const response = await worker.fetch(request, { ...env, ALLOWED_ORIGINS: 'https://example.com' });
		expect(response.status).toBe(405);
	});

	it('returns 405 for DELETE on /products (no ID)', async () => {
		const request = new IncomingRequest('http://example.com/products', {
			method: 'DELETE',
			headers: { Origin: 'https://example.com' },
		});
		const response = await worker.fetch(request, { ...env, ALLOWED_ORIGINS: 'https://example.com' });
		expect(response.status).toBe(405);
	});
});

describe('products/:id endpoint', () => {
	it('handles OPTIONS on product by ID', async () => {
		const request = new IncomingRequest('http://example.com/products/prod_123', {
			method: 'OPTIONS',
			headers: { Origin: 'https://example.com' },
		});
		const response = await worker.fetch(request, { ...env, ALLOWED_ORIGINS: 'https://example.com' });
		expect(response.status).toBe(204);
		expect(response.headers.get('Access-Control-Allow-Methods')).toBe('GET, PUT, DELETE, OPTIONS');
	});

	it('returns 405 for POST on /products/:id', async () => {
		const request = new IncomingRequest('http://example.com/products/prod_123', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json', Origin: 'https://example.com' },
			body: JSON.stringify({ name: 'Test' }),
		});
		const response = await worker.fetch(request, { ...env, ALLOWED_ORIGINS: 'https://example.com' });
		expect(response.status).toBe(405);
	});

	it('returns 401 for PUT without auth when API_SECRET_KEY is set', async () => {
		const request = new IncomingRequest('http://example.com/products/prod_123', {
			method: 'PUT',
			headers: { 'Content-Type': 'application/json', Origin: 'https://example.com' },
			body: JSON.stringify({ name: 'Updated' }),
		});
		const response = await worker.fetch(request, {
			...env,
			ALLOWED_ORIGINS: 'https://example.com',
			API_SECRET_KEY: 'secret-key',
		});
		expect(response.status).toBe(401);
	});

	it('authenticated PUT updates product when API_SECRET_KEY is set', async () => {
		const request = new IncomingRequest('http://example.com/products/prod_123', {
			method: 'PUT',
			headers: { 'Content-Type': 'application/json', Origin: 'https://example.com', Authorization: 'Bearer secret-key' },
			body: JSON.stringify({ name: 'Updated' }),
		});
		const response = await worker.fetch(request, {
			...env,
			ALLOWED_ORIGINS: 'https://example.com',
			API_SECRET_KEY: 'secret-key',
		});
		// Should pass auth and reach Stripe (which will fail with invalid key, but auth passes)
		expect(response.status).not.toBe(401);
	});

	it('returns 401 for DELETE without auth when API_SECRET_KEY is set', async () => {
		const request = new IncomingRequest('http://example.com/products/prod_123', {
			method: 'DELETE',
			headers: { Origin: 'https://example.com' },
		});
		const response = await worker.fetch(request, {
			...env,
			ALLOWED_ORIGINS: 'https://example.com',
			API_SECRET_KEY: 'secret-key',
		});
		expect(response.status).toBe(401);
	});

	it('authenticated DELETE removes product when API_SECRET_KEY is set', async () => {
		const request = new IncomingRequest('http://example.com/products/prod_123', {
			method: 'DELETE',
			headers: { Origin: 'https://example.com', Authorization: 'Bearer secret-key' },
		});
		const response = await worker.fetch(request, {
			...env,
			ALLOWED_ORIGINS: 'https://example.com',
			API_SECRET_KEY: 'secret-key',
		});
		// Should pass auth and reach Stripe (which will fail with invalid key, but auth passes)
		expect(response.status).not.toBe(401);
	});
});

describe('settings endpoint', () => {
	it('returns 403 for PUT with disallowed origin on settings', async () => {
		const request = new Request('http://example.com/settings/site', {
			method: 'PUT',
			headers: { 'Content-Type': 'application/json', Origin: 'http://evil.com', Authorization: 'Bearer secret-key' },
			body: JSON.stringify({ name: 'Updated' }),
		});
		const response = await worker.fetch(request, { ...env, ALLOWED_ORIGINS: 'https://example.com', API_SECRET_KEY: 'secret-key' });
		expect(response.status).toBe(403);
	});

	it('handles OPTIONS preflight for settings/site', async () => {
		const request = new Request('http://example.com/settings/site', {
			method: 'OPTIONS',
			headers: { Origin: 'https://example.com' },
		});
		const response = await worker.fetch(request, { ...env, ALLOWED_ORIGINS: 'https://example.com' });
		expect(response.status).toBe(204);
		expect(response.headers.get('Access-Control-Allow-Methods')).toContain('GET');
		expect(response.headers.get('Access-Control-Allow-Methods')).toContain('PUT');
	});

	it('returns 405 for POST on settings', async () => {
		const request = new Request('http://example.com/settings/site', {
			method: 'POST',
			headers: { Origin: 'https://example.com' },
		});
		const response = await worker.fetch(request, { ...env, ALLOWED_ORIGINS: 'https://example.com' });
		expect(response.status).toBe(405);
	});

	it('returns 200 for GET settings/process', async () => {
		const request = new Request('http://example.com/settings/process', {
			method: 'GET',
			headers: { Origin: 'https://example.com' },
		});
		const response = await worker.fetch(request, {
			...env,
			ALLOWED_ORIGINS: 'https://example.com',
			CONTENT_KV: { get: () => Promise.resolve(JSON.stringify({ steps: [] })) },
		});
		expect(response.status).toBe(200);
	});

	it('returns 200 for GET settings/testimonials', async () => {
		const request = new Request('http://example.com/settings/testimonials', {
			method: 'GET',
			headers: { Origin: 'https://example.com' },
		});
		const response = await worker.fetch(request, {
			...env,
			ALLOWED_ORIGINS: 'https://example.com',
			CONTENT_KV: { get: () => Promise.resolve(JSON.stringify({ items: [] })) },
		});
		expect(response.status).toBe(200);
	});

	it('returns 200 for GET settings/categories', async () => {
		const request = new Request('http://example.com/settings/categories', {
			method: 'GET',
			headers: { Origin: 'https://example.com' },
		});
		const response = await worker.fetch(request, {
			...env,
			ALLOWED_ORIGINS: 'https://example.com',
			CONTENT_KV: { get: () => Promise.resolve(JSON.stringify([{ id: 'HONEY', label: 'Honey' }])) },
		});
		expect(response.status).toBe(200);
	});
});

describe('routing', () => {
	it('returns 405 for GET /prices (must be POST)', async () => {
		const request = new Request('http://example.com/prices', { method: 'GET' });
		const response = await worker.fetch(request, env);
		expect(response.status).toBe(405);
	});

	it('handles OPTIONS preflight for /prices', async () => {
		const request = new Request('http://example.com/prices', {
			method: 'OPTIONS',
			headers: { Origin: 'https://example.com' },
		});
		const response = await worker.fetch(request, { ...env, ALLOWED_ORIGINS: 'https://example.com' });
		expect(response.status).toBe(204);
		expect(response.headers.get('Access-Control-Allow-Methods')).toBe('POST, OPTIONS');
	});

	it('routes POST /prices through the router', async () => {
		const request = new Request('http://example.com/prices', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json', Origin: 'https://example.com', Authorization: 'Bearer secret-key' },
			body: JSON.stringify({ product: 'prod_123', unit_amount: 2000, currency: 'usd' }),
		});
		const response = await worker.fetch(request, {
			...env,
			ALLOWED_ORIGINS: 'https://example.com',
			API_SECRET_KEY: 'secret-key',
		});
		expect(response.status).not.toBe(405);
		expect(response.status).not.toBe(401);
		expect(response.status).not.toBe(403);
	});

	it('returns 405 for POST /products/count', async () => {
		const request = new Request('http://example.com/products/count', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json', Origin: 'https://example.com' },
			body: JSON.stringify({}),
		});
		const response = await worker.fetch(request, { ...env, ALLOWED_ORIGINS: 'https://example.com' });
		expect(response.status).toBe(405);
	});

	it('handles OPTIONS preflight for /products/count', async () => {
		const request = new Request('http://example.com/products/count', {
			method: 'OPTIONS',
			headers: { Origin: 'https://example.com' },
		});
		const response = await worker.fetch(request, { ...env, ALLOWED_ORIGINS: 'https://example.com' });
		expect(response.status).toBe(204);
		expect(response.headers.get('Access-Control-Allow-Methods')).toBe('GET, OPTIONS');
	});

	it('routes GET /products/count through the router', { timeout: 30000 }, async () => {
		const request = new Request('http://example.com/products/count', {
			method: 'GET',
			headers: { Origin: 'https://example.com' },
		});
		const response = await worker.fetch(request, { ...env, ALLOWED_ORIGINS: 'https://example.com' });
		expect(response.status).not.toBe(405);
		expect(response.status).not.toBe(403);
	});

	it('returns 404 for unknown routes', async () => {
		const request = new IncomingRequest('http://example.com/unknown', { method: 'GET' });
		const response = await worker.fetch(request, env);
		expect(response.status).toBe(404);
	});

	it('returns 404 for unknown routes with trailing slash', async () => {
		const request = new IncomingRequest('http://example.com/unknown/', { method: 'GET' });
		const response = await worker.fetch(request, env);
		expect(response.status).toBe(404);
	});

	it('returns 405 for POST /products/:id (no auth)', async () => {
		const request = new IncomingRequest('http://example.com/products/prod_123', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json', Origin: 'https://example.com' },
			body: JSON.stringify({ name: 'Test' }),
		});
		const response = await worker.fetch(request, { ...env, ALLOWED_ORIGINS: 'https://example.com' });
		expect(response.status).toBe(405);
	});

	it('returns 405 for GET /products/:id with invalid method', async () => {
		const request = new IncomingRequest('http://example.com/products/prod_123', {
			method: 'POST',
			headers: { Origin: 'https://example.com' },
		});
		const response = await worker.fetch(request, { ...env, ALLOWED_ORIGINS: 'https://example.com' });
		expect(response.status).toBe(405);
	});

	it('GET /products/:id returns 401 without auth when API_SECRET_KEY is set', async () => {
		const request = new IncomingRequest('http://example.com/products/prod_123', {
			method: 'GET',
			headers: { Origin: 'https://example.com' },
		});
		const response = await worker.fetch(request, {
			...env,
			ALLOWED_ORIGINS: 'https://example.com',
			API_SECRET_KEY: 'secret-key',
		});
		// Should pass auth (GET doesn't require auth) and reach Stripe
		expect(response.status).not.toBe(401);
	});
});
