import { EStaffRole } from '@bee-epic/shared';
import { isAllowedOrigin, jsonErr, resolveCaller, roleSatisfies } from '../../utils';

/**
 * Public entry for the admin SSE notification stream.
 *
 * Delegates to the NotificationHub Durable Object (one fixed instance, `default`,
 * because the deployment is single-tenant). Forwards the SSE `Last-Event-ID` header
 * so the hub can replay missed events on reconnect.
 *
 * Auth: enforced INSIDE the worker (origin + caller + minimum EMPLOYEE role)
 * because EventSource cannot send `Authorization` headers — production relies
 * on the `bea_at` HttpOnly access cookie (Phase 9 trust chain), which
 * `resolveCaller` verifies via `verifyJwt`. Admin must construct
 * `new EventSource(url, { withCredentials: true })`. See services/AGENTS.md.
 *
 * Adds CORS + cache-busting response headers; everything else (SSE framing, replay,
 * heartbeats) lives in the DO.
 */
export async function handleNotificationsStream(request: Request, env: Env): Promise<Response> {
	const origin = request.headers.get('Origin');

	if (!isAllowedOrigin(origin, env)) {
		return jsonErr({ code: 'UNAUTHORIZED' }, origin, env);
	}

	const caller = await resolveCaller(request, env);
	if (!caller) {
		return jsonErr({ code: 'UNAUTHORIZED' }, origin, env);
	}
	if (!roleSatisfies(caller.role, EStaffRole.EMPLOYEE)) {
		return jsonErr({ code: 'FORBIDDEN', requiredRole: EStaffRole.EMPLOYEE }, origin, env);
	}

	const stub = env.NOTIFICATION_HUB.getByName('default');

	// Re-issue the request with the Last-Event-ID header explicitly preserved.
	// The header is set automatically by browsers on EventSource reconnect when
	// the server emitted `id:` lines in the previous response.
	const lastEventId = request.headers.get('Last-Event-ID');
	const forwardedHeaders = new Headers(request.headers);
	if (lastEventId) forwardedHeaders.set('Last-Event-ID', lastEventId);

	const forwarded = new Request(request.url, {
		method: request.method,
		headers: forwardedHeaders,
	});

	let response: Response;
	try {
		response = await stub.fetch(forwarded);
	} catch (err) {
		// If the DO is unreachable, propagating the raw throw would surface as
		// a hard 500 with no body. Returning the typed envelope keeps the admin
		// client's error-handling contract uniform (review I13).
		console.error('NotificationHub DO unreachable', { err: String(err) });
		return jsonErr({ code: 'INTERNAL' }, origin, env);
	}

	// CORS: by the time we get here `origin` has already passed isAllowedOrigin,
	// so it's either non-empty + on the allow-list, or ALLOWED_ORIGINS is '*' in
	// dev. Echo accordingly. If neither holds (defensive — should be unreachable
	// past the line-23 guard) OMIT the header entirely rather than emit
	// `Access-Control-Allow-Origin: ''`, which is an invalid header value
	// browsers will reject anyway (review M11). When echoing a concrete origin,
	// pair with `Allow-Credentials: true` — EventSource opens with credentials
	// and browsers refuse `*` together with credentials.
	const headers = new Headers(response.headers);
	if (origin) {
		headers.set('Access-Control-Allow-Origin', origin);
		headers.set('Access-Control-Allow-Credentials', 'true');
		headers.set('Vary', 'Origin');
	} else if (env.ALLOWED_ORIGINS === '*') {
		headers.set('Access-Control-Allow-Origin', '*');
	}
	headers.set('Cache-Control', 'no-cache, no-store');
	// SSE through proxies: disable buffering. Harmless if the proxy ignores it.
	if (!headers.has('X-Accel-Buffering')) headers.set('X-Accel-Buffering', 'no');

	return new Response(response.body, {
		status: response.status,
		statusText: response.statusText,
		headers,
	});
}

export default {
	fetch: handleNotificationsStream,
};
