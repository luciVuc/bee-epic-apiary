/**
 * Resolve the client IP for a Worker request as a plain `string`.
 *
 * Prefers Cloudflare's `cf.connectingIp`, falls back to the `CF-Connecting-IP`
 * header, then to the literal `'unknown'` so callers always get a usable string
 * (used as a rate-limit key component and stored — truncated — on auth records).
 *
 * Why the cast + this helper exist: the generated workerd types resolve
 * `cf.connectingIp` to an over-wide `{}` in some SDK versions, so the raw
 * `req.cf?.connectingIp || ...` expression widens to `{} | string` and fails
 * where a `string` is required (e.g. `truncateIp`). Centralising the coercion
 * here removes seven copies of the same fragile expression and gives every
 * call site a guaranteed `string`.
 */
export function getClientIp(request: Request): string {
	const cfIp = (request as Request<unknown, IncomingRequestCfProperties>).cf?.connectingIp;
	if (typeof cfIp === 'string' && cfIp.length > 0) return cfIp;
	return request.headers.get('CF-Connecting-IP') || 'unknown';
}
