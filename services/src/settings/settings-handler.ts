import { EStaffRole } from '@bee-epic/shared';
import { jsonOk, jsonErr, jsonResponse, isAllowedOrigin, resolveCaller, roleSatisfies } from '../utils';
import { siteContentSchema, processStepsSchema, testimonialsSchema, categorySchema } from './schemas';

/**
 * The settings paths this handler serves, exactly as they appear in the URL
 * and — critically — as the KV keys they map to. These are LOWERCASE, matching
 * the router regex (the runtime source of truth) and `CONTENT_KV.get('site')`
 * etc. elsewhere. `@bee-epic/shared`'s `SettingsType` is `keyof typeof
 * ESettingsType` (UPPERCASE keys, plus an unrelated `STAFF`), so it does NOT
 * describe these runtime values — casting `match[1]` to it was a type-level lie
 * that hid a real casing mismatch. This local union is the accurate type.
 */
type SettingsKey = 'site' | 'process' | 'testimonials' | 'categories';

async function settingsHandler(request: Request, env: Env): Promise<Response> {
	const url = new URL(request.url);
	const origin = request.headers.get('Origin');
	const referer = request.headers.get('Referer');

	const match = url.pathname.match(/^\/settings\/(site|process|testimonials|categories)$/);
	if (!match) {
		return jsonErr({ code: 'NOT_FOUND', resource: url.pathname }, origin, env);
	}

	const type = match[1] as SettingsKey;

	if (request.method === 'GET') {
		const value = await env.CONTENT_KV.get(type);
		if (!value) {
			return jsonErr({ code: 'NOT_FOUND', resource: type }, origin, env);
		}
		try {
			return jsonOk(JSON.parse(value), origin, env);
		} catch {
			return jsonErr({ code: 'INTERNAL' }, origin, env);
		}
	}

	if (request.method === 'PUT') {
		if (!isAllowedOrigin(origin, env, referer)) {
			return jsonResponse({ ok: false, error: { code: 'UNAUTHORIZED' } }, 403, origin, env);
		}
		// Plan 3: role-based auth — MANAGER (or higher) can edit site content.
		const caller = await resolveCaller(request, env);
		if (!caller) return jsonErr({ code: 'UNAUTHORIZED' }, origin, env);
		if (!roleSatisfies(caller.role, EStaffRole.MANAGER)) {
			return jsonErr({ code: 'FORBIDDEN', requiredRole: EStaffRole.MANAGER }, origin, env);
		}

		let body: unknown;
		try {
			body = await request.json();
		} catch {
			return jsonErr({ code: 'BAD_REQUEST', message: 'Invalid JSON body' }, origin, env);
		}

		let parseResult;
		switch (type) {
			case 'site':
				parseResult = siteContentSchema.safeParse(body);
				break;
			case 'process':
				parseResult = processStepsSchema.safeParse(body);
				break;
			case 'testimonials':
				parseResult = testimonialsSchema.safeParse(body);
				break;
			case 'categories':
				parseResult = categorySchema.safeParse(body);
				break;
			default:
				parseResult = undefined;
		}
		if (parseResult && !parseResult.success) {
			const fields = parseResult.error.issues.reduce<Record<string, string>>((acc, issue) => {
				acc[issue.path.join('.')] = issue.message;
				return acc;
			}, {});
			return jsonErr({ code: 'VALIDATION_FAILED', fields }, origin, env);
		}

		await env.CONTENT_KV.put(type, JSON.stringify(body));
		return jsonOk({ type }, origin, env);
	}

	return jsonErr({ code: 'METHOD_NOT_ALLOWED', allowed: ['GET', 'PUT'] }, origin, env);
}

export default {
	fetch: settingsHandler,
} satisfies ExportedHandler<Env>;
