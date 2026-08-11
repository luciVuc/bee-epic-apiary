/**
 * GET /whoami — return the resolved caller identity, or `null` with a
 * `bootstrapAvailable` flag when nobody is logged in.
 *
 * Envelope policy (review M13): unauth callers get a 200 with
 *   { ok: true, data: { caller: null, bootstrapAvailable } }
 * NOT a 401. This is intentional. The admin SPA boot sequence calls /whoami to
 * decide between "show the login link" and "show the authenticated UI" —
 * surfacing 401s here would force the SPA to special-case a not-yet-logged-in
 * caller as an error, when the real answer is just "you're not logged in yet,
 * here's null". A 401 is reserved for endpoints that require a caller; /whoami's
 * contract is "tell me who I am, including 'nobody'".
 *
 * Gating: wrapped with `withAuthHandler(..., { public: true })` so it still
 * clears the shared Origin allow-list + rate-limit chain (public only skips the
 * write-method auth floor — GET wouldn't hit that anyway). Previously the router
 * called `resolveCaller` inline, bypassing both checks; routing through the
 * wrapper single-sources the network-policy gate with every other endpoint.
 *
 * Because `public: true` GET requests don't trigger the wrapper's own auth
 * resolution, this handler resolves the caller itself via `resolveCaller`.
 */
import { EStaffRole, EUserStatus } from '@bee-epic/shared';
import { jsonOk, resolveCaller, withAuthHandler } from '../../utils';
import { listUsers } from '../repo/userRepo';

async function handleWhoami(request: Request, env: Env, origin: string | null): Promise<Response> {
	const caller = await resolveCaller(request, env);
	if (caller) {
		return jsonOk({ caller }, origin, env);
	}
	// Null-caller branch: expose whether the bootstrap flow is still open so the
	// admin SPA (Phase 10.5) can decide between "show login" and "show bootstrap
	// CTA". Mirrors the ACTIVE-OWNER computation in
	// src/auth/handlers/bootstrapOwner.ts (the server-side gate) — an INVITED
	// OWNER from an incomplete bootstrap does NOT close the gate.
	const users = await listUsers(env);
	const activeOwners = users.filter((u) => u.role === EStaffRole.OWNER && u.status === EUserStatus.ACTIVE).length;
	return jsonOk({ caller: null, bootstrapAvailable: activeOwners === 0 }, origin, env);
}

export default {
	fetch: withAuthHandler('GET', handleWhoami, { public: true }),
} satisfies ExportedHandler<Env>;
