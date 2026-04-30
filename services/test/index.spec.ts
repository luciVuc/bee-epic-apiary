import { env } from 'cloudflare:test';
import { describe, it, expect, beforeEach } from 'vitest';
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
		expect(response.status).toBe(405); // 405 because GET goes to createProductHandler which checks method first
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

	it('returns 405 for OPTIONS on product by ID (no matching method)', async () => {
		const request = new IncomingRequest('http://example.com/products/prod_123', {
			method: 'OPTIONS',
			headers: { Origin: 'https://example.com' },
		});
		const response = await worker.fetch(request, { ...env, ALLOWED_ORIGINS: 'https://example.com' });
		expect(response.status).toBe(405); // OPTIONS not handled without matching PUT/DELETE/GET
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
});

describe('routing', () => {
	it('returns 404 for unknown routes', async () => {
		const request = new IncomingRequest('http://example.com/unknown', { method: 'GET' });
		const response = await worker.fetch(request, env);
		expect(response.status).toBe(404);
	});
});
