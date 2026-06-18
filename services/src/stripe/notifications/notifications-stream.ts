export async function handleNotificationsStream(request: Request, env: Env): Promise<Response> {
	const stub = env.NOTIFICATION_HUB.getByName('default');
	const response = await stub.fetch(request);

	const origin = request.headers.get('Origin');
	const corsOrigin = env.ALLOWED_ORIGINS === '*' ? '*' : origin || '';
	const headers = new Headers(response.headers);
	headers.set('Access-Control-Allow-Origin', corsOrigin);

	return new Response(response.body, {
		status: response.status,
		statusText: response.statusText,
		headers,
	});
}

export default {
	fetch: handleNotificationsStream,
};
