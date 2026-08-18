import { isAllowedOrigin } from '.';

// HTTP Methods allowed for CORS preflight requests
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'OPTIONS';

const CORS_MAX_AGE = 86400;

/**
 * Builds the `Access-Control-Allow-Methods` header value for a route.
 *
 * Single-method routes still emit `<METHOD>, OPTIONS` so the preflight
 * advertises that OPTIONS itself is supported. Multi-method routes get
 * a canonical `M1, M2, ..., OPTIONS` list (OPTIONS deduped + appended).
 *
 * Centralizing this means new routes can't silently forget OPTIONS, and
 * the per-route override that some router branches used to apply after
 * calling `handleCORS` is no longer needed (review M3).
 */
function buildAllowMethodsHeader(methods: HttpMethod | HttpMethod[]): string {
	const list = Array.isArray(methods) ? methods : [methods];
	const withoutOptions = list.filter((m) => m !== 'OPTIONS');
	if (withoutOptions.length === 0) return 'OPTIONS';
	return `${withoutOptions.join(', ')}, OPTIONS`;
}

/**
 * Handles CORS preflight requests and generates appropriate CORS headers.
 * Returns a 204 No Content response with CORS headers for preflight requests.
 *
 * @param request - Incoming HTTP request (expects Origin header)
 * @param env - Cloudflare Worker environment variables containing ALLOWED_ORIGINS
 * @param allowedMethods - HTTP method(s) the route accepts. Pass an array for
 *   routes that support multiple verbs (e.g. `['GET', 'PUT', 'DELETE']`). OPTIONS
 *   is always advertised — callers should not include it.
 * @returns 204 response with CORS headers, or 403 if origin not allowed
 *
 * @example
 * // Single-method handler:
 * if (request.method === 'OPTIONS') return handleCORS(request, env, 'POST');
 *
 * // Multi-method route:
 * if (request.method === 'OPTIONS') return handleCORS(request, env, ['GET', 'PUT', 'DELETE']);
 */
export function handleCORS(request: Request, env: Env, allowedMethods: HttpMethod | HttpMethod[]): Response {
	const origin = request.headers.get('Origin');
	const referer = request.headers.get('Referer');

	// Delegate the wildcard / allow-list decision to isAllowedOrigin so the
	// production-wildcard refusal (review I12) applies to preflight too.
	if (!isAllowedOrigin(origin, env, referer)) {
		const headers: Record<string, string> = { 'Content-Type': 'application/json' };
		if (origin) headers['Access-Control-Allow-Origin'] = origin;
		return new Response(JSON.stringify({ error: 'Origin not allowed' }), {
			status: 403,
			headers,
		});
	}

	// Browsers refuse `Access-Control-Allow-Origin: *` together with credentialed
	// requests (`withCredentials` / `credentials: 'include'`). Since our admin
	// flows depend on cookies, echo the request origin whenever one is present
	// — even in the dev-wildcard case — and fall back to `*` only for
	// origin-less callers (e.g. curl) where credentials don't apply.
	const acao = origin ?? (env.ALLOWED_ORIGINS === '*' ? '*' : '');
	const headers: Record<string, string> = {
		'Access-Control-Allow-Origin': acao,
		'Access-Control-Allow-Methods': buildAllowMethodsHeader(allowedMethods),
		'Access-Control-Allow-Headers': 'Content-Type, authorization, X-Dev-Email',
		'Access-Control-Max-Age': CORS_MAX_AGE.toString(),
		Vary: 'Origin',
	};
	// `Allow-Credentials: true` is invalid alongside `Allow-Origin: *`, so only
	// emit it when we're echoing a concrete origin.
	if (acao !== '*') headers['Access-Control-Allow-Credentials'] = 'true';
	return new Response(null, { status: 204, headers });
}

export default handleCORS;
