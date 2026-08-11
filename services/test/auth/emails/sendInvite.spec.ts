import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { sendInvite } from '../../../src/auth/emails/sendInvite';
import type { IInvite } from '@bee-epic/shared';
import { EStaffRole } from '@bee-epic/shared';
import type { IEmailMessageBuilder } from '../../../src/types';

/**
 * Build a minimal `Env` for these tests. `sendInvite` reads `ADMIN_BASE_URL`
 * (for the accept-invite link), `AUTH_FROM_ADDRESS` (via `authFromAddress`),
 * and `EMAIL.send`. Everything else is squeezed through `unknown` casts.
 */
function makeEnv(
	overrides: {
		ADMIN_BASE_URL?: string;
		AUTH_FROM_ADDRESS?: string;
		emailSend?: ReturnType<typeof vi.fn>;
	} = {},
): { env: Env; emailSend: ReturnType<typeof vi.fn> } {
	const emailSend = overrides.emailSend ?? vi.fn().mockResolvedValue(undefined);
	const env = {
		ADMIN_BASE_URL: overrides.ADMIN_BASE_URL ?? 'https://admin.example.com',
		AUTH_FROM_ADDRESS: overrides.AUTH_FROM_ADDRESS ?? 'admin@example.com',
		EMAIL: { send: emailSend },
	} as unknown as Env;
	return { env, emailSend };
}

/** Build a baseline valid invite. Individual tests override fields as needed. */
function makeInvite(overrides: Partial<IInvite> = {}): IInvite {
	return {
		schemaVersion: 1,
		token: 'test-token-abc123',
		email: 'newuser@example.com',
		role: EStaffRole.EMPLOYEE,
		displayName: 'New User',
		invitedBy: 'owner@example.com',
		createdAt: 1_700_000_000_000,
		expiresAt: 1_700_604_800_000,
		...overrides,
	};
}

describe('sendInvite', () => {
	let errorSpy: ReturnType<typeof vi.spyOn>;

	beforeEach(() => {
		errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
	});

	afterEach(() => {
		errorSpy.mockRestore();
	});

	it('sends via env.EMAIL.send exactly once with correct to', async () => {
		const { env, emailSend } = makeEnv();
		const invite = makeInvite({ email: 'target@example.com' });

		await sendInvite(env, invite);

		expect(emailSend).toHaveBeenCalledTimes(1);
		const payload = emailSend.mock.calls[0][0] as IEmailMessageBuilder;
		expect(payload.to).toBe('target@example.com');
	});

	it('uses authFromAddress("invite") for the from field', async () => {
		const { env, emailSend } = makeEnv({ AUTH_FROM_ADDRESS: 'admin@example.com' });
		const invite = makeInvite();

		await sendInvite(env, invite);

		const payload = emailSend.mock.calls[0][0] as IEmailMessageBuilder;
		const from = payload.from as { email: string; name: string };
		expect(from.email).toBe('admin@example.com');
		expect(from.name).toContain('Invitation');
	});

	it('uses the exact spec subject line', async () => {
		const { env, emailSend } = makeEnv();
		const invite = makeInvite();

		await sendInvite(env, invite);

		const payload = emailSend.mock.calls[0][0] as IEmailMessageBuilder;
		expect(payload.subject).toBe("You've been invited to the Bee Epic admin");
	});

	it('body includes accept-invite URL built from ADMIN_BASE_URL with URL-encoded token', async () => {
		const { env, emailSend } = makeEnv({ ADMIN_BASE_URL: 'https://admin.example.com' });
		// Pick a token containing a URL-unsafe character to prove encodeURIComponent is applied.
		const invite = makeInvite({ token: 'abc+def/xyz=' });

		await sendInvite(env, invite);

		const payload = emailSend.mock.calls[0][0] as IEmailMessageBuilder;
		const body = payload.body as { type: string; content: string };
		const expectedLink = `https://admin.example.com/accept-invite?token=${encodeURIComponent('abc+def/xyz=')}`;
		expect(body.content).toContain(expectedLink);
		// And prove the raw un-encoded token is NOT in the URL (would break the link).
		expect(body.content).not.toContain('?token=abc+def/xyz=');
	});

	it('HTML-escapes displayName, invitedBy, and role to prevent injection', async () => {
		const { env, emailSend } = makeEnv();
		const invite = makeInvite({
			displayName: '<script>alert(1)</script>',
			invitedBy: 'evil"@example.com',
			role: '<img src=x>' as unknown as EStaffRole,
		});

		await sendInvite(env, invite);

		const payload = emailSend.mock.calls[0][0] as IEmailMessageBuilder;
		const body = payload.body as { type: string; content: string };
		expect(body.content).not.toContain('<script>alert(1)</script>');
		expect(body.content).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
		expect(body.content).not.toContain('evil"@example.com');
		expect(body.content).toContain('evil&quot;@example.com');
		expect(body.content).not.toContain('<img src=x>');
		expect(body.content).toContain('&lt;img src=x&gt;');
	});

	it('omits displayName from greeting when invite.displayName is undefined', async () => {
		const { env, emailSend } = makeEnv();
		const invite = makeInvite({ displayName: undefined });

		await sendInvite(env, invite);

		const payload = emailSend.mock.calls[0][0] as IEmailMessageBuilder;
		const body = payload.body as { type: string; content: string };
		// Match the structural greeting paragraph — the bare "Hi," inside the
		// HTML-comment plain-text fallback must NOT be able to satisfy this.
		expect(body.content).toContain('<p>Hi,</p>');
		// And nothing like "Hi ," (bare space before comma) should appear.
		expect(body.content).not.toContain('Hi ,');
	});

	it('does not throw when env.EMAIL.send rejects; logs [emails/sendInvite]', async () => {
		const failingSend = vi.fn().mockRejectedValue(new Error('SMTP down'));
		const { env } = makeEnv({ emailSend: failingSend });
		const invite = makeInvite();

		await expect(sendInvite(env, invite)).resolves.toBeUndefined();

		expect(errorSpy).toHaveBeenCalled();
		const firstArg = String(errorSpy.mock.calls[0][0]);
		expect(firstArg).toContain('[emails/sendInvite]');
	});

	it('does not log an error when env.EMAIL.send resolves normally', async () => {
		const { env, emailSend } = makeEnv();
		const invite = makeInvite();

		await sendInvite(env, invite);

		expect(emailSend).toHaveBeenCalledTimes(1);
		expect(errorSpy).not.toHaveBeenCalled();
	});
});
