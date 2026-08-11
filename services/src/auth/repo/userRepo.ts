import { EStaffRole, EUserStatus, type IUser, type IUserPublic, UserSchema, toUserPublic } from '@bee-epic/shared';

/**
 * Repository for `IUser` records. Only this module is allowed to read/write
 * `env.CONTENT_KV` for user data, so the storage layout can be swapped out
 * (e.g. to D1) without rippling through handlers.
 *
 * KV key conventions:
 *   - `user:<email-lower>`  → JSON IUser
 *   - `user-index`          → JSON string[] of lowercase emails
 *
 * Emails are lowercased at every public-API entry — callers do not need to
 * normalize before calling.
 *
 * Consistency note: KV has no compare-and-swap, so concurrent
 * `createUser`/`deleteUser` calls can race the `user-index` write and leave
 * it out of sync with the underlying `user:*` records. `rebuildIndex` is the
 * recovery for both partial-failure orphans (crash between record + index
 * write) AND concurrent-write index drift.
 */

const INDEX_KEY = 'user-index';
const USER_PREFIX = 'user:';

function userKey(email: string): string {
	return `${USER_PREFIX}${email.toLowerCase()}`;
}

async function readIndex(env: Env): Promise<string[]> {
	const raw = await env.CONTENT_KV.get(INDEX_KEY);
	if (!raw) return [];
	try {
		const parsed = JSON.parse(raw);
		if (Array.isArray(parsed) && parsed.every((e) => typeof e === 'string')) {
			return parsed;
		}
		console.warn(`[userRepo] corrupt ${INDEX_KEY} payload — treating as empty`);
		return [];
	} catch {
		console.warn(`[userRepo] failed to JSON.parse ${INDEX_KEY} — treating as empty`);
		return [];
	}
}

async function writeIndex(env: Env, emails: string[]): Promise<void> {
	// Dedupe + sort defensively; index order is not semantically meaningful but
	// stable output makes diffs easier to read in storage inspections.
	const unique = [...new Set(emails.map((e) => e.toLowerCase()))].sort();
	await env.CONTENT_KV.put(INDEX_KEY, JSON.stringify(unique));
}

/** Load a single user by email. Returns null when missing or corrupt. */
export async function getUser(env: Env, email: string): Promise<IUser | null> {
	const key = userKey(email);
	const raw = await env.CONTENT_KV.get(key);
	if (!raw) return null;
	try {
		const parsed = UserSchema.safeParse(JSON.parse(raw));
		if (!parsed.success) {
			console.warn(`[userRepo] schema-invalid record at ${key}`);
			return null;
		}
		return parsed.data;
	} catch {
		console.warn(`[userRepo] failed to JSON.parse ${key}`);
		return null;
	}
}

/**
 * Create a new user. Validates with `UserSchema.parse()` (throws on bad shape),
 * fails if a user with the same email already exists, then writes the record
 * before updating the index — a partial failure between the two leaves an
 * orphaned record recoverable by `rebuildIndex` rather than a phantom index
 * entry.
 */
export async function createUser(env: Env, user: IUser): Promise<void> {
	const normalized: IUser = { ...user, email: user.email.toLowerCase() };
	UserSchema.parse(normalized);
	const existing = await getUser(env, normalized.email);
	if (existing) {
		throw new Error(`User already exists: ${normalized.email}`);
	}
	await env.CONTENT_KV.put(userKey(normalized.email), JSON.stringify(normalized));
	const index = await readIndex(env);
	if (!index.includes(normalized.email)) {
		index.push(normalized.email);
		await writeIndex(env, index);
	}
}

/**
 * Update a user. The patch may not change `email`, `schemaVersion`, or
 * `createdAt` — enforced at compile time via the `Omit`. `updatedAt` is
 * bumped to `Date.now()` automatically.
 */
export async function updateUser(
	env: Env,
	email: string,
	patch: Partial<Omit<IUser, 'email' | 'schemaVersion' | 'createdAt'>>,
): Promise<IUser> {
	const existing = await getUser(env, email);
	if (!existing) {
		throw new Error(`User not found: ${email.toLowerCase()}`);
	}
	const merged: IUser = { ...existing, ...patch, updatedAt: Date.now() };
	const parsed = UserSchema.parse(merged);
	await env.CONTENT_KV.put(userKey(parsed.email), JSON.stringify(parsed));
	return parsed;
}

/**
 * Delete a user. Idempotent — silently no-ops if the user is absent. Deletes
 * the record first, then strips the email from the index, so a partial
 * failure leaves a recoverable state.
 */
export async function deleteUser(env: Env, email: string): Promise<void> {
	const lower = email.toLowerCase();
	await env.CONTENT_KV.delete(userKey(lower));
	const index = await readIndex(env);
	if (index.includes(lower)) {
		await writeIndex(
			env,
			index.filter((e) => e !== lower),
		);
	}
}

/**
 * List every user known to the index. Records that fail to parse are skipped
 * (corruption shouldn't crash the admin Users page); the index entry is left
 * alone so `rebuildIndex` can detect and clean up.
 */
export async function listUsers(env: Env): Promise<IUser[]> {
	const index = await readIndex(env);
	const reads = await Promise.all(index.map((email) => getUser(env, email)));
	return reads.filter((u): u is IUser => u !== null);
}

/**
 * Count users with the given role that can still log in (ACTIVE or INVITED).
 * Disabled users are excluded so callers can use this for last-OWNER guards
 * without accidentally counting a tombstoned account.
 */
export async function countByRole(env: Env, role: EStaffRole): Promise<number> {
	const users = await listUsers(env);
	return users.filter((u) => u.role === role && u.status !== EUserStatus.DISABLED).length;
}

/** Strip the password hash for client consumption. Thin re-export. */
export function toPublic(user: IUser): IUserPublic {
	return toUserPublic(user);
}

/**
 * Recovery: walk `user:` prefix and overwrite the index from the discovered
 * keys. Returns the resulting count. Intended for emergency use, e.g. when
 * `createUser` crashed between the record write and the index write.
 */
export async function rebuildIndex(env: Env): Promise<number> {
	const emails: string[] = [];
	let cursor: string | undefined;
	do {
		const listing = await env.CONTENT_KV.list({ prefix: USER_PREFIX, cursor });
		emails.push(...listing.keys.map((k) => k.name.slice(USER_PREFIX.length).toLowerCase()));
		cursor = listing.list_complete ? undefined : listing.cursor;
	} while (cursor);
	const unique = [...new Set(emails)];
	await writeIndex(env, unique);
	return unique.length;
}
