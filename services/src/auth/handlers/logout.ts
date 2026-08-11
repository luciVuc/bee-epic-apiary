/**
 * POST /auth/logout — always-succeeds session termination.
 *
 * Design notes:
 *   - `public: true` on withAuthHandler: logout MUST NOT require an
 *     authenticated caller. A user carrying an expired, tampered, or already-
 *     revoked cookie must still be able to blow away their local state.
 *     Gating logout on `resolveCaller` would produce a nasty UX where the
 *     "stuck" account can't sign out without opening dev-tools to hand-clear
 *     cookies — and it would leak "your session is invalid" information the
 *     caller doesn't need.
 *   - Best-effort family delete: if the caller presents a valid `bea_rt`
 *     cookie, we identify the refresh family (`sub` + `fid`) and delete it
 *     server-side. This defangs cookie theft after logout — an attacker who
 *     grabbed the raw refresh JWT from a proxy log or backup can't use it to
 *     mint fresh tokens once the family is gone. But the delete is wrapped in
 *     `.catch(...)` so a KV outage, a schema mismatch, or ANY other failure
 *     never blocks the response. Logout ALWAYS proceeds to clear cookies —
 *     partial cleanup (client-side cookies gone, server family lingering) is
 *     strictly better than a failed logout that leaves cookies AND family
 *     both alive.
 *   - 204 + cleared cookies always: idempotent by design. Calling
 *     `/auth/logout` twice, or on a browser with no cookies, or on a client
 *     with a garbage cookie — every path returns 204 with two `Set-Cookie:
 *     Max-Age=0` headers. Idempotence is required so the admin SPA can call
 *     logout without first checking whether the user is currently signed in.
 *   - 204 via `jsonResponse({}, 204, ...)`: the helper knows how to emit a
 *     bodyless response WITH CORS + Vary headers, so the browser accepts the
 *     response on a cross-origin admin SPA. Building a raw
 *     `new Response(null, {status:204})` would drop the CORS headers and
 *     break the SPA fetch.
 */
import { clearSessionCookies } from '../cookies';
import { readVerifiedRefreshPayload } from '../readVerifiedRefreshPayload';
import { deleteFamily } from '../repo/refreshFamilyRepo';
import { jsonResponse, withAuthHandler } from '../../utils';

async function handleLogout(request: Request, env: Env, origin: string | null): Promise<Response> {
	// 1) Best-effort family delete. Every failure path is silent — the outer
	// response ALWAYS clears cookies regardless of what happens here. The
	// shared `readVerifiedRefreshPayload` helper collapses "no cookie" and
	// "invalid cookie" into a single null return, which is exactly what
	// logout wants — we don't need to distinguish (either way, no family to
	// delete).
	try {
		const payload = await readVerifiedRefreshPayload(request, env);
		if (payload && payload.sub && payload.fid) {
			await deleteFamily(env, payload.sub, payload.fid).catch((err) => console.warn('logout: family delete failed', err));
		}
	} catch (err) {
		// readVerifiedRefreshPayload delegates to verifyJwt which is
		// documented never-throws, but belt-and-braces: any unexpected
		// failure here must not block the cookie clear.
		console.warn('logout: refresh verify failed', err);
	}

	// 2) 204 with CORS/Vary headers and both cookies cleared.
	const response = jsonResponse({}, 204, origin, env);
	return clearSessionCookies(response, env);
}

export default {
	fetch: withAuthHandler('POST', handleLogout, { public: true }),
} satisfies ExportedHandler<Env>;
