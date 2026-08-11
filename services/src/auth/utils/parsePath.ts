/**
 * Shared helper for handlers on `/users/:email(/suffix)?` URL shapes.
 *
 * `updateUser` (`PUT /users/:email`), `deleteUser` (`DELETE /users/:email`),
 * and `reinviteUser` (`POST /users/:email/reinvite`) all need to pull the
 * `:email` segment out of the request pathname, normalize it, and reject
 * anything that doesn't match the expected shape. Before this helper each
 * handler shipped its own copy of an identical regex + decode block; hoisting
 * it here keeps the three call sites in lockstep and gives one place to
 * evolve the parsing rules (e.g. tightening the email charset later).
 *
 * Design notes:
 *   - `suffix` is either `''` (bare `/users/:email`) or `/reinvite` for the
 *     one route that appends a fixed action segment. The enum-of-two here is
 *     deliberate: we don't want callers passing arbitrary regex-hostile
 *     strings, and the two shapes cover every current use. If a third
 *     `/users/:email/<something>` route appears later, extend the union
 *     type — the whitelist beats a free-form string.
 *   - Trailing-slash tolerance is preserved from the original helper so
 *     `/users/alice@example.com/` remains a valid synonym for the bare form
 *     and `/users/alice@example.com/reinvite/` for the suffixed form.
 *   - `decodeURIComponent` on a malformed `%GG` sequence throws; we catch
 *     and return null so the handler treats it as "no match" and surfaces a
 *     404 via `jsonErr({code:'NOT_FOUND'})` rather than crashing.
 *   - Lowercased on the way out: every downstream repo lookup normalizes
 *     emails to lowercase, so doing it here keeps the handlers from
 *     duplicating the `.toLowerCase()` call.
 */

export type UsersPathSuffix = '' | '/reinvite';

/**
 * Extract the `:email` segment from a `/users/:email(/suffix)?` URL path.
 *
 * @param pathname - URL pathname to parse (already URL-decoded once by the
 *   `URL` constructor at the call site; this function does a second decode
 *   on just the email segment to handle `%40` and friends).
 * @param suffix - Fixed action segment appended after the email, or `''`
 *   for the bare `/users/:email` shape. Defaults to `''`.
 * @returns The lowercased, URL-decoded email, or `null` if the pathname
 *   doesn't match the expected shape or the email segment is malformed.
 */
export function extractEmailFromUsersPath(pathname: string, suffix: UsersPathSuffix = ''): string | null {
	// Build the regex once per call. The suffix set is known-safe (union of
	// literal strings), so escaping is belt-and-braces rather than defensive.
	const escapedSuffix = suffix ? suffix.replace(/\//g, '\\/') : '';
	const regex = new RegExp(`^\\/users\\/([^/]+)${escapedSuffix}\\/?$`);
	const match = pathname.match(regex);
	if (!match) return null;
	try {
		return decodeURIComponent(match[1]).toLowerCase();
	} catch {
		return null;
	}
}
