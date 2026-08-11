/**
 * POST /users/invite — OWNER-only invitation flow.
 *
 * Mints an INVITED user record + a fresh invite token and fires off the
 * invitation email. The invitee later completes the flow by posting the
 * token to /auth/accept-invite, which flips the user to ACTIVE and issues
 * session cookies. This is the sibling of /auth/bootstrap-owner (which
 * mints the FIRST OWNER via a config-gated allowlist); once an OWNER
 * exists, every subsequent user comes through here.
 *
 * Design notes:
 *   - Create-user-BEFORE-invite ordering (matches bootstrapOwner). The
 *     user record is the source of truth for "this email is spoken for";
 *     writing it first means a mid-flow crash between the two writes
 *     leaves an INVITED user with no live invite — which is EXACTLY the
 *     state Task 8.5 (/users/:email/reinvite) is designed to recover
 *     from. The reverse ordering would leak a stale invite record whose
 *     `email` collides with nothing, invisible to admin tools.
 *   - `displayName` defaults to the email local-part when omitted. The
 *     admin UI's invite form makes displayName optional (some OWNERs
 *     just want to send an invite fast), and `alice@example.com → 'alice'`
 *     is a passable placeholder the invitee can edit post-activation.
 *     A hard-coded "New User" default would look identical for every
 *     invitee in the roster list until first login.
 *   - `sendInvite` failure is fire-and-forget: the invite record is
 *     already committed to KV, so an SMTP failure is recoverable via a
 *     Task 8.5 reinvite. Bubbling the error would leave the OWNER
 *     staring at a 500 while the invite already exists, and any manual
 *     retry would then hit USER_EXISTS. Log-and-succeed matches the
 *     bootstrapOwner / completeReset pattern.
 *   - 201 Created — a new user resource was created (INVITED status
 *     counts). `jsonOk` defaults to 200; we use `jsonResponse` directly
 *     to override the status while keeping the `{ok, data}` envelope
 *     shape the SPA expects.
 *   - Rate-limit is PER-CALLER (bucket key = `users:invite:<owner-email>`),
 *     not per-target. Threat model: a compromised OWNER account
 *     enumerating or squatting on emails at scale — 30/hr per OWNER
 *     keeps a human-driven invite flow unbottlenecked while shutting
 *     down a scripted abuse path. Per-target keying would let one
 *     malicious OWNER hammer a single unlucky email; per-caller keys
 *     the abuse to the compromised account itself.
 *   - `inviteSent: true` is reported unconditionally on the 201 path
 *     (including when `env.EMAIL` is unbound or `sendInvite` threw).
 *     We cannot know delivery status from a fire-and-forget send — the
 *     flag reports "we attempted to send", not "the invitee will
 *     receive it". Downstream systems (logs, Task 8.5 reinvite) are
 *     where actual delivery is diagnosed.
 */
import { z } from 'zod';
import { EStaffRole, EUserStatus, INVITE_TTL_MS, StaffRoleSchema, toUserPublic, type IInvite, type IUser } from '@bee-epic/shared';
import { jsonErr, jsonResponse, RateLimiter, withAuthHandler } from '../../utils';
import type { ICaller } from '../../utils/resolveCaller';
import { generateUrlSafeToken } from '../crypto/tokens';
import { sendInvite } from '../emails/sendInvite';
import { createInvite } from '../repo/inviteRepo';
import { createUser, getUser } from '../repo/userRepo';

const InviteBodySchema = z.object({
	email: z
		.string()
		.min(1)
		.transform((s) => s.toLowerCase().trim()),
	role: StaffRoleSchema,
	displayName: z.string().min(1).max(120).optional(),
});

const PER_OWNER_MAX = 30;
const WINDOW_SECONDS = 60 * 60;

async function handleInviteUser(request: Request, env: Env, origin: string | null, caller?: ICaller): Promise<Response> {
	// Belt-and-braces — the wrapper's requiredRole:OWNER path already 401s
	// anonymous callers, but a static guard keeps the handler safe if the
	// wrapper is ever refactored.
	if (!caller) return jsonErr({ code: 'UNAUTHORIZED' }, origin, env);

	// 1) Rate limit — per-caller, BEFORE body parse so malformed probes
	// still pay their ceiling. Skipped when RATE_LIMITER is unbound (test
	// path).
	if (env.RATE_LIMITER) {
		const limiter = new RateLimiter(env.RATE_LIMITER, {
			maxRequests: PER_OWNER_MAX,
			windowSeconds: WINDOW_SECONDS,
		});
		const result = await limiter.check(`users:invite:${caller.email.toLowerCase()}`);
		if (!result.allowed) {
			return jsonErr({ code: 'RATE_LIMITED', retryAfter: result.resetTime }, origin, env);
		}
	}

	// 2) Body parse.
	let raw: unknown;
	try {
		raw = await request.json();
	} catch {
		return jsonErr({ code: 'VALIDATION_FAILED', fields: { body: 'Invalid JSON' } }, origin, env);
	}
	const parsed = InviteBodySchema.safeParse(raw);
	if (!parsed.success) {
		const flat = parsed.error.flatten().fieldErrors as Record<string, string[] | undefined>;
		const fields: Record<string, string> = {};
		for (const [k, v] of Object.entries(flat)) {
			if (v && v.length > 0) fields[k] = v[0];
		}
		return jsonErr({ code: 'VALIDATION_FAILED', fields }, origin, env);
	}
	const { email, role, displayName } = parsed.data;

	// 3) Duplicate detection. Re-inviting an existing INVITED user is
	// Task 8.5's job; here, any existing record collapses to USER_EXISTS.
	const existing = await getUser(env, email);
	if (existing) {
		return jsonErr({ code: 'USER_EXISTS' }, origin, env);
	}

	const now = Date.now();

	// 4) Create the user first (see module header for ordering rationale).
	const user: IUser = {
		schemaVersion: 1,
		email,
		displayName: displayName ?? email.split('@')[0],
		role,
		status: EUserStatus.INVITED,
		passwordHash: null,
		createdAt: now,
		updatedAt: now,
		lastLoginAt: null,
		lastLoginIp: null,
	};
	await createUser(env, user);

	// 5) Mint the invite. `invitedBy` is the OWNER's email (from the
	// wrapper's resolved caller) — this differentiates /users/invite
	// invites from bootstrap invites in the audit trail.
	const invite: IInvite = {
		schemaVersion: 1,
		token: generateUrlSafeToken(32),
		email,
		role,
		displayName: user.displayName,
		invitedBy: caller.email,
		createdAt: now,
		expiresAt: now + INVITE_TTL_MS,
	};
	await createInvite(env, invite);

	// 6) Fire-and-forget the email. Errors are logged, not bubbled — see
	// module header. `env.EMAIL` may be unbound in test envs; skip the
	// send call entirely rather than crashing on a missing binding.
	try {
		if (env.EMAIL) await sendInvite(env, invite);
	} catch (err) {
		console.error('[inviteUser] sendInvite failed', err);
	}

	// 7) 201 Created with the public user shape (passwordHash stripped by
	// `toUserPublic`) and an attempt-report `inviteSent` flag.
	return jsonResponse({ ok: true, data: { user: toUserPublic(user), inviteSent: true } }, 201, origin, env);
}

export default {
	fetch: withAuthHandler('POST', handleInviteUser, { requiredRole: EStaffRole.OWNER }),
} satisfies ExportedHandler<Env>;
