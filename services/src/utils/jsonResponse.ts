import type { IApiError } from '@bee-epic/shared';

/**
 * Creates a standardized JSON HTTP response with appropriate headers.
 * Automatically adds CORS headers if origin is provided and allowed.
 * Responses with 204, 205, or 304 status codes will have no body.
 */
export function jsonResponse(data: object, status: number, origin?: string | null, env?: Env): Response {
	const headers: Record<string, string> = { 'Content-Type': 'application/json' };
	if (origin) {
		// Echo the request origin even when ALLOWED_ORIGINS=*, because browsers
		// refuse `Allow-Origin: *` together with credentialed requests. Pair it
		// with `Allow-Credentials: true` and a `Vary: Origin` for caches.
		headers['Access-Control-Allow-Origin'] = origin;
		headers['Access-Control-Allow-Credentials'] = 'true';
		headers['Vary'] = 'Origin';
	} else if (env?.ALLOWED_ORIGINS === '*') {
		// Origin-less callers (curl, server-to-server) can't send credentials, so
		// `*` is safe here.
		headers['Access-Control-Allow-Origin'] = '*';
	}
	if (status === 204 || status === 205 || status === 304) {
		return new Response(null, { status, headers });
	}
	return new Response(JSON.stringify(data), { status, headers });
}

/**
 * Emit a successful `IApiResponse<T>` envelope: `{ ok: true, data: T }`.
 * Status defaults to 200; pass 201 for creates.
 */
export function jsonOk<T>(data: T, origin?: string | null, env?: Env, status = 200): Response {
	return jsonResponse({ ok: true, data }, status, origin, env);
}

/**
 * Emit a failure `IApiResponse<T>` envelope: `{ ok: false, error: IApiError }`.
 * HTTP status is derived from the error code via `httpStatusFor`.
 */
export function jsonErr(error: IApiError, origin?: string | null, env?: Env): Response {
	return jsonResponse({ ok: false, error }, httpStatusFor(error), origin, env);
}

/** Canonical mapping from `IApiError.code` to HTTP status code. */
export function httpStatusFor(error: IApiError): number {
	switch (error.code) {
		case 'UNAUTHORIZED':
			return 401;
		case 'FORBIDDEN':
			return 403;
		case 'NOT_FOUND':
			return 404;
		case 'VALIDATION_FAILED':
		case 'BAD_REQUEST':
			return 400;
		case 'RATE_LIMITED':
			return 429;
		case 'METHOD_NOT_ALLOWED':
			return 405;
		case 'INVALID_CREDENTIALS':
		case 'INVALID_REFRESH':
		case 'REUSED_REFRESH':
		case 'NO_REFRESH':
			return 401;
		case 'ACCOUNT_DISABLED':
		case 'BOOTSTRAP_DISABLED':
		case 'FORBIDDEN_WRITE_ROLE':
			return 403;
		case 'USER_NOT_FOUND':
			return 404;
		case 'USER_EXISTS':
		case 'USER_ALREADY_ACTIVE':
			return 409;
		case 'WEAK_PASSWORD':
		case 'INVALID_TOKEN':
		case 'EXPIRED_TOKEN':
		case 'INVALID_EMAIL':
		case 'INVALID_ROLE':
		case 'INVALID_POLICY':
		case 'EMAIL_MISMATCH':
		case 'CANNOT_DELETE_LAST_OWNER':
		case 'CANNOT_DELETE_SELF':
		case 'CANNOT_DEMOTE_LAST_OWNER':
		case 'CANNOT_DISABLE_SELF':
			return 400;
		case 'INTERNAL':
		default:
			return 500;
	}
}

export default jsonResponse;
