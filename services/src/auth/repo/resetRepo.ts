import { PasswordResetSchema, type IPasswordReset } from '@bee-epic/shared';

/**
 * Repository for `IPasswordReset` records. Only this module is allowed to
 * read/write `env.CONTENT_KV` for password-reset data, so the storage layout
 * can be swapped out (e.g. to D1) without rippling through handlers.
 *
 * KV key conventions:
 *   - `pwreset:<token>` → JSON IPasswordReset. Token is the unguessable
 *     URL-safe random string from `generateUrlSafeToken`; there is no
 *     secondary email index because lookup-by-email is rare (only
 *     `invalidateForEmail`) and the prefix scan is fine for that path.
 *
 * Tokens are opaque — callers never normalize them. Emails inside an
 * `IPasswordReset` are stored as-given (the auth handler that builds the
 * reset is responsible for lowercasing), but `invalidateForEmail`
 * lowercases both sides of the comparison defensively.
 *
 * TTL: every `createReset` write sets KV's `expirationTtl` so the platform
 * auto-evicts the record at `reset.expiresAt` — no sweeper required. The
 * read path still re-checks `expiresAt` against `Date.now()` because clocks
 * and KV eviction lag are both imperfect.
 *
 * Consistency note: KV has no compare-and-swap, so `consumeReset` is a
 * read-then-delete and two concurrent calls can both observe the reset
 * before either deletes it. Callers MUST treat the password-update step
 * that follows as idempotent.
 */

const RESET_PREFIX = 'pwreset:';

function resetKey(token: string): string {
	return `${RESET_PREFIX}${token}`;
}

/**
 * Persist a new password reset under `pwreset:<token>`. Validates with
 * `PasswordResetSchema.parse()` (throws on bad shape) and sets KV's
 * `expirationTtl` so the record auto-evicts at `expiresAt`. The TTL is
 * clamped to at least 1 second — KV rejects values < 60 in production but
 * a positive integer is the only floor that matters for correctness;
 * callers that pass an already-expired `expiresAt` will get a 1-second
 * record they can still write without throwing, which the read path
 * immediately treats as expired.
 */
export async function createReset(env: Env, reset: IPasswordReset): Promise<void> {
	const parsed = PasswordResetSchema.parse(reset);
	const ttlSeconds = Math.max(1, Math.ceil((parsed.expiresAt - Date.now()) / 1000));
	await env.CONTENT_KV.put(resetKey(parsed.token), JSON.stringify(parsed), {
		expirationTtl: ttlSeconds,
	});
}

/**
 * Load a password reset by opaque token. Returns null when the key is
 * missing, the stored JSON is corrupt, the schema doesn't validate, OR the
 * reset has expired. Expiry triggers a fire-and-forget delete of the stale
 * record so a clock-skew survivor doesn't linger in storage.
 */
export async function getReset(env: Env, token: string): Promise<IPasswordReset | null> {
	const key = resetKey(token);
	const raw = await env.CONTENT_KV.get(key);
	if (!raw) return null;
	let reset: IPasswordReset;
	try {
		const parsed = PasswordResetSchema.safeParse(JSON.parse(raw));
		if (!parsed.success) {
			console.warn(`[resetRepo] schema-invalid record at ${key}`);
			return null;
		}
		reset = parsed.data;
	} catch {
		console.warn(`[resetRepo] failed to JSON.parse ${key}`);
		return null;
	}
	if (Date.now() >= reset.expiresAt) {
		// Fire-and-forget: caller doesn't care, and KV TTL will catch any
		// straggler eventually. Swallow errors so a transient delete failure
		// doesn't surface as a read failure.
		void env.CONTENT_KV.delete(key).catch(() => undefined);
		return null;
	}
	return reset;
}

/**
 * Atomically-enough read-then-delete a password reset. Returns the reset on
 * success, or null when the token is missing/expired. Because KV has no
 * compare-and-swap, two concurrent callers can both see the same reset
 * before either deletes it — callers MUST make the follow-up password-update
 * step idempotent (e.g. tolerate "hash already rotated" as success when the
 * email matches).
 */
export async function consumeReset(env: Env, token: string): Promise<IPasswordReset | null> {
	const reset = await getReset(env, token);
	if (!reset) return null;
	await env.CONTENT_KV.delete(resetKey(token));
	return reset;
}

/**
 * Delete every reset whose stored email matches `email` (case-insensitive
 * on both sides). Used when issuing a fresh reset (kill stale ones) and
 * when disabling an account. Returns the number of records actually
 * deleted. Walks the `pwreset:` prefix with cursor pagination — KV's `list`
 * has no built-in filter on values.
 */
export async function invalidateForEmail(env: Env, email: string): Promise<number> {
	const target = email.toLowerCase();
	// First pass: collect every key whose stored reset matches. Deleting
	// while we walk the cursor would shift the keyspace under our feet and
	// risk skipping records, so we materialize the hit list first and then
	// delete in a second pass.
	const matches: string[] = [];
	let cursor: string | undefined;
	do {
		const listing = await env.CONTENT_KV.list({ prefix: RESET_PREFIX, cursor });
		for (const { name } of listing.keys) {
			const raw = await env.CONTENT_KV.get(name);
			if (!raw) continue;
			let storedEmail: string;
			try {
				const parsed = PasswordResetSchema.safeParse(JSON.parse(raw));
				if (!parsed.success) {
					console.warn(`[resetRepo] schema-invalid record at ${name}`);
					continue;
				}
				storedEmail = parsed.data.email.toLowerCase();
			} catch {
				console.warn(`[resetRepo] failed to JSON.parse ${name}`);
				continue;
			}
			if (storedEmail === target) {
				matches.push(name);
			}
		}
		cursor = listing.list_complete ? undefined : listing.cursor;
	} while (cursor);
	for (const name of matches) {
		await env.CONTENT_KV.delete(name);
	}
	return matches.length;
}
