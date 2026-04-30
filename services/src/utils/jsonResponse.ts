export function jsonResponse(data: object, status: number, origin?: string | null, env?: Env): Response {
	const headers: Record<string, string> = {
		'Content-Type': 'application/json',
	};

	if (origin) {
		headers['Access-Control-Allow-Origin'] = env?.ALLOWED_ORIGINS === '*' ? '*' : origin;
	}

	// Responses with 204, 205, or 304 status cannot have a body
	if (status === 204 || status === 205 || status === 304) {
		return new Response(null, { status, headers });
	}

	return new Response(JSON.stringify(data), { status, headers });
}

export default jsonResponse;
