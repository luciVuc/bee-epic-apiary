import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EStaffRole } from '@bee-epic/shared';
import { withAuthHandler, AuthHandler } from '../../src/utils/withAuthHandler';
import { jsonResponse } from '../../src/utils';
import type { HttpMethod } from '../../src/utils/handleCORS';
import type { ICaller } from '../../src/utils/resolveCaller';

// Mock resolveCaller: the real one now depends on the Phase 9 auth records
// (userRepo + JWT + bearer). Mocking here isolates withAuthHandler's
// ordering/decision logic from that plumbing. The mock resolves callers
// from the `X-Dev-Email` header only; tests needing bearer or cookie
// behavior override with `mockedResolveCaller.mockImplementation(...)`.
vi.mock('../../src/utils/resolveCaller', async () => {
	const actual = await vi.importActual<typeof import('../../src/utils/resolveCaller')>('../../src/utils/resolveCaller');
	return {
		...actual,
		resolveCaller: vi.fn(),
	};
});

import { resolveCaller } from '../../src/utils/resolveCaller';
const mockedResolveCaller = vi.mocked(resolveCaller);

/** KV mock kept for signature parity with the reference spec, unused in these tests. */
function makeKv(staffData?: object): KVNamespace {
	const store: Record<string, string> = {};
	if (staffData) store['staff'] = JSON.stringify(staffData);
	return {
		get: vi.fn(async (key: string) => store[key] ?? null),
		put: vi.fn(async (key: string, value: string) => {
			store[key] = value;
		}),
		delete: vi.fn(),
		list: vi.fn(),
		getWithMetadata: vi.fn(),
	} as unknown as KVNamespace;
}

const STAFF_LIST = [
	{ email: 'owner@test.com', role: EStaffRole.OWNER, invitedAt: 1000 },
	{ email: 'manager@test.com', role: EStaffRole.MANAGER, invitedAt: 2000 },
	{ email: 'employee@test.com', role: EStaffRole.EMPLOYEE, invitedAt: 3000 },
	{ email: 'vendor@test.com', role: EStaffRole.VENDOR, invitedAt: 4000 },
];

/** Look up a caller from STAFF_LIST by the X-Dev-Email header. */
function callerFromDevHeader(request: Request): ICaller | null {
	const email = request.headers.get('X-Dev-Email');
	if (!email) return null;
	const member = STAFF_LIST.find((m) => m.email === email);
	if (!member) return null;
	return { email: member.email, role: member.role, via: 'dev' };
}

