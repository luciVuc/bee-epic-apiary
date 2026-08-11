import { describe, it, expect } from 'vitest';
import {
	ACCESS_COOKIE,
	REFRESH_COOKIE,
	REFRESH_COOKIE_PATH,
	buildAccessCookie,
	buildRefreshCookie,
	buildClearAccessCookie,
	buildClearRefreshCookie,
	setSessionCookies,
	clearSessionCookies,
	readCookie,
} from '../../src/auth/cookies';

/**
 * Minimal Env stub — the cookie helpers only touch `env.ENVIRONMENT`, so we
 * don't need KV/secrets. Cast through `unknown` so we don't have to enumerate
 * every field of the real Env type.
 */
const prodEnv = { ENVIRONMENT: 'production' } as unknown as Env;
const devEnv = { ENVIRONMENT: 'development' } as unknown as Env;

function setCookieHeaders(response: Response): string[] {
	return [...response.headers.entries()].filter(([k]) => k.toLowerCase() === 'set-cookie').map(([, v]) => v);
}

describe('cookies constants', () => {
	it('exposes the canonical cookie names', () => {
		expect(ACCESS_COOKIE).toBe('bea_at');
		expect(REFRESH_COOKIE).toBe('bea_rt');
		expect(REFRESH_COOKIE_PATH).toBe('/auth/refresh');
	});
});

describe('buildAccessCookie', () => {
	it('formats with Path=/, Max-Age=3600, HttpOnly, SameSite=Lax, Secure in prod', () => {
		const cookie = buildAccessCookie('abc.def.ghi', prodEnv);
		expect(cookie).toContain('bea_at=abc.def.ghi');
		expect(cookie).toContain('Path=/');
		expect(cookie).toContain('Max-Age=3600');
		expect(cookie).toContain('HttpOnly');
		expect(cookie).toContain('SameSite=Lax');
		expect(cookie).toContain('Secure');
	});

	it('omits Secure when ENVIRONMENT=development', () => {
		const cookie = buildAccessCookie('tok', devEnv);
		expect(cookie).not.toContain('Secure');
		expect(cookie).toContain('HttpOnly');
		expect(cookie).toContain('SameSite=Lax');
	});
});

describe('buildRefreshCookie', () => {
	it('formats with Path=/auth/refresh, Max-Age=2592000, HttpOnly, SameSite=Lax, Secure in prod', () => {
		const cookie = buildRefreshCookie('rrr', prodEnv);
		expect(cookie).toContain('bea_rt=rrr');
		expect(cookie).toContain('Path=/auth/refresh');
		expect(cookie).toContain('Max-Age=2592000');
		expect(cookie).toContain('HttpOnly');
		expect(cookie).toContain('SameSite=Lax');
		expect(cookie).toContain('Secure');
	});

	it('omits Secure when ENVIRONMENT=development', () => {
		const cookie = buildRefreshCookie('rrr', devEnv);
		expect(cookie).not.toContain('Secure');
	});

	it('emits Secure when ENVIRONMENT is undefined (fail-closed default)', () => {
		const undefinedEnv = {} as unknown as Env;
		expect(buildAccessCookie('t', undefinedEnv)).toContain('Secure');
		expect(buildRefreshCookie('t', undefinedEnv)).toContain('Secure');
	});
});

describe('buildClearAccessCookie / buildClearRefreshCookie', () => {
	it('clears the access cookie with Max-Age=0 on Path=/', () => {
		const cookie = buildClearAccessCookie(prodEnv);
		expect(cookie).toContain('bea_at=');
		expect(cookie).toContain('Path=/');
		expect(cookie).toContain('Max-Age=0');
		expect(cookie).toContain('HttpOnly');
		expect(cookie).toContain('SameSite=Lax');
	});

	it('clears the refresh cookie with Max-Age=0 on Path=/auth/refresh', () => {
		const cookie = buildClearRefreshCookie(prodEnv);
		expect(cookie).toContain('bea_rt=');
		expect(cookie).toContain('Path=/auth/refresh');
		expect(cookie).toContain('Max-Age=0');
	});

	it('omits Secure on both clear cookies when ENVIRONMENT=development', () => {
		expect(buildClearAccessCookie(devEnv)).not.toContain('Secure');
		expect(buildClearRefreshCookie(devEnv)).not.toContain('Secure');
	});
});

