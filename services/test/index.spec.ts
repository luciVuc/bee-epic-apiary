import { env, createExecutionContext, waitOnExecutionContext, SELF } from 'cloudflare:test';
import { describe, it, expect } from 'vitest';
import worker from '../src/index';

const IncomingRequest = Request<unknown, IncomingRequestCfProperties>;

describe('stripe-checkout', () => {
	it('returns 403 for disallowed origin', async () => {
		const request = new IncomingRequest('http://example.com/', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json', Origin: 'http://evil.com' },
			body: JSON.stringify({
				lineItems: [{ price: 'price_123', quantity: 1 }],
				successUrl: 'https://example.com/success',
				cancelUrl: 'https://example.com/cancel',
			}),
		});
		const ctx = createExecutionContext();
		const response = await worker.fetch(request, { ...env, ALLOWED_ORIGINS: 'https://example.com' }, ctx);
		await waitOnExecutionContext(ctx);
		expect(response.status).toBe(403);
	});

	it('returns 400 for missing lineItems', async () => {
		const request = new IncomingRequest('http://example.com/', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json', Origin: 'https://example.com' },
			body: JSON.stringify({
				successUrl: 'https://example.com/success',
				cancelUrl: 'https://example.com/cancel',
			}),
		});
		const ctx = createExecutionContext();
		const response = await worker.fetch(request, { ...env, ALLOWED_ORIGINS: 'https://example.com' }, ctx);
		await waitOnExecutionContext(ctx);
		expect(response.status).toBe(400);
	});

	it('returns 400 for invalid lineItem', async () => {
		const request = new IncomingRequest('http://example.com/', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json', Origin: 'https://example.com' },
			body: JSON.stringify({
				lineItems: [{ quantity: 0 }],
				successUrl: 'https://example.com/success',
				cancelUrl: 'https://example.com/cancel',
			}),
		});
		const ctx = createExecutionContext();
		const response = await worker.fetch(request, { ...env, ALLOWED_ORIGINS: 'https://example.com' }, ctx);
		await waitOnExecutionContext(ctx);
		expect(response.status).toBe(400);
	});

	it('handles OPTIONS preflight', async () => {
		const request = new IncomingRequest('http://example.com/', {
			method: 'OPTIONS',
			headers: { Origin: 'https://example.com' },
		});
		const ctx = createExecutionContext();
		const response = await worker.fetch(request, { ...env, ALLOWED_ORIGINS: 'https://example.com' }, ctx);
		await waitOnExecutionContext(ctx);
		expect(response.status).toBe(204);
		expect(response.headers.get('Access-Control-Allow-Methods')).toBe('POST, OPTIONS');
	});

	it('returns 405 for non-POST', async () => {
		const request = new IncomingRequest('http://example.com/', { method: 'GET' });
		const ctx = createExecutionContext();
		const response = await worker.fetch(request, env, ctx);
		await waitOnExecutionContext(ctx);
		expect(response.status).toBe(405);
	});
});
