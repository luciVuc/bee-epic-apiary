/**
 * Validates if a request origin is allowed based on ALLOWED_ORIGINS environment variable.
 * Supports wildcard `*` only in development (review I12).
 *
 * When the browser omits the `Origin` header (common for simple GET requests),
 * the `Referer` header is used as a fallback — its origin is extracted and
 * checked against the allow-list.
 *
 * @param {string | null} origin - Request Origin header value (may be null)
 * @param {Env} env - Cloudflare Worker environment variables containing ALLOWED_ORIGINS + ENVIRONMENT
 * @param {string | null} referer - Request Referer header value (used as fallback when origin is null)
 * @returns {boolean} true if origin is allowed, false otherwise
 *
 * @example
 * // In env: ALLOWED_ORIGINS=https://example.com,https://app.example.com
 * isAllowedOrigin('https://example.com', env); // returns true
 * isAllowedOrigin('https://evil.com', env); // returns false
 *
 * // With wildcard: ALLOWED_ORIGINS=*
 * //   ENVIRONMENT=development → true  (intentional dev bypass)
 * //   ENVIRONMENT anything else → false (refused; logged)
 */
export function isAllowedOrigin(origin: string | null, env: Env, referer?: string | null): boolean {
	if (env.ALLOWED_ORIGINS === '*') {
		// A wildcard ALLOWED_ORIGINS in production is almost always a config
		// mistake; treating it as fail-open would silently expose admin APIs to
		// every origin. Close the door and shout into the logs. The fail-safe
		// default (missing / empty ENVIRONMENT) also refuses.
		const isDev = (env.ENVIRONMENT ?? '').toLowerCase() === 'development';
		if (!isDev) {
			console.error('ALLOWED_ORIGINS=* is not permitted outside development');
			return false;
		}
		return true;
	}

	// When the Origin header is absent (common for simple GET requests in
	// browsers), extract the origin from the Referer header as a fallback.
	let effectiveOrigin = origin;
	if (!effectiveOrigin && referer) {
		try {
			const refererUrl = new URL(referer);
			effectiveOrigin = refererUrl.origin;
		} catch {
			// Malformed Referer — treat as no origin
		}
	}

	if (!effectiveOrigin) return false;

	const allowedOrigins = env.ALLOWED_ORIGINS.split(',').map((o) => o.trim());
	return allowedOrigins.includes(effectiveOrigin);
}

export default isAllowedOrigin;
