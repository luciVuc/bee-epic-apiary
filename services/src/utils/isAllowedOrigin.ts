/**
 * Validates if a request origin is allowed based on ALLOWED_ORIGINS environment variable.
 * Supports wildcard `*` only in development (review I12).
 *
 * @param {string | null} origin - Request origin header value (may be null)
 * @param {Env} env - Cloudflare Worker environment variables containing ALLOWED_ORIGINS + ENVIRONMENT
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
export function isAllowedOrigin(origin: string | null, env: Env): boolean {
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

	if (!origin) return false;

	const allowedOrigins = env.ALLOWED_ORIGINS.split(',').map((o) => o.trim());
	return allowedOrigins.includes(origin);
}

export default isAllowedOrigin;
