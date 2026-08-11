/**
 * Send the invitation email. Called by /users/invite and /users/:email/reinvite.
 *
 * Design contract — the caller MUST have already persisted the invite record
 * before calling this. We deliberately swallow (and log) send errors rather
 * than throwing:
 *
 *  - An invite that lands in KV but fails to email is RECOVERABLE — the OWNER
 *    can trigger /reinvite to resend without duplicating state.
 *  - A rejected email that ALSO rolls back the invite record is NOT
 *    recoverable — the token is gone, the invitee sees nothing, and the
 *    OWNER has no signal to re-issue.
 *
 * So: fail-log-not-throw. Look at `wrangler tail` (or the logs backend) if
 * the invitee reports never receiving the email.
 *
 * Only-HTML body — Cloudflare's `IEmailBodyType` is `{ type, content }`
 * with no multipart field. When Cloudflare adds `alt`/`plain` support (or we
 * migrate to a MIME builder), this file grows a text/plain sibling. Until
 * then, the plain-text fallback lives as an HTML comment inside the body
 * so the intent survives a future migration.
 */
import { authFromAddress, type TAuthEmailKind } from './from';
import { escapeHtml, renderGreeting } from './greeting';
import type { IInvite } from '@bee-epic/shared';
import type { IEmailMessageBuilder } from '../../types';

// Template-specific constants grouped at the top so the copy-diff to
// sendReset / sendPasswordChanged is a small, obvious edit.
const LOG_PREFIX = '[emails/sendInvite]';
const SUBJECT = "You've been invited to the Bee Epic admin";
const FROM_KIND: TAuthEmailKind = 'invite';
const PATH = '/accept-invite';

/**
 * Build the HTML body. Kept as a separate function partly for readability,
 * partly so the sibling `sendReset` / `sendPasswordChanged` senders can copy
 * the same structural template without cross-importing anything template-y.
 */
function renderHtml(link: string, invite: IInvite): string {
	const greeting = renderGreeting(invite.displayName);
	const role = escapeHtml(invite.role);
	const invitedBy = escapeHtml(invite.invitedBy);
	// The plain-text fallback lives as an HTML comment for now — see the
	// module docblock. When Cloudflare's SendEmail gains a multipart shape
	// this comment moves into a `body.plain` (or equivalent) field. The
	// values embedded here are ALSO HTML-escaped even though they live inside
	// a comment — a stray `-->` in user input would otherwise close the
	// comment early and let raw `<script>` reach the DOM of an HTML preview.
	const plainTextFallback = [
		greeting,
		'',
		`You've been invited to the Bee Epic Apiary admin panel as ${role} by ${invitedBy}.`,
		'',
		'Set your password to activate your account:',
		link,
		'',
		'This link is valid for 7 days and can only be used once.',
		'',
		"If you didn't expect this invite, ignore this email.",
	].join('\n');
	return [
		`<p>${greeting}</p>`,
		`<p>You've been invited to the Bee Epic Apiary admin panel as <strong>${role}</strong> by ${invitedBy}.</p>`,
		'<p>Click the link below to set your password and activate your account. This link is valid for 7 days and can only be used once.</p>',
		`<p><a href="${link}">${link}</a></p>`,
		"<p>If you didn't expect this invite, ignore this email — no action is required.</p>",
		`<!-- plain-text fallback:\n${plainTextFallback}\n-->`,
	].join('\n');
}

/**
 * Send the invite email. Returns void. Errors are LOGGED not THROWN — see
 * module docblock for why.
 */
export async function sendInvite(env: Env, invite: IInvite): Promise<void> {
	const link = `${env.ADMIN_BASE_URL}${PATH}?token=${encodeURIComponent(invite.token)}`;
	const htmlBody = renderHtml(link, invite);

	const payload: IEmailMessageBuilder = {
		from: authFromAddress(env, FROM_KIND),
		to: invite.email,
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
