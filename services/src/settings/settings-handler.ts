import { ESettingsType, SettingsType } from '../types';
import { jsonResponse, checkAuth, isAllowedOrigin } from '../utils';
import { categorySchema } from './schemas';

async function settingsHandler(request: Request, env: Env): Promise<Response> {
	const url = new URL(request.url);
	const origin = request.headers.get('Origin');

	const match = url.pathname.match(/^\/settings\/(site|process|testimonials|categories)$/);
	if (!match) {
		return jsonResponse({ error: 'Not found' }, 404, origin, env);
	}

	const type = match[1] as SettingsType;

	if (request.method === 'GET') {
		const value = await env.CONTENT_KV.get(type);
		if (!value) {
			return jsonResponse({ error: `No content found for "${type}"` }, 404, origin, env);
		}
		try {
			return jsonResponse(JSON.parse(value), 200, origin, env);
		} catch {
			return jsonResponse({ error: 'Invalid stored data' }, 500, origin, env);
		}
	}

	if (request.method === 'PUT') {
		if (!isAllowedOrigin(origin, env)) {
			return jsonResponse({ error: 'Forbidden' }, 403, origin, env);
		}
		const auth = checkAuth(request, env);
		if (!auth.authenticated) return auth.error!;

		let body: unknown;
		try {
			body = await request.json();
		} catch {
			return jsonResponse({ error: 'Invalid JSON body' }, 400, origin, env);
		}

		if (type === ESettingsType.CATEGORIES) {
			const result = categorySchema.safeParse(body);
			if (!result.success) {
				return jsonResponse({ error: 'Invalid categories data', details: result.error }, 400, origin, env);
			}
		}

		await env.CONTENT_KV.put(type, JSON.stringify(body));
		return jsonResponse({ success: true, type }, 200, origin, env);
	}

	return jsonResponse({ error: 'Method not allowed' }, 405, origin, env);
}

export default {
	fetch: settingsHandler,
} satisfies ExportedHandler<Env>;
