import { InviteSchema, type IInvite } from '@bee-epic/shared';

/**
 * Repository for `IInvite` records. Only this module is allowed to read/write
 * `env.CONTENT_KV` for invite data, so the storage layout can be swapped out
 * (e.g. to D1) without rippling through handlers.
 *
 * KV key conventions:
 *   - `invite:<token>` → JSON IInvite. Token is the unguessable URL-safe random
 *     string from `generateUrlSafeToken`; there is no secondary email index
 *     because lookup-by-email is rare (only `invalidateForEmail`) and the
 *     prefix scan is fine for that path.
 *
 * Tokens are opaque — callers never normalize them. Emails inside an
 * `IInvite` are stored as-given (the auth handler that builds the invite is
 * responsible for lowercasing), but `invalidateForEmail` lowercases both
 * sides of the comparison defensively.
 *
 * TTL: every `createInvite` write sets KV's `expirationTtl` so the platform
 * auto-evicts the record at `invite.expiresAt` — no sweeper required. The
 * read path still re-checks `expiresAt` against `Date.now()` because clocks
 * and KV eviction lag are both imperfect.
 *
 * Consistency note: KV has no compare-and-swap, so `consumeInvite` is a
 * read-then-delete and two concurrent calls can both observe the invite
 * before either deletes it. Callers MUST treat the user-creation step that
 * follows as idempotent.
 */

const INVITE_PREFIX = 'invite:';

function inviteKey(token: string): string {
	return `${INVITE_PREFIX}${token}`;
}

/**
 * Persist a new invite under `invite:<token>`. Validates with
 * `InviteSchema.parse()` (throws on bad shape) and sets KV's `expirationTtl`
 * so the record auto-evicts at `expiresAt`. The TTL is clamped to at least
 * 1 second — KV rejects values < 60 in production but a positive integer is
 * the only floor that matters for correctness; callers that pass an
 * already-expired `expiresAt` will get a 1-second record they can still
 * write without throwing, which the read path immediately treats as
 * expired.
 */
export async function createInvite(env: Env, invite: IInvite): Promise<void> {
	const parsed = InviteSchema.parse(invite);
	const ttlSeconds = Math.max(1, Math.ceil((parsed.expiresAt - Date.now()) / 1000));
	await env.CONTENT_KV.put(inviteKey(parsed.token), JSON.stringify(parsed), {
		expirationTtl: ttlSeconds,
	});
}

/**
 * Load an invite by opaque token. Returns null when the key is missing,
 * the stored JSON is corrupt, the schema doesn't validate, OR the invite
 * has expired. Expiry triggers a fire-and-forget delete of the stale
 * record so a clock-skew survivor doesn't linger in storage.
 */
export async function getInvite(env: Env, token: string): Promise<IInvite | null> {
	const key = inviteKey(token);
	const raw = await env.CONTENT_KV.get(key);
	if (!raw) return null;
	let invite: IInvite;
	try {
		const parsed = InviteSchema.safeParse(JSON.parse(raw));
		if (!parsed.success) {
			console.warn(`[inviteRepo] schema-invalid record at ${key}`);
			return null;
		}
		invite = parsed.data;
	} catch {
		console.warn(`[inviteRepo] failed to JSON.parse ${key}`);
		return null;
	}
	if (Date.now() >= invite.expiresAt) {
		// Fire-and-forget: caller doesn't care, and KV TTL will catch any
		// straggler eventually. Swallow errors so a transient delete failure
		// doesn't surface as a read failure.
		void env.CONTENT_KV.delete(key).catch(() => undefined);
		return null;
	}
	return invite;
}

/**
 * Atomically-enough read-then-delete an invite. Returns the invite on
 * success, or null when the token is missing/expired. Because KV has no
 * compare-and-swap, two concurrent callers can both see the same invite
 * before either deletes it — callers MUST make the follow-up user-creation
 * step idempotent (e.g. tolerate "user already exists" as success when the
 * email matches).
 */
export async function consumeInvite(env: Env, token: string): Promise<IInvite | null> {
	const invite = await getInvite(env, token);
	if (!invite) return null;
	await env.CONTENT_KV.delete(inviteKey(token));
	return invite;
}

/**
 * Delete every invite whose stored email matches `email` (case-insensitive
 * on both sides). Used when reinviting an address (kill stale invites) and
 * when disabling an account. Returns the number of records actually
 * deleted. Walks the `invite:` prefix with cursor pagination — KV's `list`
 * has no built-in filter on values.
 */
export async function invalidateForEmail(env: Env, email: string): Promise<number> {
	const target = email.toLowerCase();
	// First pass: collect every key whose stored invite matches. Deleting
	// while we walk the cursor would shift the keyspace under our feet and
	// risk skipping records, so we materialize the hit list first and then
	// delete in a second pass.
	const matches: string[] = [];
	let cursor: string | undefined;
	do {
		const listing = await env.CONTENT_KV.list({ prefix: INVITE_PREFIX, cursor });
		for (const { name } of listing.keys) {
			const raw = await env.CONTENT_KV.get(name);
			if (!raw) continue;
			let storedEmail: string;
			try {
				const parsed = InviteSchema.safeParse(JSON.parse(raw));
				if (!parsed.success) {
					console.warn(`[inviteRepo] schema-invalid record at ${name}`);
					continue;
				}
				storedEmail = parsed.data.email.toLowerCase();
			} catch {
				console.warn(`[inviteRepo] failed to JSON.parse ${name}`);
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
