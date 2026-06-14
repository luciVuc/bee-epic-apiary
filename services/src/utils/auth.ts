import { isAllowedOrigin } from '.';

/** Result of an authentication check. If not authenticated, error contains the response to return. */
export interface IAuthResult {
	authenticated: boolean;
	error?: Response;
}

/**
 * Creates an error response with CORS headers for auth failures.
 */
function authErrorResponse(message: string, status: number, request: Request, env: Env): Response {
	const origin = request.headers.get('Origin');
	const headers: Record<string, string> = {
		'Content-Type': 'application/json',
	};
	if (origin && isAllowedOrigin(origin, env)) {
		headers['Access-Control-Allow-Origin'] = origin;
	}
	return new Response(JSON.stringify({ error: message }), { status, headers });
}

/**
 * Validates the Authorization header against API_SECRET_KEY env var.
 * If API_SECRET_KEY is not set, authentication is skipped (dev mode).
 *
 * @param request - Incoming HTTP request
 * @param env - Cloudflare Worker environment variables
 * @returns AuthResult with authenticated flag and optional error response
 */
export function checkAuth(request: Request, env: Env): IAuthResult {
	if (!env.API_SECRET_KEY) {
		return { authenticated: true };
	}

	const authHeader = request.headers.get('Authorization');
	if (!authHeader) {
		return {
			authenticated: false,
			error: authErrorResponse('Missing authorization header', 401, request, env),
		};
	}

	const [scheme, token] = authHeader.split(' ');
	if (scheme !== 'Bearer' || !token) {
		return {
			authenticated: false,
			error: authErrorResponse('Invalid authorization header format. Use: Bearer <token>', 401, request, env),
		};
	}

	if (token !== env.API_SECRET_KEY) {
		return {
			authenticated: false,
			error: authErrorResponse('Invalid API key', 403, request, env),
		};
	}

	return { authenticated: true };
}

export default checkAuth;
