import { readCookie, REFRESH_COOKIE } from './cookies';
import { verifyJwt, type IJwtPayload } from './crypto/jwt';

/**
 * Read the `bea_rt` cookie from a request and return its verified payload,
 * or null if any step fails: missing cookie, invalid signature, expired,
 * wrong type, or missing required claims for a refresh token. Never throws.
 *
 * Handlers that need to reason about the current refresh family (refresh,
 * logout, change-password) share this single verify path so a future audit
 * only has to read one file to understand how the browser's refresh cookie
 * is validated. Note: this collapses "no cookie" and "cookie present but
 * invalid" into a single `null` return — handlers that need to distinguish
 * (e.g. `/auth/refresh` differentiating NO_REFRESH from INVALID_REFRESH)
 * must call `readCookie(REFRESH_COOKIE)` separately first.
 */
export async function readVerifiedRefreshPayload(request: Request, env: Env): Promise<IJwtPayload | null> {
	const rt = readCookie(request, REFRESH_COOKIE);
	if (!rt) return null;
	const payload = await verifyJwt(rt, env.JWT_SIGNING_SECRET, 'refresh');
	if (!payload || !payload.sub || !payload.fid || !payload.jti) return null;
	return payload;
}
