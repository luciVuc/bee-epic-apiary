/**
 * GET /users — return every user record (public shape, no passwordHash).
 *
 * Design notes:
 *   - `requiredRole: OWNER` on withAuthHandler: only OWNERs can enumerate the
 *     staff roster. Anonymous callers get 401 UNAUTHORIZED and any lower-rank
 *     caller (MANAGER/EMPLOYEE/VENDOR) gets 403 FORBIDDEN with
 *     `requiredRole: 'OWNER'` — both handled by the wrapper, so this handler
 *     runs only when the caller has already cleared the OWNER floor. This
 *     mirrors the admin-UI trust model: user management is an owner-only
 *     surface (invite, disable, delete, role-change), so listing must be too.
 *   - Defensive re-sort by lowercase email: `userRepo.writeIndex` already
 *     dedupes-and-sorts the `user-index` on every write, so `listUsers`
 *     usually returns records in a stable order. But `rebuildIndex` walks the
 *     `user:` prefix via `KV.list()` (whose ordering is a stability
 *     implementation detail, not a semantic guarantee), and any manual KV
 *     surgery could leave the index in an arbitrary order. Sorting here
 *     defensively pins the UI order regardless of what the index looks like
 *     underneath — a jittery user list is a bad admin experience and worth
 *     one localeCompare per record.
 *   - DISABLED users are INCLUDED in the response. The list endpoint is the
 *     admin UI's window into the entire staff roster across its full
 *     lifecycle — INVITED (awaiting invite acceptance), ACTIVE (can log in),
 *     and DISABLED (tombstoned but retained for audit). Filtering here would
 *     hide the "re-enable this account" workflow; the UI is responsible for
 *     surfacing status distinctions visually.
 *   - `toPublic` strips `passwordHash` before serialization. Server-side
 *     stripping is the single source of truth for what leaves the worker —
 *     the type system (`IUserPublic`) also enforces this, so an accidental
 *     `users.map(u => u)` regression would be caught at compile time.
 */
import { EStaffRole, type IUserPublic } from '@bee-epic/shared';
import { jsonOk, withAuthHandler } from '../../utils';
import { listUsers, toPublic } from '../repo/userRepo';

async function handleListUsers(_request: Request, env: Env, origin: string | null): Promise<Response> {
	const users = await listUsers(env);
	const publicUsers: IUserPublic[] = users.map(toPublic).sort((a, b) => a.email.localeCompare(b.email));
	return jsonOk({ users: publicUsers }, origin, env);
}

export default {
	fetch: withAuthHandler('GET', handleListUsers, { requiredRole: EStaffRole.OWNER }),
} satisfies ExportedHandler<Env>;
