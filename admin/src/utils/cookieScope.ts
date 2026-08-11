/**
 * Approximate eTLD+1 comparison used by the api.ts boot-time check.
 *
 * Cookie scope follows the Public Suffix List, but pulling that in just to
 * warn on misconfiguration would be excessive — this helper does the cheap
 * thing that covers the cases admins actually misconfigure:
 *
 *   - `api.example.com` vs `admin.example.com`  → same ✓
 *   - `example.com`      vs `api.example.com`   → same ✓
 *   - `evilexample.com`  vs `example.com`       → different ✓ (no substring match)
 *   - `other.com`        vs `example.com`       → different ✓
 *
 * For hostnames that don't have a "." (e.g. `localhost`, `127.0.0.1`) we treat
 * any pair as matching: dev never serves cookies cross-origin, so the warning
 * is just noise there (review I1).
 */
export function sharesETldPlusOne(hostA: string, hostB: string): boolean {
  if (!hostA || !hostB) return false;
  if (hostA === hostB) return true;

  // Anything without a TLD-shaped suffix is treated as a dev host.
  const aHasDot = hostA.includes(".");
  const bHasDot = hostB.includes(".");
  if (!aHasDot || !bHasDot) return true;

  // Compare last-two labels with a leading dot so `evilexample.com` doesn't
  // pass against `example.com` via raw `.endsWith()`.
  const tail = (h: string) => "." + h.split(".").slice(-2).join(".");
  return tail(hostA) === tail(hostB);
}
