import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { sendReset } from '../../../src/auth/emails/sendReset';
import type { IPasswordReset } from '@bee-epic/shared';
import type { IEmailMessageBuilder } from '../../../src/types';

/**
 * Build a minimal `Env` for these tests. `sendReset` reads `ADMIN_BASE_URL`
 * (for the reset link), `AUTH_FROM_ADDRESS` (via `authFromAddress`), and
 * `EMAIL.send`. Everything else is squeezed through `unknown` casts.
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

/** Build a baseline valid password-reset record. Individual tests override fields. */
function makeReset(overrides: Partial<IPasswordReset> = {}): IPasswordReset {
	return {
		schemaVersion: 1,
		token: 'reset-token-abc',
		email: 'user@example.com',
		createdAt: 1_000_000,
		expiresAt: 1_000_000 + 60 * 60 * 1000, // 1 hour
		...overrides,
	};
}

describe('sendReset', () => {
	let errorSpy: ReturnType<typeof vi.spyOn>;

	beforeEach(() => {
		errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
	});

	afterEach(() => {
		errorSpy.mockRestore();
	});

	it('sends via env.EMAIL.send exactly once with correct to', async () => {
		const { env, emailSend } = makeEnv();
		const reset = makeReset({ email: 'target@example.com' });

		await sendReset(env, reset);

		expect(emailSend).toHaveBeenCalledTimes(1);
		const payload = emailSend.mock.calls[0][0] as IEmailMessageBuilder;
		expect(payload.to).toBe('target@example.com');
	});

	it('uses authFromAddress("reset") for the from field', async () => {
		const { env, emailSend } = makeEnv({ AUTH_FROM_ADDRESS: 'admin@example.com' });
		const reset = makeReset();

		await sendReset(env, reset);

		const payload = emailSend.mock.calls[0][0] as IEmailMessageBuilder;
		const from = payload.from as { email: string; name: string };
		expect(from.email).toBe('admin@example.com');
		expect(from.name).toContain('Password Reset');
	});

	it('uses the exact spec subject line', async () => {
		const { env, emailSend } = makeEnv();
		const reset = makeReset();

		await sendReset(env, reset);

		const payload = emailSend.mock.calls[0][0] as IEmailMessageBuilder;
		expect(payload.subject).toBe('Reset your Bee Epic admin password');
	});

	it('body includes reset URL built from ADMIN_BASE_URL with URL-encoded token', async () => {
		const { env, emailSend } = makeEnv({ ADMIN_BASE_URL: 'https://admin.example.com' });
		// Pick a token containing a URL-unsafe character to prove encodeURIComponent is applied.
		const reset = makeReset({ token: 'abc+def/xyz=' });

		await sendReset(env, reset);

		const payload = emailSend.mock.calls[0][0] as IEmailMessageBuilder;
		const body = payload.body as { type: string; content: string };
		const expectedLink = `https://admin.example.com/reset?token=${encodeURIComponent('abc+def/xyz=')}`;
		expect(body.content).toContain(expectedLink);
		// And prove the raw un-encoded token is NOT in the URL (would break the link).
		expect(body.content).not.toContain('?token=abc+def/xyz=');
	});

	it('anchor text is "Set a new password" (descriptive, not the URL)', async () => {
		const { env, emailSend } = makeEnv({ ADMIN_BASE_URL: 'https://admin.example.com' });
		const reset = makeReset({ token: 'plain-token' });

		await sendReset(env, reset);

		const payload = emailSend.mock.calls[0][0] as IEmailMessageBuilder;
		const body = payload.body as { type: string; content: string };
		const expectedLink = `https://admin.example.com/reset?token=${encodeURIComponent('plain-token')}`;
		expect(body.content).toContain(`<a href="${expectedLink}">Set a new password</a>`);
	});

	it('greeting is always "Hi," with no personalization', async () => {
		const { env, emailSend } = makeEnv();
		const reset = makeReset();

		await sendReset(env, reset);

		const payload = emailSend.mock.calls[0][0] as IEmailMessageBuilder;
		const body = payload.body as { type: string; content: string };
		expect(body.content).toContain('<p>Hi,</p>');
		// And nothing like "Hi ," (bare space before comma) should appear.
		expect(body.content).not.toContain('Hi ,');
	});

	it('does not throw when env.EMAIL.send rejects; logs [emails/sendReset]', async () => {
		const failingSend = vi.fn().mockRejectedValue(new Error('SMTP down'));
		const { env } = makeEnv({ emailSend: failingSend });
		const reset = makeReset();

		await expect(sendReset(env, reset)).resolves.toBeUndefined();

		expect(errorSpy).toHaveBeenCalled();
		const firstArg = String(errorSpy.mock.calls[0][0]);
		expect(firstArg).toContain('[emails/sendReset]');
	});

	it('does not log an error when env.EMAIL.send resolves normally', async () => {
		const { env, emailSend } = makeEnv();
		const reset = makeReset();

		await sendReset(env, reset);

		expect(emailSend).toHaveBeenCalledTimes(1);
		expect(errorSpy).not.toHaveBeenCalled();
	});

	it('body mentions "1 hour" duration to match RESET_TTL_MS', async () => {
		const { env, emailSend } = makeEnv();
		const reset = makeReset();

		await sendReset(env, reset);

		const payload = emailSend.mock.calls[0][0] as IEmailMessageBuilder;
		const body = payload.body as { type: string; content: string };
		expect(body.content).toContain('1 hour');
	});
});
