/**
 * Send the password-reset email. Called by /auth/request-reset.
 *
 * Send errors are LOGGED, NOT THROWN — a reset record that lands in KV
 * but fails to email is recoverable (the user can request another reset).
 * Throwing would bubble up as a 500 and leak the fact that a reset was
 * actually created (i.e. that the email exists), defeating the
 * request-reset endpoint's always-200-no-enumeration guarantee.
 *
 * Only-HTML body — Cloudflare's `IEmailBodyType` is `{ type, content }`
 * with no multipart field. When Cloudflare adds `alt`/`plain` support (or we
 * migrate to a MIME builder), this file grows a text/plain sibling. Until
 * then, the plain-text fallback lives as an HTML comment inside the body
 * so the intent survives a future migration.
 */
import { authFromAddress, type TAuthEmailKind } from './from';
import { renderGreeting } from './greeting';
import type { IPasswordReset } from '@bee-epic/shared';
import type { IEmailMessageBuilder } from '../../types';

// Template-specific constants grouped at the top so the copy-diff to
// sendInvite / sendPasswordChanged is a small, obvious edit.
const LOG_PREFIX = '[emails/sendReset]';
const SUBJECT = 'Reset your Bee Epic admin password';
const FROM_KIND: TAuthEmailKind = 'reset';
const PATH = '/reset';

/**
 * Build the HTML body. Reset emails have NO displayName field to greet with,
 * so the greeting is ALWAYS the bare `renderGreeting(undefined)` — "Hi,".
 * Deliberately no optional name parameter — accepting one would surface
 * user-controlled data in an email that must be safe to send to any address.
 */
function renderHtml(link: string): string {
	const greeting = renderGreeting(undefined);
	// The plain-text fallback lives as an HTML comment for now — see the
	// module docblock. When Cloudflare's SendEmail gains a multipart shape
	// this comment moves into a `body.plain` (or equivalent) field.
	const plainTextFallback = [
		greeting,
		'',
		'We received a request to reset your Bee Epic Apiary admin password.',
		'',
		'Set a new password (valid for 1 hour, single-use):',
		link,
		'',
		"If you didn't request this, ignore this email — no changes will be made.",
	].join('\n');
	return [
		`<p>${greeting}</p>`,
		'<p>We received a request to reset your Bee Epic Apiary admin password.</p>',
		'<p>Click the link below to set a new password. This link is valid for 1 hour and can only be used once.</p>',
		`<p><a href="${link}">Set a new password</a></p>`,
		"<p>If you didn't request this, ignore this email — no changes will be made to your account.</p>",
		`<!-- plain-text fallback:\n${plainTextFallback}\n-->`,
	].join('\n');
}

/**
 * Send the password-reset email. Returns void. Errors are LOGGED not THROWN —
 * see module docblock for why.
 */
export async function sendReset(env: Env, reset: IPasswordReset): Promise<void> {
	const link = `${env.ADMIN_BASE_URL}${PATH}?token=${encodeURIComponent(reset.token)}`;
	const htmlBody = renderHtml(link);

	const payload: IEmailMessageBuilder = {
		from: authFromAddress(env, FROM_KIND),
		to: reset.email,
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
