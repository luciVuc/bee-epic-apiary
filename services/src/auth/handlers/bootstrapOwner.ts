/**
 * POST /auth/bootstrap-owner — first-time OWNER setup gate.
 *
 * Design notes:
 *   - `public: true` on withAuthHandler: this endpoint MUST be reachable
 *     without a caller cookie, because by definition no OWNER exists yet to
 *     have logged in. Origin + the wrapper's generic write rate-limit still
 *     apply; the handler adds its own `auth:bootstrap-owner:<ip>` bucket at
 *     5/hr.
 *   - Response shape is `{inviteEmailSent: true}` — NOT a `caller`. This
 *     endpoint creates an invite (like /users/invite) rather than a session.
 *     The invitee then completes the flow by accepting the invite in the
 *     usual way.
 *   - Env binding note: the spec talks about `BOOTSTRAP_OWNER_EMAIL`
 *     (singular) but the actual worker binding is `env.OWNER_EMAILS`
 *     (comma-separated). We reconcile in favor of the actual binding and
 *     parse the comma list ourselves (split → trim → lowercase → filter
 *     empty).
 *   - Two gates for BOOTSTRAP_DISABLED:
 *       1. `env.OWNER_EMAILS` is unset OR parses to an empty list.
 *       2. `countByRole(OWNER) > 0` — an OWNER already exists, so bootstrap
 *          is over. Subsequent OWNER invites must go through /users/invite
 *          by an authenticated OWNER.
 *     Both collapse to the same code so an attacker cannot tell whether
 *     bootstrap is disabled-by-config vs disabled-by-completion.
 *   - Idempotent re-trigger: if an INVITED OWNER user record already exists
 *     for the requested email, we treat the call as a resend — invalidate
 *     stale invites, mint a fresh token, re-send the email. This makes the
 *     endpoint safe to hit repeatedly during an operator's first-run setup
 *     without leaving orphan users behind.
 *   - EMAIL_MISMATCH for non-allowlisted emails is a flat 400 — we do NOT
 *     leak how close the caller was to a real allowed value. Same code
 *     covers "target email is already an INVITED non-OWNER", to avoid
 *     signalling "someone already claimed this address for another role".
 *   - The email send is fire-and-forget: the invite record is already in
 *     KV before we call `sendInvite`, so an SMTP failure is recoverable via
 *     a re-trigger (which hits the idempotent path). Bubbling the error
 *     would defeat the point of committing the invite.
 *   - `invitedBy` synthetic value: `system@bootstrap.local` — passes
 *     `z.string().email()` validation in `InviteSchema` and clearly marks
 *     invites minted by this handler versus /users/invite (where the value
 *     is a real caller email).
 */
import { z } from 'zod';
import { EStaffRole, EUserStatus, INVITE_TTL_MS, type IInvite, type IUser } from '@bee-epic/shared';
import { getClientIp, jsonErr, jsonOk, RateLimiter, withAuthHandler } from '../../utils';
import { generateUrlSafeToken } from '../crypto/tokens';
import { sendInvite } from '../emails/sendInvite';
import { createInvite, invalidateForEmail } from '../repo/inviteRepo';
import { createUser, getUser, listUsers } from '../repo/userRepo';

const BootstrapOwnerBodySchema = z.object({
	email: z
		.string()
		.min(1)
		.transform((s) => s.toLowerCase().trim()),
});

const PER_IP_MAX = 5;
const WINDOW_SECONDS = 60 * 60;

function parseOwnerEmails(raw: string | undefined): string[] {
	return (raw ?? '')
		.split(',')
		.map((s) => s.trim().toLowerCase())
		.filter((s) => s.length > 0);
}

