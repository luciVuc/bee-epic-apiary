/**
 * Validates if a request origin is allowed based on ALLOWED_ORIGINS environment variable.
 * Supports wildcard '*' for allowing all origins (development mode).
 *
 * @param {string | null} origin - Request origin header value (may be null)
 * @param {Env} env - Cloudflare Worker environment variables containing ALLOWED_ORIGINS
 * @returns {boolean} true if origin is allowed, false otherwise
 *
 * @example
 * // In env: ALLOWED_ORIGINS=https://example.com,https://app.example.com
 * isAllowedOrigin('https://example.com', env); // returns true
 * isAllowedOrigin('https://evil.com', env); // returns false
 *
 * // With wildcard: ALLOWED_ORIGINS=*
 * isAllowedOrigin('any-origin.com', env); // returns true
 */
export function isAllowedOrigin(origin: string | null, env: Env): boolean {
	if (!origin) return false;

	// Allow all origins in development
	if (env.ALLOWED_ORIGINS === '*') {
		return true;
	}

	const allowedOrigins = env.ALLOWED_ORIGINS.split(',').map((o) => o.trim());
	return allowedOrigins.includes(origin);
}

export default isAllowedOrigin;
