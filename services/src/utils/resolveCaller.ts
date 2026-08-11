import { EStaffRole, EUserStatus } from '@bee-epic/shared';
import { ACCESS_COOKIE, readCookie } from '../auth/cookies';
import { verifyJwt } from '../auth/crypto/jwt';
import { getUser } from '../auth/repo/userRepo';
import { timingSafeEqual } from './timingSafeEqual';

export interface ICaller {
	email: string;
	role: EStaffRole;
	via: 'cookie' | 'bearer' | 'dev';
}

export { roleSatisfies } from '@bee-epic/shared';

/**
 * Resolves the caller identity from the incoming request using a three-path trust chain:
 *
 *   A) Cookie      — `bea_at` HttpOnly session cookie, verified via HMAC-SHA256
 *   B) Bearer      — `Authorization: Bearer <API_SECRET_KEY>` for CI / scripts
 *   C) Dev bypass  — `X-Dev-Email` header, only when ENVIRONMENT === 'development'
 *
 * Ordering rationale. Cookie first because it's the production path — every
 * authenticated admin request carries `bea_at`, and the hot loop cannot afford
 * a KV probe before the JWT verify short-circuits. Bearer second because it's
 * a CI-only edge case that most requests skip via the header-absence guard.
 * Dev bypass last (and gated on `ENVIRONMENT`) so a config gap in production
 * cannot open the door.
 *
 * Role authority. Both the cookie and dev paths derive the caller's role from
 * the CURRENT `IUser` record, NOT from the JWT payload. A stale JWT that
 * claims OWNER on a since-demoted account resolves as the demoted role. The
 * same principle disables sessions for DISABLED users even if they still hold
 * a pre-disable JWT that would verify.
 *
 * Returns `null` if none of the paths produce an authenticated identity.
 */
export async function resolveCaller(request: Request, env: Env): Promise<ICaller | null> {
	// Path A: cookie (bea_at). Verify HMAC → look up user record → return.
	// Any failure (missing cookie, bad sig, expired, missing user, DISABLED)
	// falls through to Path B without a further probe.
	const accessToken = readCookie(request, ACCESS_COOKIE);
	if (accessToken) {
		const payload = await verifyJwt(accessToken, env.JWT_SIGNING_SECRET, 'access');
		if (payload && typeof payload.sub === 'string' && payload.sub.length > 0) {
			const user = await getUser(env, payload.sub);
			if (user && user.status !== EUserStatus.DISABLED) {
				return { email: user.email, role: user.role, via: 'cookie' };
			}
		}
	}

	// Path B: bearer fallback (CI / scripts).
	if (env.API_SECRET_KEY) {
		const authHeader = request.headers.get('Authorization');
		if (authHeader) {
			const [scheme, token] = authHeader.split(' ');
			if (scheme === 'Bearer' && token && timingSafeEqual(token, env.API_SECRET_KEY)) {
				return { email: 'ci@service', role: EStaffRole.OWNER, via: 'bearer' };
			}
		}
	}

	// Path C: dev bypass — opt-in via explicit ENVIRONMENT=development. A missing
	// or empty binding is treated as production so a config gap can't open the door.
	const isDev = (env.ENVIRONMENT ?? '').toLowerCase() === 'development';
	if (isDev) {
		const devEmail = request.headers.get('X-Dev-Email');
		if (devEmail) {
			const user = await getUser(env, devEmail);
			if (user) {
				if (user.status === EUserStatus.DISABLED) return null;
				return { email: user.email, role: user.role, via: 'dev' };
			}
			// OWNER_EMAILS fallback: bootstrap escape hatch. Allows the very
			// first dev-loop request to succeed before any user records exist.
			const ownerEmails = (env.OWNER_EMAILS ?? '')
				.split(',')
				.map((e) => e.trim().toLowerCase())
				.filter((e) => e.length > 0);
			if (ownerEmails.includes(devEmail.toLowerCase())) {
				return { email: devEmail, role: EStaffRole.OWNER, via: 'dev' };
			}
		}
	}

	return null;
}