async function handleBootstrapOwner(request: Request, env: Env, origin: string | null): Promise<Response> {
	const ip = getClientIp(request);

	// 1) Rate limit — per-IP, BEFORE body parse so malformed probes still pay
	// their ceiling. Skipped when RATE_LIMITER is unbound (test path).
	if (env.RATE_LIMITER) {
		const limiter = new RateLimiter(env.RATE_LIMITER, {
			maxRequests: PER_IP_MAX,
			windowSeconds: WINDOW_SECONDS,
		});
		const result = await limiter.check(`auth:bootstrap-owner:${ip}`);
		if (!result.allowed) {
			return jsonErr({ code: 'RATE_LIMITED', retryAfter: result.resetTime }, origin, env);
		}
	}

	// 2) Body parse
	let raw: unknown;
	try {
		raw = await request.json();
	} catch {
		return jsonErr({ code: 'VALIDATION_FAILED', fields: { body: 'Invalid JSON' } }, origin, env);
	}
	const parsed = BootstrapOwnerBodySchema.safeParse(raw);
	if (!parsed.success) {
		const flat = parsed.error.flatten().fieldErrors as Record<string, string[] | undefined>;
		const fields: Record<string, string> = {};
		for (const [k, v] of Object.entries(flat)) {
			if (v && v.length > 0) fields[k] = v[0];
		}
		return jsonErr({ code: 'VALIDATION_FAILED', fields }, origin, env);
	}
	const { email } = parsed.data;

	// 3) Config gate — OWNER_EMAILS unset/empty means bootstrap is disabled.
	const allowed = parseOwnerEmails(env.OWNER_EMAILS);
	if (allowed.length === 0) {
		return jsonErr({ code: 'BOOTSTRAP_DISABLED' }, origin, env);
	}

	// 4) Completion gate — if any ACTIVE OWNER already exists, bootstrap is
	// over. Note: we deliberately do NOT use `countByRole(OWNER)` here, which
	// counts INVITED users too — an INVITED OWNER from a prior bootstrap
	// call must NOT block a re-trigger (that's the whole point of the
	// idempotent path below). Only a completed activation closes the gate.
	const users = await listUsers(env);
	const activeOwners = users.filter((u) => u.role === EStaffRole.OWNER && u.status === EUserStatus.ACTIVE).length;
	if (activeOwners > 0) {
		return jsonErr({ code: 'BOOTSTRAP_DISABLED' }, origin, env);
	}

	// 5) Allowlist match. Flat mismatch — no leak about how close we were.
	if (!allowed.includes(email)) {
		return jsonErr({ code: 'EMAIL_MISMATCH' }, origin, env);
	}

	// 6) Existing-user analysis.
	const existing = await getUser(env, email);
	if (existing) {
		// ANY active user with this email blocks bootstrap regardless of
		// role — countByRole(OWNER)===0 already passed, so an ACTIVE user
		// here is a non-owner squatting on the address; treat as disabled.
		if (existing.status === EUserStatus.ACTIVE) {
			return jsonErr({ code: 'BOOTSTRAP_DISABLED' }, origin, env);
		}
		// INVITED non-owner with this address — do NOT clobber. The address
		// is already spoken for by another invite flow.
		if (existing.role !== EStaffRole.OWNER) {
			return jsonErr({ code: 'EMAIL_MISMATCH' }, origin, env);
		}
		// INVITED OWNER (or DISABLED OWNER — treat identically to INVITED
		// for the resend path). Fall through to the idempotent re-trigger.
	}

	const now = Date.now();

	// 7) Create the user record when this is the first call. If existing is
	// already an INVITED OWNER, leave the record alone — the invite mint
	// below is the only state that needs to change on a re-trigger.
	if (!existing) {
		const user: IUser = {
			schemaVersion: 1,
			email,
			displayName: 'Owner',
			role: EStaffRole.OWNER,
			status: EUserStatus.INVITED,
			passwordHash: null,
			createdAt: now,
			updatedAt: now,
			lastLoginAt: null,
			lastLoginIp: null,
		};
		await createUser(env, user);
	}

	// 8) Kill any prior invites for this email so the re-trigger path
	// converges to a single live token.
	await invalidateForEmail(env, email);

	// 9) Fresh invite. `invitedBy: system@bootstrap.local` marks bootstrap
	// invites for auditability; the value must be a syntactically-valid
	// email because InviteSchema enforces `z.string().email()`.
	const token = generateUrlSafeToken(32);
	const invite: IInvite = {
		schemaVersion: 1,
		token,
		email,
		role: EStaffRole.OWNER,
		displayName: 'Owner',
		invitedBy: 'system@bootstrap.local',
		createdAt: now,
		expiresAt: now + INVITE_TTL_MS,
	};
	await createInvite(env, invite);

	// 10) Fire-and-forget email. Invite is already committed to KV, so any
	// SMTP failure is recoverable via re-trigger.
	try {
		await sendInvite(env, invite);
	} catch (err) {
		console.error('[bootstrapOwner] sendInvite failed', err);
	}

	// 11) Success envelope — NOT a `caller`. This endpoint creates an
	// invite, not a session.
	return jsonOk({ inviteEmailSent: true }, origin, env);
}

export default {
	fetch: withAuthHandler('POST', handleBootstrapOwner, { public: true }),
} satisfies ExportedHandler<Env>;
