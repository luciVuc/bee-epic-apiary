/**
 * PUT /users/me — self-service display-name edit.
 *
 * The ONLY field a user can edit about themselves without OWNER intervention.
 * Password changes go through `POST /auth/change-password` (its own selective
 * refresh-family invalidation path); role and status changes require an OWNER
 * calling `PUT /users/:email`. Keeping self-service narrow means the write
 * path here doesn't need last-OWNER / self-disable / role-escalation guards —
 * the schema simply doesn't accept those fields.
 *
 * Design notes:
 *   - No `requiredRole` on the wrapper: any authenticated caller may hit this.
 *     BUT this is a PUT, so `withAuthHandler`'s write-method floor applies —
 *     rank ≥ EMPLOYEE. Consequence: VENDOR is blocked with 403
 *     FORBIDDEN_WRITE_ROLE. That's a deliberate documented side-effect of the
 *     shipped write-floor policy; see the Phase 8 expansion doc's
 *     "allowSelfWriteWhenVendor" note for the future escape hatch if VENDORs
 *     ever need to edit their own display names. Not in scope for MVP.
 *   - Zod schema is `z.object({displayName: ...})` with default `.strip()`
 *     behaviour, so a client sending `{displayName: "x", role: "OWNER"}` gets
 *     the `role` field silently discarded — no privilege escalation vector.
 *     Verified by the `extra role field is stripped` test.
 *   - `displayName` is trimmed BEFORE the `.min(1)` check, so a whitespace-only
 *     payload (`"   "`) fails validation rather than persisting whitespace.
 *   - 404 USER_NOT_FOUND is a theoretical edge: the caller was authenticated
 *     (via cookie / dev header / bearer) but their `user:*` KV record has
 *     been deleted between `resolveCaller` and this handler firing. Documented
 *     for completeness; in normal operation the record always exists.
 *   - `caller.email.toLowerCase()` before the KV lookup: `resolveCaller`
 *     doesn't guarantee lowercase (dev header + JWT paths preserve whatever
 *     casing the identity source sent). Defensive normalization matches the
 *     pattern used in `deleteUser.ts:88`.
 */
import { z } from 'zod';
import { toUserPublic } from '@bee-epic/shared';
import { jsonErr, jsonOk, withAuthHandler } from '../../utils';
import type { ICaller } from '../../utils/resolveCaller';
import { getUser, updateUser } from '../repo/userRepo';

const UpdateMeBodySchema = z.object({
	displayName: z.string().trim().min(1).max(120),
});

async function handleUpdateMe(request: Request, env: Env, origin: string | null, caller?: ICaller): Promise<Response> {
	// Belt-and-braces: the wrapper's write-floor path already 401s anonymous
	// callers, but a static guard keeps this handler safe if the wrapper is
	// ever refactored.
	if (!caller) return jsonErr({ code: 'UNAUTHORIZED' }, origin, env);

	// Body parse.
	let raw: unknown;
	try {
		raw = await request.json();
	} catch {
		return jsonErr({ code: 'VALIDATION_FAILED', fields: { body: 'Invalid JSON' } }, origin, env);
	}
	const parsed = UpdateMeBodySchema.safeParse(raw);
	if (!parsed.success) {
		const flat = parsed.error.flatten().fieldErrors as Record<string, string[] | undefined>;
		const fields: Record<string, string> = {};
		for (const [k, v] of Object.entries(flat)) {
			if (v && v.length > 0) fields[k] = v[0];
		}
		return jsonErr({ code: 'VALIDATION_FAILED', fields }, origin, env);
	}
	const { displayName } = parsed.data;

	// Defensive lowercase — see module header.
	const callerEmail = caller.email.toLowerCase();
	const target = await getUser(env, callerEmail);
	if (!target) {
		return jsonErr({ code: 'USER_NOT_FOUND' }, origin, env);
	}

	const updated = await updateUser(env, callerEmail, { displayName });
	return jsonOk({ user: toUserPublic(updated) }, origin, env);
}

export default {
	fetch: withAuthHandler('PUT', handleUpdateMe),
} satisfies ExportedHandler<Env>;
