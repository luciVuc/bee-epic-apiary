import { isAllowedOrigin } from '.';

// HTTP Methods allowed for CORS preflight requests
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'OPTIONS';

const CORS_MAX_AGE = 86400;

export function handleCORS(request: Request, env: Env, allowedMethod: HttpMethod): Response {
	const origin = request.headers.get('Origin');

	// Allow any origin in development if ALLOWED_ORIGINS is "*"
	if (env.ALLOWED_ORIGINS === '*') {
		return new Response(null, {
			status: 204,
			headers: {
				'Access-Control-Allow-Origin': '*',
				'Access-Control-Allow-Methods': allowedMethod === 'OPTIONS' ? 'OPTIONS' : `${allowedMethod}, OPTIONS`,
				'Access-Control-Allow-Headers': 'Content-Type',
				'Access-Control-Max-Age': CORS_MAX_AGE.toString(),
			},
		});
	}

	if (!isAllowedOrigin(origin, env)) {
		return new Response(null, { status: 403 });
	}

	return new Response(null, {
		status: 204,
		headers: {
			'Access-Control-Allow-Origin': origin!,
			'Access-Control-Allow-Methods': allowedMethod === 'OPTIONS' ? 'OPTIONS' : `${allowedMethod}, OPTIONS`,
			'Access-Control-Allow-Headers': 'Content-Type',
			'Access-Control-Max-Age': CORS_MAX_AGE.toString(),
		},
	});
}

export default handleCORS;
