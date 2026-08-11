/**
 * Resolves the `from:` address for every auth-related outbound email
 * (invitations, password-reset links, password-changed notices).
 *
 * Design — all auth mail comes from ONE consistent, verified sender so
 * recipients see the same identity across the three flows. In production
 * `env.AUTH_FROM_ADDRESS` supplies that address (a Cloudflare Email Routing
 * verified destination). In dev the env var is typically unset, so we derive
 * a `noreply@<hostname>` address from `env.ADMIN_BASE_URL` — enough for local
 * inspection via wrangler tail, and won't actually deliver anyway.
 *
 * Only the human-readable display name changes per template — see
 * `TAuthEmailKind` below.
 *
 * Pure, synchronous, no side effects other than a single `console.warn` when
 * `AUTH_FROM_ADDRESS` is set to a malformed value. That warn is deliberate —
 * a misconfigured production env var is the most likely reason mail suddenly
 * starts coming from `noreply@admin.beeepic…` instead of the real sender.
 */

/** The kind of auth email — used for the display name on the `from` line. */
export type TAuthEmailKind = 'invite' | 'reset' | 'password-changed';

const DISPLAY_NAMES: Record<TAuthEmailKind, string> = {
	invite: 'Bee Epic Admin — Invitation',
	reset: 'Bee Epic Admin — Password Reset',
	'password-changed': 'Bee Epic Admin — Security',
};

/**
 * Bare-shape validity check for an email address — must contain a single `@`
 * with non-empty local and domain parts. Deliberately NOT a full RFC 5322
 * validator; anything more sophisticated has too many false negatives on
 * legitimate corporate addresses. Cloudflare Email Routing will reject
 * genuinely malformed addresses at send time.
 */
function isEmailShaped(value: string): boolean {
	const at = value.indexOf('@');
	if (at <= 0) return false; // no @, or @ is first char (empty local)
	if (at !== value.lastIndexOf('@')) return false; // multiple @s
	if (at === value.length - 1) return false; // empty domain
	return true;
}

/**
 * Extract the hostname from `ADMIN_BASE_URL` for the `noreply@<host>` fallback.
 * Returns null on any parse failure or empty hostname so the caller can drop
 * to the final hardcoded `localhost` fallback. `new URL` throws on invalid
 * input, hence the try/catch.
 */
function deriveHostname(adminBaseUrl: string | undefined): string | null {
	if (!adminBaseUrl) return null;
	try {
		const host = new URL(adminBaseUrl).hostname;
		return host || null;
	} catch {
		return null;
	}
}

/**
 * Resolve the from-address for an auth email. Prefers `env.AUTH_FROM_ADDRESS`
 * when set to a valid-shaped address; otherwise falls back to
 * `noreply@<derived-domain>` where the domain comes from `env.ADMIN_BASE_URL`'s
 * hostname; final fallback is `noreply@localhost`.
 *
 * Return shape matches Cloudflare's SendEmail builder — `{ email, name }`.
 */
export function authFromAddress(env: Env, kind: TAuthEmailKind): { email: string; name: string } {
	const name = DISPLAY_NAMES[kind];

	// AUTH_FROM_ADDRESS is a secret (see `src/env.d.ts` augmentation), so it is
	// typed on Env but may be undefined when unset.
	const configured = env.AUTH_FROM_ADDRESS;

	// Non-empty configured value — accept it if valid-shaped, warn+fallback if not.
	// Empty string is treated as "unset" (dev convenience) so it does NOT warn.
	if (typeof configured === 'string' && configured.length > 0) {
		if (isEmailShaped(configured)) {
			return { email: configured, name };
		}
		console.warn(`[emails/from] AUTH_FROM_ADDRESS is set but malformed (${configured}) — falling back to noreply@<host>`);
	}

	const host = deriveHostname(env.ADMIN_BASE_URL);
	if (host) {
		return { email: `noreply@${host}`, name };
	}

	return { email: 'noreply@localhost', name };
}
