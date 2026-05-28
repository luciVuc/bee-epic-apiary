/* eslint-disable @typescript-eslint/no-unused-vars */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { StripeHandler, withStripeHandler } from '../../src/utils/withStripeHandler';
import { jsonResponse } from '../../src/utils';
import type { HttpMethod } from '../../src/utils/handleCORS';

describe('withStripeHandler', () => {
	let mockHandler: StripeHandler;
	let mockStripeInstance: any;

	beforeEach(() => {
		mockHandler = vi.fn();
		mockStripeInstance = {
			checkout: {
				sessions: {
					create: vi.fn(),
				},
			},
			products: {
				create: vi.fn(),
				retrieve: vi.fn(),
				update: vi.fn(),
				del: vi.fn(),
				list: vi.fn(),
			},
			prices: {
				retrieve: vi.fn(),
			},
		};
	});

	it('returns 405 for wrong method', async () => {
		const handler = withStripeHandler('POST' as HttpMethod, mockHandler as StripeHandler);
		const request = new Request('http://example.com/checkout', { method: 'GET' });
		const env = { ALLOWED_ORIGINS: 'https://example.com', STRIPE_SECRET_KEY: 'sk_test_123' } as Env;
		const response = await handler(request, env);
		expect(response.status).toBe(405);
		expect(mockHandler).not.toHaveBeenCalled();
	});

	it('returns 403 for disallowed origin', async () => {
		const handler = withStripeHandler('POST' as HttpMethod, mockHandler);
		const request = new Request('http://example.com/checkout', {
			method: 'POST',
			headers: { Origin: 'https://evil.com' },
		});
		const env = { ALLOWED_ORIGINS: 'https://example.com', STRIPE_SECRET_KEY: 'sk_test_123' } as Env;
		const response = await handler(request, env);
		expect(response.status).toBe(403);
		expect(mockHandler).not.toHaveBeenCalled();
	});

	it('handles OPTIONS preflight', async () => {
		const handler = withStripeHandler('POST' as HttpMethod, mockHandler);
		const request = new Request('http://example.com/checkout', {
			method: 'OPTIONS',
			headers: { Origin: 'https://example.com' },
		});
		const env = { ALLOWED_ORIGINS: 'https://example.com' } as Env;
		const response = await handler(request, env);
		expect(response.status).toBe(204);
		expect(mockHandler).not.toHaveBeenCalled();
	});

	it('calls handler for valid request', async () => {
		mockHandler.mockResolvedValue(jsonResponse({ success: true }, 200, 'https://example.com'));
		const handler = withStripeHandler('POST' as HttpMethod, mockHandler);
		const request = new Request('http://example.com/checkout', {
			method: 'POST',
			headers: { Origin: 'https://example.com' },
		});
		const env = { ALLOWED_ORIGINS: 'https://example.com', STRIPE_SECRET_KEY: 'sk_test_123' } as Env;
		await handler(request, env);
		expect(mockHandler).toHaveBeenCalled();
	});

	it('returns 429 when rate limit exceeded', async () => {
		const handler = withStripeHandler('POST' as HttpMethod, mockHandler);
		const request = new Request('http://example.com/checkout', {
			method: 'POST',
			headers: { Origin: 'https://example.com', 'CF-Connecting-IP': '127.0.0.1' },
		});
		const mockKV = {
			get: vi.fn().mockResolvedValue('100'),
			put: vi.fn().mockResolvedValue(undefined),
		};
		const env = {
			ALLOWED_ORIGINS: 'https://example.com',
			STRIPE_SECRET_KEY: 'sk_test_123',
			RATE_LIMIT_KV: mockKV,
			RATE_LIMIT_MAX: '100',
			RATE_LIMIT_WINDOW: '60',
		} as unknown as Env;
		const response = await handler(request, env);
		expect(response.status).toBe(429);
	});

	it('handles Stripe errors with statusCode <500', async () => {
		const errorHandler = vi.fn().mockImplementation(() => {
			throw { statusCode: 400, message: 'Bad request' };
		});
		const handler = withStripeHandler('POST' as HttpMethod, errorHandler);
		const request = new Request('http://example.com/checkout', {
			method: 'POST',
			headers: { Origin: 'https://example.com' },
		});
		const env = { ALLOWED_ORIGINS: 'https://example.com', STRIPE_SECRET_KEY: 'sk_test_123' } as Env;
		const response = await handler(request, env);
		expect(response.status).toBe(400);
		const body = (await response.json()) as any;
		expect(body.error).toBe('An error occurred');
	});

	it('handles Stripe errors with statusCode >=500', async () => {
		const errorHandler = vi.fn().mockImplementation(() => {
			throw { statusCode: 500, message: 'Internal server error details' };
		});
		const handler = withStripeHandler('POST' as HttpMethod, errorHandler);
		const request = new Request('http://example.com/checkout', {
			method: 'POST',
			headers: { Origin: 'https://example.com' },
		});
		const env = { ALLOWED_ORIGINS: 'https://example.com', STRIPE_SECRET_KEY: 'sk_test_123' } as Env;
		const response = await handler(request, env);
		expect(response.status).toBe(500);
		const body = (await response.json()) as any;
		expect(body.error).toBe('An error occurred');
	});

	it('handles errors without statusCode', async () => {
		const errorHandler = vi.fn().mockImplementation(() => {
			throw new Error('Something went wrong');
		});
		const handler = withStripeHandler('POST' as HttpMethod, errorHandler);
		const request = new Request('http://example.com/checkout', {
			method: 'POST',
			headers: { Origin: 'https://example.com' },
		});
		const env = { ALLOWED_ORIGINS: 'https://example.com', STRIPE_SECRET_KEY: 'sk_test_123' } as Env;
		const response = await handler(request, env);
		expect(response.status).toBe(500);
		const body = (await response.json()) as any;
		expect(body.error).toBe('An error occurred');
	});

	it('handles Stripe errors with statusCode < 500 and missing message', async () => {
		const errorHandler = vi.fn().mockImplementation(() => {
			throw { statusCode: 400 }; // No message
		});
		const handler = withStripeHandler('POST' as HttpMethod, errorHandler);
		const request = new Request('http://example.com/checkout', {
			method: 'POST',
			headers: { Origin: 'https://example.com' },
		});
		const env = { ALLOWED_ORIGINS: 'https://example.com', STRIPE_SECRET_KEY: 'sk_test_123' } as Env;
		const response = await handler(request, env);
		expect(response.status).toBe(400);
		const body = (await response.json()) as any;
		expect(body.error).toBe('An error occurred');
	});
});
