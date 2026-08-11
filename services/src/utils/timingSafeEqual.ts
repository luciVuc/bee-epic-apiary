/**
 * Length-aware, branchless string compare. When `a.length === b.length`, every
 * character is walked regardless of where a mismatch occurs, so timing reveals
 * only the length, not which character diverged.
 *
 * Used for comparing the bearer fallback against `API_SECRET_KEY`. A direct
 * `===` short-circuits on the first mismatching character, which leaks the
 * shared prefix length to a remote attacker capable of timing many probes.
 *
 * Not constant-time across mismatched lengths — but the length of
 * `API_SECRET_KEY` is configuration, not a secret. The threat model is
 * "attacker probes a candidate token of the same length".
 */
export function timingSafeEqual(a: string, b: string): boolean {
	if (a.length !== b.length) return false;
	let diff = 0;
	for (let i = 0; i < a.length; i++) {
		diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
	}
	return diff === 0;
}

export default timingSafeEqual;
