/* eslint-disable @typescript-eslint/no-unused-vars */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EStaffRole, EUserStatus } from '@bee-epic/shared';
import { getStripeInstance, setStripeInstance, StripeHandler, withStripeHandler } from '../../src/utils/withStripeHandler';
import { createUser } from '../../src/auth/repo/userRepo';
import { jsonResponse } from '../../src/utils';
import type { HttpMethod } from '../../src/utils/handleCORS';

/**
 * In-memory KV mock supporting user records (used by `resolveCaller`'s
 * dev-bypass path after the Phase 9 rewrite).
 */
function makeKv(): KVNamespace {
	const store = new Map<string, string>();
	return {
		get: vi.fn(async (key: string) => store.get(key) ?? null),
		put: vi.fn(async (key: string, value: string) => {
			store.set(key, value);
		}),
		delete: vi.fn(async (key: string) => {
			store.delete(key);
		}),
		list: vi.fn(async ({ prefix }: { prefix: string; cursor?: string }) => {
			const all = [...store.keys()].filter((k) => k.startsWith(prefix)).map((name) => ({ name }));
			return { keys: all, list_complete: true, cursor: undefined };
		}),
		getWithMetadata: vi.fn(),
	} as unknown as KVNamespace;
}

async function seedUsers(env: Env, members: Array<{ email: string; role: EStaffRole }>): Promise<void> {
	const now = Date.now();
	for (const m of members) {
		await createUser(env, {
			schemaVersion: 1,
			email: m.email,
			displayName: m.email,
			role: m.role,
			status: EUserStatus.ACTIVE,
			passwordHash: null,
			createdAt: now,
			updatedAt: now,
			lastLoginAt: null,
			lastLoginIp: null,
		});
	}
}

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
		const mockDO = {
			getByName: vi.fn().mockReturnValue({
				check: vi.fn().mockResolvedValue({ allowed: false, remaining: 0, resetTime: Math.floor(Date.now() / 1000) + 60 }),
			}),
		};
		const env = {
			ALLOWED_ORIGINS: 'https://example.com',
			STRIPE_SECRET_KEY: 'sk_test_123',
			RATE_LIMITER: mockDO,
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
		expect(body.ok).toBe(false);
		expect(body.error.code).toBe('BAD_REQUEST');
		// Untyped error → message is scrubbed to the generic string (info-leak fix).
		expect(body.error.message).toBe('The payment provider rejected the request.');
	});

	it('relays the message for a StripeInvalidRequestError (<500)', async () => {
		const errorHandler = vi.fn().mockImplementation(() => {
			throw { statusCode: 400, type: 'StripeInvalidRequestError', message: 'No such price: price_x' };
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
		expect(body.error.code).toBe('BAD_REQUEST');
		expect(body.error.message).toBe('No such price: price_x');
	});

	it('scrubs the message for a StripeAuthenticationError (<500)', async () => {
		const errorHandler = vi.fn().mockImplementation(() => {
			throw { statusCode: 401, type: 'StripeAuthenticationError', message: 'Invalid API Key provided: sk_live_****' };
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
		expect(body.error.code).toBe('BAD_REQUEST');
		expect(body.error.message).toBe('The payment provider rejected the request.');
		expect(body.error.message).not.toContain('sk_live');
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
		expect(body.ok).toBe(false);
		expect(body.error.code).toBe('INTERNAL');
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
		expect(body.ok).toBe(false);
		expect(body.error.code).toBe('INTERNAL');
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
		expect(body.ok).toBe(false);
		expect(body.error.code).toBe('BAD_REQUEST');
	});

	describe('requiredRole option (Plan 3)', () => {
		const USERS: Array<{ email: string; role: EStaffRole }> = [
			{ email: 'owner@test.com', role: EStaffRole.OWNER },
			{ email: 'manager@test.com', role: EStaffRole.MANAGER },
			{ email: 'staff@test.com', role: EStaffRole.EMPLOYEE },
		];

		it('returns 401 UNAUTHORIZED when requiredRole is set and no caller resolves', async () => {
			const handler = withStripeHandler('POST' as HttpMethod, mockHandler, { requiredRole: EStaffRole.MANAGER });
			const request = new Request('http://example.com/products', {
				method: 'POST',
				headers: { Origin: 'https://example.com' },
			});
			const env = {
				ALLOWED_ORIGINS: 'https://example.com',
				STRIPE_SECRET_KEY: 'sk_test_123',
				CONTENT_KV: makeKv(),
				ENVIRONMENT: 'production',
			} as unknown as Env;
			await seedUsers(env, USERS);
			const response = await handler(request, env);
			expect(response.status).toBe(401);
			const body = (await response.json()) as any;
			expect(body.ok).toBe(false);
			expect(body.error.code).toBe('UNAUTHORIZED');
			expect(mockHandler).not.toHaveBeenCalled();
		});

		it('returns 403 FORBIDDEN with requiredRole when caller rank is too low', async () => {
			const handler = withStripeHandler('POST' as HttpMethod, mockHandler, { requiredRole: EStaffRole.MANAGER });
			const request = new Request('http://example.com/products', {
				method: 'POST',
				headers: { Origin: 'https://example.com', 'X-Dev-Email': 'staff@test.com' },
			});
			const env = {
				ALLOWED_ORIGINS: 'https://example.com',
				STRIPE_SECRET_KEY: 'sk_test_123',
				CONTENT_KV: makeKv(),
				ENVIRONMENT: 'development',
			} as unknown as Env;
			await seedUsers(env, USERS);
			const response = await handler(request, env);
			expect(response.status).toBe(403);
			const body = (await response.json()) as any;
			expect(body.ok).toBe(false);
			expect(body.error.code).toBe('FORBIDDEN');
			expect(body.error.requiredRole).toBe(EStaffRole.MANAGER);
			expect(mockHandler).not.toHaveBeenCalled();
		});

		it('calls handler when caller satisfies requiredRole exactly', async () => {
			mockHandler.mockResolvedValue(jsonResponse({ ok: true, data: {} }, 200, 'https://example.com'));
			const handler = withStripeHandler('POST' as HttpMethod, mockHandler, { requiredRole: EStaffRole.MANAGER });
			const request = new Request('http://example.com/products', {
				method: 'POST',
				headers: { Origin: 'https://example.com', 'X-Dev-Email': 'manager@test.com' },
			});
			const env = {
				ALLOWED_ORIGINS: 'https://example.com',
				STRIPE_SECRET_KEY: 'sk_test_123',
				CONTENT_KV: makeKv(),
				ENVIRONMENT: 'development',
			} as unknown as Env;
			await seedUsers(env, USERS);
			const response = await handler(request, env);
			expect(response.status).toBe(200);
			expect(mockHandler).toHaveBeenCalled();
		});

		it('calls handler when caller rank exceeds requiredRole (OWNER on MANAGER route)', async () => {
			mockHandler.mockResolvedValue(jsonResponse({ ok: true, data: {} }, 200, 'https://example.com'));
			const handler = withStripeHandler('POST' as HttpMethod, mockHandler, { requiredRole: EStaffRole.MANAGER });
			const request = new Request('http://example.com/products', {
				method: 'POST',
				headers: { Origin: 'https://example.com', 'X-Dev-Email': 'owner@test.com' },
			});
			const env = {
				ALLOWED_ORIGINS: 'https://example.com',
				STRIPE_SECRET_KEY: 'sk_test_123',
				CONTENT_KV: makeKv(),
				ENVIRONMENT: 'development',
			} as unknown as Env;
			await seedUsers(env, USERS);
			const response = await handler(request, env);
			expect(response.status).toBe(200);
			expect(mockHandler).toHaveBeenCalled();
		});

		it('accepts the bearer fallback as OWNER role', async () => {
			mockHandler.mockResolvedValue(jsonResponse({ ok: true, data: {} }, 200, 'https://example.com'));
			const handler = withStripeHandler('POST' as HttpMethod, mockHandler, { requiredRole: EStaffRole.MANAGER });
			const request = new Request('http://example.com/products', {
				method: 'POST',
				headers: { Origin: 'https://example.com', Authorization: 'Bearer ci-secret' },
			});
			const env = {
				ALLOWED_ORIGINS: 'https://example.com',
				STRIPE_SECRET_KEY: 'sk_test_123',
				CONTENT_KV: makeKv(),
				API_SECRET_KEY: 'ci-secret',
				ENVIRONMENT: 'production',
			} as unknown as Env;
			await seedUsers(env, USERS);
			const response = await handler(request, env);
			expect(response.status).toBe(200);
			expect(mockHandler).toHaveBeenCalled();
		});

		it('skips the auth gate entirely when requiredRole is not set', async () => {
			mockHandler.mockResolvedValue(jsonResponse({ ok: true, data: {} }, 200, 'https://example.com'));
			const handler = withStripeHandler('POST' as HttpMethod, mockHandler);
			const request = new Request('http://example.com/checkout', {
				method: 'POST',
				headers: { Origin: 'https://example.com' },
			});
			const env = {
				ALLOWED_ORIGINS: 'https://example.com',
				STRIPE_SECRET_KEY: 'sk_test_123',
				CONTENT_KV: makeKv(),
				ENVIRONMENT: 'production',
			} as unknown as Env;
			const response = await handler(request, env);
			expect(response.status).toBe(200);
			expect(mockHandler).toHaveBeenCalled();
		});

		it('forwards the resolved caller to the handler as the 5th arg', async () => {
			const captureHandler = vi.fn().mockResolvedValue(jsonResponse({ ok: true, data: {} }, 200, 'https://example.com'));
			const handler = withStripeHandler('POST' as HttpMethod, captureHandler, { requiredRole: EStaffRole.EMPLOYEE });
			const request = new Request('http://example.com/orders', {
				method: 'POST',
				headers: { Origin: 'https://example.com', 'X-Dev-Email': 'staff@test.com' },
			});
			const env = {
				ALLOWED_ORIGINS: 'https://example.com',
				STRIPE_SECRET_KEY: 'sk_test_123',
				CONTENT_KV: makeKv(),
				ENVIRONMENT: 'development',
			} as unknown as Env;
			await seedUsers(env, USERS);
			await handler(request, env);
			expect(captureHandler).toHaveBeenCalled();
			const caller = captureHandler.mock.calls[0][4];
			expect(caller).toEqual({ email: 'staff@test.com', role: EStaffRole.EMPLOYEE, via: 'dev' });
		});
	});
});

interface IGlobalWithVitest {
	__vitest_worker__?: unknown;
}

describe('setStripeInstance — test-env gate (review C5)', () => {
	let originalWorker: unknown;

	beforeEach(() => {
		const g = globalThis as IGlobalWithVitest;
		originalWorker = g.__vitest_worker__;
		// Start each test with the singleton cleared so getStripeInstance is
		// forced to construct fresh, exposing whether setStripeInstance took.
		setStripeInstance(null);
	});

	afterEach(() => {
		const g = globalThis as IGlobalWithVitest;
		g.__vitest_worker__ = originalWorker;
		setStripeInstance(null);
	});

	it('installs the fake when inside a vitest worker (normal test path)', () => {
		const fake = { whoami: 'fake' } as unknown as Parameters<typeof setStripeInstance>[0];
		setStripeInstance(fake);
		const got = getStripeInstance({ STRIPE_SECRET_KEY: 'sk_test' } as Env);
		expect(got).toBe(fake);
	});

	it('no-ops when __vitest_worker__ is absent (simulated production import)', () => {
		const g = globalThis as IGlobalWithVitest;
		// Pre-condition: singleton is null (beforeEach cleared it).
		const fake = { whoami: 'should-not-take' } as unknown as Parameters<typeof setStripeInstance>[0];
		// Briefly remove the test-env signal so the gate fires, then restore.
		delete g.__vitest_worker__;
		try {
			setStripeInstance(fake);
		} finally {
			g.__vitest_worker__ = originalWorker;
		}
		// Singleton should still be null. getStripeInstance will construct a
		// brand-new Stripe (going through the global Stripe mock from
		// test/setup.ts), NOT return `fake`.
		const got = getStripeInstance({ STRIPE_SECRET_KEY: 'sk_test' } as Env);
		expect(got).not.toBe(fake);
	});
});