describe('withAuthHandler', () => {
	let mockHandler: AuthHandler;

	beforeEach(() => {
		mockHandler = vi.fn();
		mockedResolveCaller.mockReset();
		// Default: resolve caller from X-Dev-Email header if present, else null.
		mockedResolveCaller.mockImplementation(async (request: Request) => callerFromDevHeader(request));
	});

	it('returns 204 with CORS headers for OPTIONS preflight', async () => {
		const handler = withAuthHandler('POST' as HttpMethod, mockHandler);
		const request = new Request('http://example.com/auth/login', {
			method: 'OPTIONS',
			headers: { Origin: 'https://example.com' },
		});
		const env = { ALLOWED_ORIGINS: 'https://example.com' } as Env;
		const response = await handler(request, env);
		expect(response.status).toBe(204);
		expect(response.headers.get('Access-Control-Allow-Methods')).toContain('POST');
		expect(response.headers.get('Access-Control-Allow-Methods')).toContain('OPTIONS');
		expect(mockHandler).not.toHaveBeenCalled();
	});

	it('returns 405 METHOD_NOT_ALLOWED when method mismatches', async () => {
		const handler = withAuthHandler('POST' as HttpMethod, mockHandler);
		const request = new Request('http://example.com/auth/login', {
			method: 'GET',
			headers: { Origin: 'https://example.com' },
		});
		const env = { ALLOWED_ORIGINS: 'https://example.com' } as Env;
		const response = await handler(request, env);
		expect(response.status).toBe(405);
		const body = (await response.json()) as any;
		expect(body.ok).toBe(false);
		expect(body.error.code).toBe('METHOD_NOT_ALLOWED');
		expect(body.error.allowed).toEqual(['POST', 'OPTIONS']);
		expect(mockHandler).not.toHaveBeenCalled();
	});

	it('returns 403 UNAUTHORIZED (raw envelope) when origin is disallowed', async () => {
		const handler = withAuthHandler('POST' as HttpMethod, mockHandler);
		const request = new Request('http://example.com/auth/login', {
			method: 'POST',
			headers: { Origin: 'https://evil.com' },
		});
		const env = { ALLOWED_ORIGINS: 'https://example.com' } as Env;
		const response = await handler(request, env);
		expect(response.status).toBe(403);
		const body = (await response.json()) as any;
		expect(body.ok).toBe(false);
		expect(body.error.code).toBe('UNAUTHORIZED');
		expect(mockHandler).not.toHaveBeenCalled();
	});

	it('returns 401 UNAUTHORIZED when requiredRole set and no caller resolves', async () => {
		const handler = withAuthHandler('POST' as HttpMethod, mockHandler, { requiredRole: EStaffRole.MANAGER });
		const request = new Request('http://example.com/users', {
			method: 'POST',
			headers: { Origin: 'https://example.com' },
		});
		const env = {
			ALLOWED_ORIGINS: 'https://example.com',
			CONTENT_KV: makeKv(STAFF_LIST),
			ENVIRONMENT: 'production',
		} as unknown as Env;
		const response = await handler(request, env);
		expect(response.status).toBe(401);
		const body = (await response.json()) as any;
		expect(body.ok).toBe(false);
		expect(body.error.code).toBe('UNAUTHORIZED');
		expect(mockHandler).not.toHaveBeenCalled();
	});

	it('returns 403 FORBIDDEN with requiredRole when caller rank is too low', async () => {
		const handler = withAuthHandler('POST' as HttpMethod, mockHandler, { requiredRole: EStaffRole.MANAGER });
		const request = new Request('http://example.com/users', {
			method: 'POST',
			headers: { Origin: 'https://example.com', 'X-Dev-Email': 'employee@test.com' },
		});
		const env = {
			ALLOWED_ORIGINS: 'https://example.com',
			CONTENT_KV: makeKv(STAFF_LIST),
			ENVIRONMENT: 'development',
		} as unknown as Env;
		const response = await handler(request, env);
		expect(response.status).toBe(403);
		const body = (await response.json()) as any;
		expect(body.ok).toBe(false);
		expect(body.error.code).toBe('FORBIDDEN');
		expect(body.error.requiredRole).toBe(EStaffRole.MANAGER);
		expect(mockHandler).not.toHaveBeenCalled();
	});

	it('calls handler when caller satisfies requiredRole exactly (EMPLOYEE on EMPLOYEE route)', async () => {
		(mockHandler as any).mockResolvedValue(jsonResponse({ ok: true, data: {} }, 200, 'https://example.com'));
		const handler = withAuthHandler('POST' as HttpMethod, mockHandler, { requiredRole: EStaffRole.EMPLOYEE });
		const request = new Request('http://example.com/orders', {
			method: 'POST',
			headers: { Origin: 'https://example.com', 'X-Dev-Email': 'employee@test.com' },
		});
		const env = {
			ALLOWED_ORIGINS: 'https://example.com',
			CONTENT_KV: makeKv(STAFF_LIST),
			ENVIRONMENT: 'development',
		} as unknown as Env;
		const response = await handler(request, env);
		expect(response.status).toBe(200);
		expect(mockHandler).toHaveBeenCalled();
	});

	it('calls handler when caller rank exceeds requiredRole (OWNER on MANAGER route)', async () => {
		(mockHandler as any).mockResolvedValue(jsonResponse({ ok: true, data: {} }, 200, 'https://example.com'));
		const handler = withAuthHandler('POST' as HttpMethod, mockHandler, { requiredRole: EStaffRole.MANAGER });
		const request = new Request('http://example.com/users', {
			method: 'POST',
			headers: { Origin: 'https://example.com', 'X-Dev-Email': 'owner@test.com' },
		});
		const env = {
			ALLOWED_ORIGINS: 'https://example.com',
			CONTENT_KV: makeKv(STAFF_LIST),
			ENVIRONMENT: 'development',
		} as unknown as Env;
		const response = await handler(request, env);
		expect(response.status).toBe(200);
		expect(mockHandler).toHaveBeenCalled();
	});

	it('returns 429 RATE_LIMITED when limiter denies', async () => {
		const handler = withAuthHandler('POST' as HttpMethod, mockHandler, { public: true });
		const request = new Request('http://example.com/auth/login', {
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
			RATE_LIMITER: mockDO,
			RATE_LIMIT_MAX: '100',
			RATE_LIMIT_WINDOW: '60',
		} as unknown as Env;
		const response = await handler(request, env);
		expect(response.status).toBe(429);
		const body = (await response.json()) as any;
		expect(body.ok).toBe(false);
		expect(body.error.code).toBe('RATE_LIMITED');
		expect(mockHandler).not.toHaveBeenCalled();
	});

	it('forwards the resolved caller as the 4th arg to the handler', async () => {
		const captureHandler = vi.fn().mockResolvedValue(jsonResponse({ ok: true, data: {} }, 200, 'https://example.com'));
		const handler = withAuthHandler('POST' as HttpMethod, captureHandler, { requiredRole: EStaffRole.EMPLOYEE });
		const request = new Request('http://example.com/orders', {
			method: 'POST',
			headers: { Origin: 'https://example.com', 'X-Dev-Email': 'employee@test.com' },
		});
		const env = {
			ALLOWED_ORIGINS: 'https://example.com',
			CONTENT_KV: makeKv(STAFF_LIST),
			ENVIRONMENT: 'development',
		} as unknown as Env;
		await handler(request, env);
		expect(captureHandler).toHaveBeenCalled();
		const caller = captureHandler.mock.calls[0][3];
		expect(caller).toEqual({ email: 'employee@test.com', role: EStaffRole.EMPLOYEE, via: 'dev' });
	});

	it('returns 401 for unauth POST when no requiredRole and public!==true', async () => {
		const handler = withAuthHandler('POST' as HttpMethod, mockHandler);
		const request = new Request('http://example.com/things', {
			method: 'POST',
			headers: { Origin: 'https://example.com' },
		});
		const env = {
			ALLOWED_ORIGINS: 'https://example.com',
			CONTENT_KV: makeKv(STAFF_LIST),
			ENVIRONMENT: 'production',
		} as unknown as Env;
		const response = await handler(request, env);
		expect(response.status).toBe(401);
		const body = (await response.json()) as any;
		expect(body.ok).toBe(false);
		expect(body.error.code).toBe('UNAUTHORIZED');
		expect(mockHandler).not.toHaveBeenCalled();
	});

	it('returns 403 FORBIDDEN_WRITE_ROLE for VENDOR POST when no requiredRole and public!==true', async () => {
		const handler = withAuthHandler('POST' as HttpMethod, mockHandler);
		const request = new Request('http://example.com/things', {
			method: 'POST',
			headers: { Origin: 'https://example.com', 'X-Dev-Email': 'vendor@test.com' },
		});
		const env = {
			ALLOWED_ORIGINS: 'https://example.com',
			CONTENT_KV: makeKv(STAFF_LIST),
			ENVIRONMENT: 'development',
		} as unknown as Env;
		const response = await handler(request, env);
		expect(response.status).toBe(403);
		const body = (await response.json()) as any;
		expect(body.ok).toBe(false);
		expect(body.error.code).toBe('FORBIDDEN_WRITE_ROLE');
		expect(body.error.requiredRole).toBe(EStaffRole.EMPLOYEE);
		expect(mockHandler).not.toHaveBeenCalled();
	});

	it('applies the write-method floor to PATCH (VENDOR → 403 FORBIDDEN_WRITE_ROLE)', async () => {
		const handler = withAuthHandler('PATCH' as HttpMethod, mockHandler);
		const request = new Request('http://example.com/things', {
			method: 'PATCH',
			headers: { Origin: 'https://example.com', 'X-Dev-Email': 'vendor@test.com' },
		});
		const env = {
			ALLOWED_ORIGINS: 'https://example.com',
			CONTENT_KV: makeKv(STAFF_LIST),
			ENVIRONMENT: 'development',
		} as unknown as Env;
		const response = await handler(request, env);
		expect(response.status).toBe(403);
		const body = (await response.json()) as any;
		expect(body.ok).toBe(false);
		expect(body.error.code).toBe('FORBIDDEN_WRITE_ROLE');
		expect(body.error.requiredRole).toBe(EStaffRole.EMPLOYEE);
		expect(mockHandler).not.toHaveBeenCalled();
	});

	it('calls handler for EMPLOYEE POST when no requiredRole', async () => {
		(mockHandler as any).mockResolvedValue(jsonResponse({ ok: true, data: {} }, 200, 'https://example.com'));
		const handler = withAuthHandler('POST' as HttpMethod, mockHandler);
		const request = new Request('http://example.com/things', {
			method: 'POST',
			headers: { Origin: 'https://example.com', 'X-Dev-Email': 'employee@test.com' },
		});
		const env = {
			ALLOWED_ORIGINS: 'https://example.com',
			CONTENT_KV: makeKv(STAFF_LIST),
			ENVIRONMENT: 'development',
		} as unknown as Env;
		const response = await handler(request, env);
		expect(response.status).toBe(200);
		expect(mockHandler).toHaveBeenCalled();
	});

	it('bypasses the write-method floor when options.public === true', async () => {
		const captureHandler = vi.fn().mockResolvedValue(jsonResponse({ ok: true, data: {} }, 200, 'https://example.com'));
		const handler = withAuthHandler('POST' as HttpMethod, captureHandler, { public: true });
		const request = new Request('http://example.com/auth/login', {
			method: 'POST',
			headers: { Origin: 'https://example.com' },
		});
		const env = {
			ALLOWED_ORIGINS: 'https://example.com',
		} as unknown as Env;
		const response = await handler(request, env);
		expect(response.status).toBe(200);
		expect(captureHandler).toHaveBeenCalled();
		// caller should be undefined — no auth resolution performed
		const caller = captureHandler.mock.calls[0][3];
		expect(caller).toBeUndefined();
		expect(mockedResolveCaller).not.toHaveBeenCalled();
	});

	it('does NOT apply the write floor to GET (idempotent)', async () => {
		const captureHandler = vi.fn().mockResolvedValue(jsonResponse({ ok: true, data: {} }, 200, 'https://example.com'));
		const handler = withAuthHandler('GET' as HttpMethod, captureHandler);
		const request = new Request('http://example.com/things', {
			method: 'GET',
			headers: { Origin: 'https://example.com' },
		});
		const env = {
			ALLOWED_ORIGINS: 'https://example.com',
			CONTENT_KV: makeKv(STAFF_LIST),
			ENVIRONMENT: 'production',
		} as unknown as Env;
		const response = await handler(request, env);
		expect(response.status).toBe(200);
		expect(captureHandler).toHaveBeenCalled();
		const caller = captureHandler.mock.calls[0][3];
		expect(caller).toBeUndefined();
		expect(mockedResolveCaller).not.toHaveBeenCalled();
	});

	it('handler receives origin as 3rd arg (nullable string)', async () => {
		const captureHandler = vi.fn().mockResolvedValue(jsonResponse({ ok: true, data: {} }, 200, 'https://example.com'));
		const handler = withAuthHandler('GET' as HttpMethod, captureHandler);
		const request = new Request('http://example.com/things', {
			method: 'GET',
			headers: { Origin: 'https://example.com' },
		});
		const env = {
			ALLOWED_ORIGINS: 'https://example.com',
		} as unknown as Env;
		await handler(request, env);
		expect(captureHandler).toHaveBeenCalled();
		const originArg = captureHandler.mock.calls[0][2];
		expect(originArg).toBe('https://example.com');
	});

	it('catches unexpected errors and returns 500 INTERNAL', async () => {
		const errorHandler = vi.fn().mockImplementation(() => {
			throw new Error('Boom');
		});
		const handler = withAuthHandler('POST' as HttpMethod, errorHandler, { public: true });
		const request = new Request('http://example.com/auth/login', {
			method: 'POST',
			headers: { Origin: 'https://example.com' },
		});
		const env = { ALLOWED_ORIGINS: 'https://example.com' } as Env;
		// Suppress the expected console.error noise for this negative-path test.
		const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
		const response = await handler(request, env);
		expect(response.status).toBe(500);
		const body = (await response.json()) as any;
		expect(body.ok).toBe(false);
		expect(body.error.code).toBe('INTERNAL');
		expect(consoleSpy).toHaveBeenCalledWith('withAuthHandler error:', expect.any(Error));
		consoleSpy.mockRestore();
	});

	it('does not invoke handler when auth fails', async () => {
		const handler = withAuthHandler('POST' as HttpMethod, mockHandler, { requiredRole: EStaffRole.MANAGER });
		const request = new Request('http://example.com/users', {
			method: 'POST',
			headers: { Origin: 'https://example.com', 'X-Dev-Email': 'employee@test.com' },
		});
		const env = {
			ALLOWED_ORIGINS: 'https://example.com',
			CONTENT_KV: makeKv(STAFF_LIST),
			ENVIRONMENT: 'development',
		} as unknown as Env;
		await handler(request, env);
		expect(mockHandler).not.toHaveBeenCalled();
	});

	it('does not invoke handler when origin fails', async () => {
		const handler = withAuthHandler('POST' as HttpMethod, mockHandler, { public: true });
		const request = new Request('http://example.com/auth/login', {
			method: 'POST',
			headers: { Origin: 'https://evil.com' },
		});
		const env = { ALLOWED_ORIGINS: 'https://example.com' } as Env;
		await handler(request, env);
		expect(mockHandler).not.toHaveBeenCalled();
	});

	it('does not invoke handler when method mismatches', async () => {
		const handler = withAuthHandler('POST' as HttpMethod, mockHandler, { public: true });
		const request = new Request('http://example.com/auth/login', {
			method: 'PUT',
			headers: { Origin: 'https://example.com' },
		});
		const env = { ALLOWED_ORIGINS: 'https://example.com' } as Env;
		await handler(request, env);
		expect(mockHandler).not.toHaveBeenCalled();
	});
});
