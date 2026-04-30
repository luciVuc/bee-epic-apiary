export function jsonResponse(data: object, status: number, origin?: string | null, env?: Env): Response {
	const headers: Record<string, string> = {
		'Content-Type': 'application/json',
	};

	if (origin) {
		headers['Access-Control-Allow-Origin'] = env?.ALLOWED_ORIGINS === '*' ? '*' : origin;
	}

	return new Response(JSON.stringify(data), { status, headers });
}

export default jsonResponse;
