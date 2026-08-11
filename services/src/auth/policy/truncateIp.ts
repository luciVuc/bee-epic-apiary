/**
 * Truncate a client IP for storage in the auth trail (`IUser.lastLoginIp`,
 * `IRefreshFamily.ip`). Retains coarse network locality for abuse
 * investigation while shedding the host-identifying suffix:
 *   - IPv4 → /24 (last octet zeroed, e.g. 1.2.3.4 → 1.2.3.0)
 *   - IPv6 → /64 (first four hextets kept, rest replaced with `::`)
 *   - IPv4-mapped IPv6 (`::ffff:a.b.c.d`) is unwrapped to the embedded IPv4
 *     and truncated as /24. Some proxy chains hand us the mapped form; we
 *     don't want the same underlying network to fingerprint differently
 *     depending on whether the CF edge normalized it.
 *   - Compressed IPv6 (`::1`, `fe80::1`, `2001:db8::`) with fewer than four
 *     concrete hextets before the `::` cannot be safely rewritten to a /64
 *     without silently changing semantics — return `'unknown'` rather than
 *     emit invalid syntax that downstream parsers will trip over.
 *   - Any other unparseable input → `'unknown'` (fail closed).
 *
 * Never throws. The output is always a valid IPv4 /24, a canonical IPv6
 * `hextet:hextet:hextet:hextet::` form, or the literal string 'unknown'.
 */
export function truncateIp(ip: string): string {
	// IPv4-mapped IPv6: unwrap to the embedded IPv4 (case-insensitive on 'ffff').
	const mapped = ip.match(/^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/i);
	const target = mapped ? mapped[1] : ip;

	// IPv4 path — only if there are no colons at all (bare v4, or unwrapped v4-mapped).
	if (target.includes('.') && !target.includes(':')) {
		const parts = target.split('.');
		if (parts.length !== 4) return 'unknown';
		for (const octet of parts) {
			if (!/^\d{1,3}$/.test(octet)) return 'unknown';
			const n = Number(octet);
			if (n < 0 || n > 255) return 'unknown';
		}
		return `${parts[0]}.${parts[1]}.${parts[2]}.0`;
	}

	// IPv6 path.
	if (target.includes(':')) {
		// Compressed form: expand only when we already have ≥ 4 concrete
		// hextets on the left side of `::`; otherwise we'd be guessing which
		// slot the address's /64 boundary actually sits at.
		if (target.includes('::')) {
			const [head] = target.split('::');
			if (!head) return 'unknown';
			const headGroups = head.split(':');
			if (headGroups.length < 4) return 'unknown';
			const first4 = headGroups.slice(0, 4);
			for (const g of first4) {
				if (!/^[0-9a-f]{1,4}$/i.test(g)) return 'unknown';
			}
			return `${first4.join(':')}::`;
		}
		// Fully uncompressed: must have at least four hextets.
		const parts = target.split(':');
		if (parts.length < 4) return 'unknown';
		for (const g of parts.slice(0, 4)) {
			if (!/^[0-9a-f]{1,4}$/i.test(g)) return 'unknown';
		}
		return `${parts.slice(0, 4).join(':')}::`;
	}

	return 'unknown';
}
