/**
 * POST /auth/change-password — rotate the caller's password + invalidate every
 * OTHER refresh family for that email while preserving the current cookie
 * session.
 *
 * Design notes:
 *   - `public: true` on withAuthHandler is deliberate for this MUTATION. The
 *     wrapper's write-method floor (see `withAuthHandler.ts` lines 89-94)
 *     requires EMPLOYEE ≥ rank 1, which would block VENDOR (rank 0). This
 *     endpoint accepts ANY authenticated caller because a VENDOR must be able
 *     to change their own password. Setting `requiredRole: VENDOR` doesn't
 *     help — the write-floor still fires. So we go `public: true` (skip both
 *     the requiredRole check AND the write-floor) and resolve the caller
 *     inside the handler; 401 UNAUTHORIZED if none. A future dev seeing
 *     `public: true` on a mutation should read this comment before filing a
 *     bug.
 *   - Selective family invalidation: the goal is "kill every OTHER session
 *     but keep me signed in on THIS device". We identify the current family
 *     via the verified `bea_rt` cookie (readVerifiedRefreshPayload → payload.fid).
 *     Every family for this email except `fid` is deleted. Bearer / dev
 *     callers have no refresh cookie — we can't distinguish current from
 *     other, so we delete ALL families (safe default: "when you can't tell,
 *     assume nothing is current"). The bearer caller re-authenticates via
 *     API_SECRET_KEY on the next request anyway, so this doesn't lock them
 *     out.
 *   - Same-password short-circuit: if `newPassword === currentPassword` we
 *     return 204 with zero state change (no re-hash, no family sweep, no
 *     email). Rationale: (1) the user's intent is unambiguously idempotent,
 *     (2) re-hashing under the same plaintext produces a new hash (salt),
 *     which would look like a rotation to downstream observers and (3)
 *     invalidating other sessions on a no-op password change is a
 *     footgun. Guard sits AFTER verify-current + validate-new so we don't
 *     silently accept a weak "no-op" that the policy would otherwise reject.
 *   - Validate-then-rotate ordering (mirrors completeReset): verify current,
 *     validate new, THEN commit. A weak-password or wrong-current response
 *     leaves state untouched.
 *   - INVITED user with null passwordHash: guarded — this handler must never
 *     succeed against a user who hasn't set a password yet. Login already
 *     rejects INVITED, so we shouldn't normally reach here for an INVITED
 *     account, but a direct KV manipulation could produce this state.
 *     INVALID_CREDENTIALS (not INVALID_TOKEN) because the caller IS
 *     authenticated (their JWT is valid); they just have no current password
 *     to verify against.
 *   - Notification email is fire-and-forget: gated by
 *     `policy.notifyOnPasswordChange`, wrapped in `.catch` so a mail failure
 *     never rolls back the password change.
 */
import { z } from 'zod';
import { EUserStatus, type IUser } from '@bee-epic/shared';
import { jsonErr, jsonResponse, resolveCaller, withAuthHandler } from '../../utils';
import { hashPassword, verifyPassword } from '../crypto/passwordHash';
import { validatePassword } from '../policy/validatePassword';
import { sendPasswordChanged } from '../emails/sendPasswordChanged';
import { getPolicy } from '../repo/policyRepo';
import { deleteFamily, listForEmail } from '../repo/refreshFamilyRepo';
import { getUser, updateUser } from '../repo/userRepo';
import { readVerifiedRefreshPayload } from '../readVerifiedRefreshPayload';

const ChangePasswordBodySchema = z.object({
	currentPassword: z.string().min(1),
	newPassword: z.string().min(1),
});

async function handleChangePassword(request: Request, env: Env, origin: string | null): Promise<Response> {
	// 1) Caller identity. `public: true` on the wrapper means we resolve here.
	const caller = await resolveCaller(request, env);
	if (!caller) {
		return jsonErr({ code: 'UNAUTHORIZED' }, origin, env);
	}

	// 2) Body validation.
	let raw: unknown;
	try {
		raw = await request.json();
	} catch {
		return jsonErr({ code: 'VALIDATION_FAILED', fields: { body: 'Invalid JSON' } }, origin, env);
	}
	const parsed = ChangePasswordBodySchema.safeParse(raw);
	if (!parsed.success) {
		const flat = parsed.error.flatten().fieldErrors as Record<string, string[] | undefined>;
		const fields: Record<string, string> = {};
		for (const [k, v] of Object.entries(flat)) {
			if (v && v.length > 0) fields[k] = v[0];
		}
		return jsonErr({ code: 'VALIDATION_FAILED', fields }, origin, env);
	}
	const { currentPassword, newPassword } = parsed.data;

	// 3) Fetch the caller's user record. The caller was resolved from a valid
	// identity token, so the record SHOULD exist. A missing record here means
	// the identity source (CF Access / staff list / bearer) is out of sync
	// with KV — surface as INTERNAL rather than a distinguishable
	// USER_NOT_FOUND.
	const user = await getUser(env, caller.email);
	if (!user) {
		console.warn('[changePassword] caller resolved but user missing', caller.email);
		return jsonErr({ code: 'INTERNAL' }, origin, env);
	}

	// 4) Verify current password. INVITED user with null passwordHash falls
	// through here as INVALID_CREDENTIALS — see module header.
	if (user.passwordHash === null || user.status === EUserStatus.INVITED) {
		return jsonErr({ code: 'INVALID_CREDENTIALS' }, origin, env);
	}
	const ok = await verifyPassword(currentPassword, user.passwordHash);
	if (!ok) {
		return jsonErr({ code: 'INVALID_CREDENTIALS' }, origin, env);
	}

	// 5) Validate new password against policy.
	const policy = await getPolicy(env);
	const result = await validatePassword(newPassword, policy);
	if (!result.ok) {
		return jsonErr({ code: 'WEAK_PASSWORD', reasons: result.reasons }, origin, env);
	}

	// 6) Same-password short-circuit — see module header. Runs AFTER validate
	// so a weak-and-identical password still surfaces WEAK_PASSWORD.
	if (currentPassword === newPassword) {
		return jsonResponse({}, 204, origin, env);
	}

	// 7) Hash + persist the new credential.
	const newHash = await hashPassword(newPassword);
	const now = Date.now();
	await updateUser(env, user.email, { passwordHash: newHash, updatedAt: now });
	const rotatedUser: IUser = { ...user, passwordHash: newHash, updatedAt: now };

	// 8) Selective family invalidation. Bearer / dev callers with no refresh
	// cookie fall through with `currentFid === null` → delete every family.
	const currentPayload = await readVerifiedRefreshPayload(request, env);
	const currentFid = currentPayload?.fid ?? null;
	const families = await listForEmail(env, user.email);
	for (const family of families) {
		if (family.familyId !== currentFid) {
			await deleteFamily(env, user.email, family.familyId);
		}
	}

	// 9) Fire-and-forget notification.
	if (policy.notifyOnPasswordChange) {
		void sendPasswordChanged(env, rotatedUser).catch((err) => {
			console.warn('[changePassword] notification failed', err);
		});
	}

	// 10) 204 No Content — no envelope body.
	return jsonResponse({}, 204, origin, env);
}

export default {
	fetch: withAuthHandler('POST', handleChangePassword, { public: true }),
} satisfies ExportedHandler<Env>;
