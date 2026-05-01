/**
 * Authentication middleware for protected endpoints
 * If API_SECRET_KEY is set in env, requires Bearer token authentication
 */

export interface AuthResult {
	authenticated: boolean;
	error?: Response;
}

/**
 * Check if request is authenticated
 * Returns AuthResult with authenticated status or error response
 */
export function checkAuth(request: Request, env: Env): AuthResult {
	// If API_SECRET_KEY is not set, authentication is disabled (development mode)
	if (!env.API_SECRET_KEY) {
		return { authenticated: true };
	}

	const authHeader = request.headers.get('Authorization');
	if (!authHeader) {
		return {
			authenticated: false,
			error: new Response(JSON.stringify({ error: 'Missing authorization header' }), {
				status: 401,
				headers: { 'Content-Type': 'application/json' },
			}),
		};
	}

	const [scheme, token] = authHeader.split(' ');
	if (scheme !== 'Bearer' || !token) {
		return {
			authenticated: false,
			error: new Response(JSON.stringify({ error: 'Invalid authorization header format. Use: Bearer <token>' }), {
				status: 401,
				headers: { 'Content-Type': 'application/json' },
			}),
		};
	}

	if (token !== env.API_SECRET_KEY) {
		return {
			authenticated: false,
			error: new Response(JSON.stringify({ error: 'Invalid API key' }), {
				status: 403,
				headers: { 'Content-Type': 'application/json' },
			}),
		};
	}

	return { authenticated: true };
}

export default checkAuth;
