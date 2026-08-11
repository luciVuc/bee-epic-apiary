/**
 * Returns true if `rawUrl`'s origin (scheme + host + port) matches any origin in
 * the comma-separated `allowedOrigins` configuration. Used to gate Stripe Checkout
 * `success_url` / `cancel_url` against the shop's trust boundary so a malicious
 * client can't route paid customers through Stripe and back to an attacker-controlled
 * page.
 *
 * Comparing the full origin — not just the hostname — is deliberate: a hostname-only
 * match would let `http://shop.example.com:1337/...` pass when only
 * `https://shop.example.com` is trusted (protocol downgrade + arbitrary port on the
 * same host).
 *
 * `*` is honored as a development bypass; falsy/invalid URLs return false.
 */
export function hostnameAllowed(rawUrl: string, allowedOrigins: string): boolean {
	if (allowedOrigins === '*') return true;
	if (!rawUrl) return false;
	let u: URL;
	try {
		u = new URL(rawUrl);
	} catch {
		return false;
	}
	const list = allowedOrigins
		.split(',')
		.map((s) => s.trim())
		.filter(Boolean);
	for (const origin of list) {
		try {
			if (new URL(origin).origin === u.origin) return true;
		} catch {
			// skip malformed entries
		}
	}
	return false;
}

export default hostnameAllowed;
