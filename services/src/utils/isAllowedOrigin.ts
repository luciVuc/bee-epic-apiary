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
