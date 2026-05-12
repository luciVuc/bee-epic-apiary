import { isAllowedOrigin } from '.';

export interface AuthResult {
	authenticated: boolean;
	error?: Response;
}

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

export function checkAuth(request: Request, env: Env): AuthResult {
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
