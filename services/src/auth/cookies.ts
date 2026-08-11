import { ACCESS_TTL_MS, REFRESH_TTL_MS } from '@bee-epic/shared';

/**
 * Session cookie helpers for the admin auth flow.
 *
 * Two cookies carry the admin session:
 *
 *   - `bea_at` (access) — short-lived JWT (1h), Path=/. Rides on every admin
 *     API call so the middleware can identify the caller without a KV lookup.
 *   - `bea_rt` (refresh) — long-lived JWT (30d), Path=/auth/refresh. Path
 *     scoping is deliberate: the refresh token only travels on the ONE
 *     endpoint that actually needs it, minimizing exposure surface. Every
 *     other admin call carries only the short-lived access token, so a
 *     compromised proxy log / mis-configured CDN cannot exfiltrate the
 *     30-day credential.
 *
 * Both cookies are `HttpOnly` — JavaScript on the admin origin cannot read
 * them, which defangs XSS-based token theft (an attacker can still ride the
 * cookie via same-origin requests, but they cannot exfiltrate the raw JWT).
 *
 * Both cookies are `SameSite=Lax` — CSRF defence for cross-site POSTs while
 * still allowing top-level navigations (needed so magic-link email flows can
 * land on `/auth/*` GET routes with the session intact).
 *
 * `Secure` is env-gated. Production requires it (browsers refuse to send
 * `Secure` cookies over http, and we serve admin over https-only). Local dev
 * runs on `http://localhost`, which would drop `Secure` cookies entirely —
 * so we omit the flag when `env.ENVIRONMENT === 'development'`. Any other
 * value (including `undefined`, staging, preview) is treated as production
 * and gets `Secure`, which is the safer default.
 */

export const ACCESS_COOKIE = 'bea_at';
export const REFRESH_COOKIE = 'bea_rt';

/**
 * Path scope for the refresh cookie. Kept as a named constant so tests and
 * the /auth/refresh handler read the same source of truth — a typo here
 * would silently break the refresh flow without a test failure.
 */
export const REFRESH_COOKIE_PATH = '/auth/refresh';

// Compute Max-Age (seconds) once at module scope. The TTL constants in
// @bee-epic/shared are milliseconds because that's what the JWT layer uses;
// Set-Cookie's Max-Age is seconds.
const ACCESS_MAX_AGE_S = Math.floor(ACCESS_TTL_MS / 1000);
const REFRESH_MAX_AGE_S = Math.floor(REFRESH_TTL_MS / 1000);

function isSecure(env: Env): boolean {
	// Any non-'development' value gets Secure. Fail-closed default: an unset
	// ENVIRONMENT in a deployed Worker still emits Secure.
	return env.ENVIRONMENT !== 'development';
}

function buildCookie(name: string, value: string, path: string, maxAge: number, env: Env): string {
	// Order mirrors typical browser dev-tools display; not semantically
	// significant but makes debugging easier when reading raw headers.
	const parts = [`${name}=${value}`, `Path=${path}`, `Max-Age=${maxAge}`, 'HttpOnly', 'SameSite=Lax'];
	if (isSecure(env)) parts.push('Secure');
	return parts.join('; ');
}

/**
 * Build the Set-Cookie header value for the access cookie. Exposed for tests
 * and specialized handlers; most call sites should use `setSessionCookies`
 * which sets both cookies atomically.
 */
export function buildAccessCookie(token: string, env: Env): string {
	return buildCookie(ACCESS_COOKIE, token, '/', ACCESS_MAX_AGE_S, env);
}

/**
 * Build the Set-Cookie header value for the refresh cookie. Path-scoped to
 * `/auth/refresh` so the token only travels on refresh calls.
 */
export function buildRefreshCookie(token: string, env: Env): string {
	return buildCookie(REFRESH_COOKIE, token, REFRESH_COOKIE_PATH, REFRESH_MAX_AGE_S, env);
}

/**
 * Build the Set-Cookie header value that expires the access cookie
 * immediately. The empty value + `Max-Age=0` is the RFC-6265 recipe for an
 * eviction — browsers drop the cookie from their jar without waiting for the
 * original expiry.
 */
export function buildClearAccessCookie(env: Env): string {
	return buildCookie(ACCESS_COOKIE, '', '/', 0, env);
}

/**
 * Build the Set-Cookie header value that expires the refresh cookie
 * immediately. Must match the ORIGINAL `Path=/auth/refresh` — a clear on a
 * different path is a silent no-op because the browser scopes cookies by
 * (name, domain, path).
 */
export function buildClearRefreshCookie(env: Env): string {
	return buildCookie(REFRESH_COOKIE, '', REFRESH_COOKIE_PATH, 0, env);
}

/**
 * Clone `response` and append `Set-Cookie` headers for both the access and
 * refresh cookies. Returns the clone; callers should discard the input
 * response.
 *
 * We MUST use `Headers.append` (not `set`) so the two Set-Cookie values are
 * emitted as separate header instances — the RFC-6265 wire format for
 * multi-cookie responses. `Headers.set` would overwrite the first cookie;
 * naive string-joining with `, ` would produce a single malformed header
 * that browsers reject.
 */
export function setSessionCookies(response: Response, tokens: { accessToken: string; refreshToken: string }, env: Env): Response {
	// `new Response(body, response)` copies status, statusText, and headers
	// into a fresh mutable Headers — the input's headers are frozen once the
	// Response is constructed, so we cannot mutate them in place.
	const cloned = new Response(response.body, response);
	cloned.headers.append('Set-Cookie', buildAccessCookie(tokens.accessToken, env));
	cloned.headers.append('Set-Cookie', buildRefreshCookie(tokens.refreshToken, env));
	return cloned;
}

/**
 * Clone `response` and append `Set-Cookie` headers that expire both auth
 * cookies. Used by /auth/logout and by refresh-token-replay defence (which
 * kills the client's cookies as it destroys the family).
 */
export function clearSessionCookies(response: Response, env: Env): Response {
	const cloned = new Response(response.body, response);
	cloned.headers.append('Set-Cookie', buildClearAccessCookie(env));
	cloned.headers.append('Set-Cookie', buildClearRefreshCookie(env));
	return cloned;
}

/**
 * Read a single named cookie from the request's `Cookie` header. Returns
 * `null` when the header is absent, the name is not present, or the value
 * is empty. No URL-decoding — our tokens are URL-safe base64 by
 * construction, and decoding would risk misinterpreting attacker-supplied
 * bytes.
 *
 * Splits on `;` (per RFC 6265 §4.2.1 the space after the separator is
 * optional; curl, health probes, and monitoring tools emit `a=1;b=2`
 * without it) and trims each entry before parsing. Matches on the exact
 * name before the first `=` to avoid false-matching a superstring cookie
 * (e.g. `bea_atx=...` must not satisfy a lookup for `bea_at`).
 */
export function readCookie(request: Request, name: string): string | null {
	const header = request.headers.get('Cookie');
	if (!header) return null;
	for (const entry of header.split(';')) {
		const trimmed = entry.trim();
		if (!trimmed) continue; // handle leading/trailing / doubled ';'
		const eq = trimmed.indexOf('=');
		if (eq === -1) continue;
		const entryName = trimmed.slice(0, eq);
		if (entryName !== name) continue;
		const value = trimmed.slice(eq + 1);
		return value === '' ? null : value;
	}
	return null;
}
