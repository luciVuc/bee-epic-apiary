/**
 * Send the "your password was changed" notification email. Called by
 * /auth/accept-invite, /auth/complete-reset, and /auth/change-password
 * AFTER the password change has been persisted, and only when
 * env-loaded policy has notifyOnPasswordChange === true (callers check;
 * this function does NOT).
 *
 * Send errors are LOGGED, NOT THROWN — a notification failure must not
 * roll back the password change itself. The password change is the
 * source of truth; this email is a courtesy signal so the account owner
 * can react if the change wasn't theirs.
 *
 * NO action link. A legitimate change needs no action; an ILLEGITIMATE
 * change wants the user to lock the account back down. The escape-hatch
 * URL rendered in the body points at `/request-reset` — the raw URL is
 * shown as anchor text (not a friendly label like sendReset uses) so a
 * user being socially engineered can inspect the domain before clicking.
 *
 * Only-HTML body — Cloudflare's `IEmailBodyType` is `{ type, content }`
 * with no multipart field. When Cloudflare adds `alt`/`plain` support (or we
 * migrate to a MIME builder), this file grows a text/plain sibling. Until
 * then, the plain-text fallback lives as an HTML comment inside the body
 * so the intent survives a future migration.
 */
import { authFromAddress, type TAuthEmailKind } from './from';
import { renderGreeting } from './greeting';
import type { IUser } from '@bee-epic/shared';
import type { IEmailMessageBuilder } from '../../types';

// Template-specific constants grouped at the top so the copy-diff to
// sendInvite / sendReset is a small, obvious edit. No PATH constant —
// this notification email has no action link of its own; the reset URL
// is a fixed escape-hatch built inline in sendPasswordChanged().
const LOG_PREFIX = '[emails/sendPasswordChanged]';
const SUBJECT = 'Your Bee Epic admin password was changed';
const FROM_KIND: TAuthEmailKind = 'password-changed';

/**
 * Build the HTML body. Notification-only — the recipient's displayName IS
 * greeted because we know exactly who this account belongs to (unlike
 * sendReset, which must avoid confirming that an email exists). The
 * reset URL is passed in as `resetUrl` (raw text, no token) so a
 * compromised-account owner can request a real reset themselves.
 */
function renderHtml(user: IUser, resetUrl: string): string {
	const greeting = renderGreeting(user.displayName);
	// The plain-text fallback lives as an HTML comment for now — see the
	// module docblock. When Cloudflare's SendEmail gains a multipart shape
	// this comment moves into a `body.plain` (or equivalent) field. The
	// greeting is HTML-escaped even though it sits inside a comment — a
	// stray `-->` in a displayName would otherwise close the comment early
	// and let raw `<script>` reach the DOM of an HTML preview.
	const plainTextFallback = [
		greeting,
		'',
		'Your Bee Epic Apiary admin password was just changed.',
		'',
		'If you made this change, no action is needed.',
		'',
		"If you didn't, secure your account immediately by requesting a reset:",
		resetUrl,
	].join('\n');
	return [
		`<p>${greeting}</p>`,
		'<p>Your Bee Epic Apiary admin password was just changed.</p>',
		'<p>If you made this change, no action is needed.</p>',
		`<p>If you didn't, secure your account immediately: <a href="${resetUrl}">${resetUrl}</a></p>`,
		`<!-- plain-text fallback:\n${plainTextFallback}\n-->`,
	].join('\n');
}

/**
 * Send the password-changed notification email. Returns void. Errors are
 * LOGGED not THROWN — see module docblock for why.
 */
export async function sendPasswordChanged(env: Env, user: IUser): Promise<void> {
	const resetUrl = `${env.ADMIN_BASE_URL}/request-reset`;
	const htmlBody = renderHtml(user, resetUrl);

	const payload: IEmailMessageBuilder = {
		from: authFromAddress(env, FROM_KIND),
		to: user.email,
		subject: SUBJECT,
		body: {
			type: 'html',
			content: htmlBody,
		},
	};

	try {
		await env.EMAIL.send(payload);
	} catch (error) {
		console.error(`${LOG_PREFIX} send failed:`, error);
	}
}
