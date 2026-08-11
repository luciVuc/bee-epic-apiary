import type { IAuthPolicy } from '@bee-epic/shared';

/**
 * Password policy validator called by `/auth/accept-invite`,
 * `/auth/complete-reset`, and `/auth/change-password`. Decides whether a
 * proposed password is acceptable under the current owner-configured
 * `IAuthPolicy`.
 *
 * Design (NIST-style — length + denylist, no character-class rules):
 *   1. Minimum length — `policy.minLength` (already floor-clamped to ≥ 8 by
 *      policyRepo).
 *   2. Denylist — small hardcoded set of the worst common passwords,
 *      case-insensitive.
 *   3. HIBP k-anonymity — only when `policy.checkBreachCorpus === true`. SHA-1
 *      the password, send the first 5 hex chars to api.pwnedpasswords.com, and
 *      look for our 35-char suffix in the response. FAIL OPEN on any network
 *      error or non-OK response so a transient outage cannot lock users out of
 *      choosing an otherwise-fine password.
 *
 * All rules are evaluated — we never short-circuit — so a single call reports
 * every failure at once and the user only has to retype once.
 */

/**
 * Result of validating a proposed password against the current policy.
 * When ok=false, `reasons` is an array of human-readable strings the client
 * can display verbatim (e.g. "Password must be at least 12 characters",
 * "This password appears in a known-breach corpus"). Multiple reasons can
 * be reported at once so the user sees every failure in one pass.
 */
export interface IValidatePasswordResult {
	ok: boolean;
	reasons: string[]; // empty when ok=true
}

/**
 * The 20 most-abused passwords per historical breach corpora. Kept small and
 * hardcoded so the check is instantaneous and cannot silently regress on a
 * data-file swap. Case-insensitive lookup — entries stored lowercase.
 */
export const PASSWORD_DENYLIST: ReadonlySet<string> = new Set([
	'password',
	'password1',
	'password123',
	'12345678',
	'123456789',
	'1234567890',
	'qwerty',
	'qwerty123',
	'admin',
	'admin123',
	'letmein',
	'welcome',
	'welcome1',
	'iloveyou',
	'monkey',
	'dragon',
	'sunshine',
	'princess',
	'football',
	'baseball',
]);

const HIBP_URL = 'https://api.pwnedpasswords.com/range/';

/**
 * Validate a proposed password against the given policy. Never throws — HIBP
 * failures are logged and swallowed (fail-open). Returns collected reasons so
 * the client can show every failure in one pass.
 */
export async function validatePassword(password: string, policy: IAuthPolicy): Promise<IValidatePasswordResult> {
	const reasons: string[] = [];

	// 1. Length
	if (password.length < policy.minLength) {
		reasons.push(`Password must be at least ${policy.minLength} characters`);
	}

	// 2. Denylist (case-insensitive)
	if (PASSWORD_DENYLIST.has(password.toLowerCase())) {
		reasons.push('Password is too common; please choose a less predictable one');
	}

	// 3. HIBP — only if enabled. SHA-1 is cheap but we still skip it when off.
	if (policy.checkBreachCorpus) {
		const hibpReason = await checkHibp(password);
		if (hibpReason) reasons.push(hibpReason);
	}

	return { ok: reasons.length === 0, reasons };
}

/**
 * Query HIBP k-anonymity API for `password`. Returns a reason string if the
 * password's full SHA-1 suffix appears in the response with count > 0;
 * returns null on match-miss OR any failure (fail-open).
 */
async function checkHibp(password: string): Promise<string | null> {
	let hash: string;
	try {
		const digest = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(password));
		hash = toHexUpper(digest);
	} catch (err) {
		console.warn(`[validatePassword] SHA-1 digest failed — failing open: ${(err as Error).message}`);
		return null;
	}
	const prefix = hash.substring(0, 5);
	const suffix = hash.substring(5);

	let body: string;
	try {
		const res = await fetch(`${HIBP_URL}${prefix}`, {
			headers: { 'Add-Padding': 'true' },
			signal: AbortSignal.timeout(3000),
		});
		if (!res.ok) {
			console.warn(`[validatePassword] HIBP responded ${res.status} — failing open`);
			return null;
		}
		body = await res.text();
	} catch (err) {
		console.warn(`[validatePassword] HIBP fetch threw — failing open: ${(err as Error).message}`);
		return null;
	}

	// Body is `HASH_SUFFIX:count` per line. HIBP separates with \r\n, but be
	// tolerant of \n too so tests and future formats don't trip us up.
	const lines = body.split(/\r?\n/);
	for (const raw of lines) {
		const line = raw.trim();
		if (!line) continue;
		const idx = line.indexOf(':');
		if (idx <= 0) continue;
		const lineSuffix = line.substring(0, idx).toUpperCase();
		if (lineSuffix !== suffix) continue;
		const countStr = line.substring(idx + 1).trim();
		if (!/^\d+$/.test(countStr)) continue;
		const count = parseInt(countStr, 10);
		if (Number.isFinite(count) && count > 0) {
			return `This password appears in a known-breach corpus (${count} known exposures)`;
		}
		// Matched suffix with 0/invalid count — treat as non-match (fail-open on
		// weird server data rather than reporting a phantom breach).
		return null;
	}
	return null;
}

/**
 * Encode an ArrayBuffer as an uppercase hex string. Tiny hand-rolled helper —
 * intentionally no library dependency; only used on the 20-byte SHA-1 output
 * so allocation is negligible.
 */
function toHexUpper(buffer: ArrayBuffer): string {
	const bytes = new Uint8Array(buffer);
	let out = '';
	for (const b of bytes) {
		out += b.toString(16).padStart(2, '0');
	}
	return out.toUpperCase();
}
