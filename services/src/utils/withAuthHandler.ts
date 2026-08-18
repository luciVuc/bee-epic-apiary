import { EStaffRole } from '@bee-epic/shared';
import { getClientIp, handleCORS, isAllowedOrigin, jsonErr, jsonResponse, RateLimiter, resolveCaller, roleSatisfies } from '.';
import type { ICaller } from './resolveCaller';
import type { HttpMethod } from './handleCORS';

/** Signature the wrapped handler must satisfy. */
export type AuthHandler = (request: Request, env: Env, origin: string | null, caller?: ICaller) => Promise<Response>;

/** Options for configuring the withAuthHandler wrapper. */
export interface IWithAuthHandlerOptions {
	/** Minimum role required. If omitted, only the write-method floor applies. */
	requiredRole?: EStaffRole;
	/**
	 * Escape hatch for endpoints that must remain fully public even for writes
	 * (e.g. POST /auth/login, POST /auth/request-reset, POST /contact).
	 * When true, the write-method floor is skipped. Origin + rate-limit still apply.
	 */
	public?: boolean;
}

/** Methods that mutate server state — must clear the write-method floor unless `public`. */
const MUTATION_METHODS: ReadonlySet<HttpMethod> = new Set<HttpMethod>(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * Generic auth wrapper. Encapsulates the CORS / method / origin / auth /
 * rate-limit middleware chain shared by all admin endpoints. Handlers
 * (auth flows, user management, content endpoints, etc.) plug in through
 * this wrapper so the ordering below is single-sourced.
 *
 * Ordering rationale:
 *   1) OPTIONS preflight — must respond BEFORE method validation so browsers
 *      can discover which methods the route supports.
 *   2) Method check — fail-fast before spending CPU on origin / KV lookups.
 *   3) Origin check — network-level policy rejection. Uses the raw
 *      `jsonResponse` shape (not `jsonErr`) because it's not a caller-identity
 *      error and shouldn't imply "authenticate and try again".
 *   4) Auth resolution — resolved ONCE and reused by the write-method floor
 *      below. Runs only when `requiredRole` is set OR the request is a
 *      write and `public !== true`.
 *   5) Write-method floor — belt-and-braces: mutation methods require at
 *      least EMPLOYEE rank even if the handler forgot `requiredRole`. When
 *      both `requiredRole` and the floor apply, the effective minimum is
 *      `max(requiredRole, EMPLOYEE)`.
 *   6) Rate limit — deliberately last so cheap rejections don't count
 *      against the caller's budget.
 *   7) Handler invocation — wrapped in a generic try/catch → 500 INTERNAL.
 *      Unlike `withStripeHandler`, this wrapper is provider-agnostic and
 *      does NOT special-case upstream error shapes.
 */
export function withAuthHandler(method: HttpMethod, handler: AuthHandler, options?: IWithAuthHandlerOptions) {
	return async (request: Request, env: Env): Promise<Response> => {
		if (request.method === 'OPTIONS') {
			return handleCORS(request, env, method);
		}

		const origin = request.headers.get('Origin');
		const referer = request.headers.get('Referer');

		if (request.method !== method) {
			return jsonErr({ code: 'METHOD_NOT_ALLOWED', allowed: [method, 'OPTIONS'] }, origin, env);
		}

		// Origin check — use jsonResponse directly: this is a network-level policy
		// rejection, not a caller-identity error, and doesn't need a requiredRole.
		if (!isAllowedOrigin(origin, env, referer)) {
			return jsonResponse({ ok: false, error: { code: 'UNAUTHORIZED' } }, 403, origin, env);
		}

		const isMutation = MUTATION_METHODS.has(method);
		const isPublic = options?.public === true;
		const needsAuthResolve = options?.requiredRole !== undefined || (isMutation && !isPublic);

		let caller: ICaller | undefined;
		if (needsAuthResolve) {
			const resolved = await resolveCaller(request, env);
			if (options?.requiredRole !== undefined) {
				if (!resolved) return jsonErr({ code: 'UNAUTHORIZED' }, origin, env);
				if (!roleSatisfies(resolved.role, options.requiredRole)) {
					return jsonErr({ code: 'FORBIDDEN', requiredRole: options.requiredRole }, origin, env);
				}
			}
			caller = resolved ?? undefined;
		}

		// Write-method floor. Applies to POST/PUT/PATCH/DELETE unless the endpoint is
		// explicitly `public`. When `requiredRole` is set and passed above, the
		// caller already ranks ≥ requiredRole; the floor still enforces EMPLOYEE
		// as an absolute minimum for writes (belt-and-braces for routes where
		// the author forgot `requiredRole`).
		if (isMutation && !isPublic) {
			if (!caller) return jsonErr({ code: 'UNAUTHORIZED' }, origin, env);
			if (!roleSatisfies(caller.role, EStaffRole.EMPLOYEE)) {
				// The write floor is always EMPLOYEE; echo it back so clients can render
				// the requirement, consistent with the FORBIDDEN variant (schema carries
				// `requiredRole` on both). Tests assert this field is present.
				return jsonErr({ code: 'FORBIDDEN_WRITE_ROLE', requiredRole: EStaffRole.EMPLOYEE }, origin, env);
			}
		}

		if (env.RATE_LIMITER) {
			const url = new URL(request.url);
			const clientIP = getClientIp(request);
			const rateLimiter = new RateLimiter(env.RATE_LIMITER, {
				maxRequests: parseInt(env.RATE_LIMIT_MAX, 10),
				windowSeconds: parseInt(env.RATE_LIMIT_WINDOW, 10),
			});
			const result = await rateLimiter.check(`${clientIP}:${method}:${url.pathname}`);
			if (!result.allowed) {
				return jsonErr({ code: 'RATE_LIMITED', retryAfter: result.resetTime }, origin, env);
			}
		}

		try {
			return await handler(request, env, origin, caller);
		} catch (error: unknown) {
			console.error('withAuthHandler error:', error);
			return jsonErr({ code: 'INTERNAL' }, origin, env);
		}
	};
}

export default withAuthHandler;