describe('setSessionCookies', () => {
	it('emits two distinct Set-Cookie header instances (not comma-joined)', () => {
		const res = new Response('body', { status: 200 });
		const out = setSessionCookies(res, { accessToken: 'A', refreshToken: 'R' }, prodEnv);
		const headers = setCookieHeaders(out);
		expect(headers.length).toBe(2);
		// Neither header should have both cookies smushed in — a broken impl
		// using `headers.set` would join them with `, `.
		for (const h of headers) {
			expect(h.split('bea_').length - 1).toBe(1);
		}
	});

	it('the two headers correspond to the access and refresh cookies', () => {
		const res = new Response(null);
		const out = setSessionCookies(res, { accessToken: 'AA', refreshToken: 'RR' }, prodEnv);
		const headers = setCookieHeaders(out);
		const access = headers.find((h) => h.startsWith('bea_at='));
		const refresh = headers.find((h) => h.startsWith('bea_rt='));
		expect(access).toBeDefined();
		expect(refresh).toBeDefined();
		expect(access).toContain('bea_at=AA');
		expect(access).toContain('Max-Age=3600');
		expect(refresh).toContain('bea_rt=RR');
		expect(refresh).toContain('Max-Age=2592000');
		expect(refresh).toContain('Path=/auth/refresh');
	});

	it('preserves the response body when cloning', async () => {
		const res = new Response('hello-world', { status: 201 });
		const out = setSessionCookies(res, { accessToken: 'A', refreshToken: 'R' }, prodEnv);
		expect(out.status).toBe(201);
		expect(await out.text()).toBe('hello-world');
	});

	it('preserves existing headers on the response', () => {
		const res = new Response('x', { headers: { 'X-Test': 'yes', 'Content-Type': 'text/plain' } });
		const out = setSessionCookies(res, { accessToken: 'A', refreshToken: 'R' }, prodEnv);
		expect(out.headers.get('X-Test')).toBe('yes');
		expect(out.headers.get('Content-Type')).toBe('text/plain');
	});

	it('omits Secure on both cookies in development', () => {
		const res = new Response(null);
		const out = setSessionCookies(res, { accessToken: 'A', refreshToken: 'R' }, devEnv);
		for (const h of setCookieHeaders(out)) {
			expect(h).not.toContain('Secure');
		}
	});
});

describe('clearSessionCookies', () => {
	it('emits both cookies with Max-Age=0 on their original paths', () => {
		const res = new Response(null);
		const out = clearSessionCookies(res, prodEnv);
		const headers = setCookieHeaders(out);
		expect(headers.length).toBe(2);
		const access = headers.find((h) => h.startsWith('bea_at='))!;
		const refresh = headers.find((h) => h.startsWith('bea_rt='))!;
		expect(access).toContain('Max-Age=0');
		expect(access).toContain('Path=/');
		expect(refresh).toContain('Max-Age=0');
		expect(refresh).toContain('Path=/auth/refresh');
	});

	it('preserves response body', async () => {
		const res = new Response('bye', { status: 200 });
		const out = clearSessionCookies(res, prodEnv);
		expect(await out.text()).toBe('bye');
	});
});

describe('readCookie', () => {
	function reqWith(cookie: string | null): Request {
		const headers = new Headers();
		if (cookie !== null) headers.set('Cookie', cookie);
		return new Request('https://example.com/', { headers });
	}

	it('returns the cookie value when present', () => {
		expect(readCookie(reqWith('bea_at=xyz'), 'bea_at')).toBe('xyz');
	});

	it('returns null when the Cookie header is missing', () => {
		expect(readCookie(reqWith(null), 'bea_at')).toBeNull();
	});

	it('returns null when the named cookie is absent', () => {
		expect(readCookie(reqWith('other=1; more=2'), 'bea_at')).toBeNull();
	});

	it('returns null for empty-string values', () => {
		expect(readCookie(reqWith('bea_at='), 'bea_at')).toBeNull();
	});

	it('picks the right cookie among many', () => {
		expect(readCookie(reqWith('a=1; bea_at=xyz; b=2'), 'bea_at')).toBe('xyz');
	});

	it('does not false-match on a cookie whose name is a superstring', () => {
		expect(readCookie(reqWith('bea_atx=nope; bea_at=yes'), 'bea_at')).toBe('yes');
	});

	it('does not false-match when only a superstring cookie is present', () => {
		expect(readCookie(reqWith('bea_atx=nope'), 'bea_at')).toBeNull();
	});

	it('tolerates values containing = characters', () => {
		// JWTs never contain = (base64url strips padding), but tokens on the
		// legacy path or an attacker-crafted cookie might. The parser should
		// split only on the FIRST = so the raw value round-trips.
		expect(readCookie(reqWith('bea_at=aa=bb=cc'), 'bea_at')).toBe('aa=bb=cc');
	});

	it('parses no-space separator (a=1;bea_at=xyz)', () => {
		// RFC 6265 §4.2.1 permits `name=value;name=value` without a space
		// after the semicolon. curl, health probes, and monitoring tools
		// send it that way; a naive split on '; ' would treat the whole
		// header as one entry and silently miss the lookup.
		expect(readCookie(reqWith('a=1;bea_at=xyz'), 'bea_at')).toBe('xyz');
	});

	it('parses mixed / extra whitespace (a=1 ;   bea_at=xyz  ;b=2)', () => {
		expect(readCookie(reqWith('a=1 ;   bea_at=xyz  ;b=2'), 'bea_at')).toBe('xyz');
	});

	it('tolerates a stray leading or trailing semicolon', () => {
		expect(readCookie(reqWith('; bea_at=xyz;'), 'bea_at')).toBe('xyz');
		expect(readCookie(reqWith('bea_at=xyz;;a=1'), 'bea_at')).toBe('xyz');
	});
});
