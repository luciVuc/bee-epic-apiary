/**
 * Creates a standardized JSON HTTP response with appropriate headers.
 * Automatically adds CORS headers if origin is provided and allowed.
 * Responses with 204, 205, or 304 status codes will have no body.
 *
 * @param {object} data - Object to serialize as JSON in the response body
 * @param {number} status - HTTP status code for the response
 * @param {string | null} [origin] - Optional request origin for CORS headers
 * @param {Env} [env] - Optional Cloudflare Worker environment variables for CORS
 * @returns {Response} Configured HTTP response with JSON body and headers
 *
 * @example
 * // Basic response
 * jsonResponse({ message: 'Success' }, 200);
 *
 * // With CORS headers
 * jsonResponse({ error: 'Not found' }, 404, 'https://example.com', env);
 *
 * // No body for 204
 * jsonResponse({}, 204, origin, env);
 */
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
