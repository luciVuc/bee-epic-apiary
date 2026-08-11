import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { sendPasswordChanged } from '../../../src/auth/emails/sendPasswordChanged';
import { EStaffRole, EUserStatus, type IUser } from '@bee-epic/shared';
import type { IEmailMessageBuilder } from '../../../src/types';

/**
 * Build a minimal `Env` for these tests. `sendPasswordChanged` reads
 * `ADMIN_BASE_URL` (for the request-reset escape-hatch link),
 * `AUTH_FROM_ADDRESS` (via `authFromAddress`), and `EMAIL.send`. Everything
 * else is squeezed through `unknown` casts.
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

/** Build a baseline valid user. Individual tests override fields. */
function makeUser(overrides?: Partial<IUser>): IUser {
	return {
		schemaVersion: 1,
		email: 'user@example.com',
		displayName: 'Alice',
		role: EStaffRole.EMPLOYEE,
		status: EUserStatus.ACTIVE,
		passwordHash: 'pbkdf2$sha256$600000$xxx$yyy',
		createdAt: 1_000_000,
		updatedAt: 1_000_000,
		lastLoginAt: null,
		lastLoginIp: null,
		...overrides,
	};
}

describe('sendPasswordChanged', () => {
	let errorSpy: ReturnType<typeof vi.spyOn>;

	beforeEach(() => {
		errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
	});

	afterEach(() => {
		errorSpy.mockRestore();
	});

	it('sends via env.EMAIL.send exactly once with correct to', async () => {
		const { env, emailSend } = makeEnv();
		const user = makeUser({ email: 'target@example.com' });

		await sendPasswordChanged(env, user);

		expect(emailSend).toHaveBeenCalledTimes(1);
		const payload = emailSend.mock.calls[0][0] as IEmailMessageBuilder;
		expect(payload.to).toBe('target@example.com');
	});

	it('uses authFromAddress("password-changed") for the from field', async () => {
		const { env, emailSend } = makeEnv({ AUTH_FROM_ADDRESS: 'admin@example.com' });
		const user = makeUser();

		await sendPasswordChanged(env, user);

		const payload = emailSend.mock.calls[0][0] as IEmailMessageBuilder;
		const from = payload.from as { email: string; name: string };
		expect(from.email).toBe('admin@example.com');
		expect(from.name).toContain('Security');
	});

	it('uses the exact spec subject line', async () => {
		const { env, emailSend } = makeEnv();
		const user = makeUser();

		await sendPasswordChanged(env, user);

		const payload = emailSend.mock.calls[0][0] as IEmailMessageBuilder;
		expect(payload.subject).toBe('Your Bee Epic admin password was changed');
	});

	it('body includes the request-reset URL built from ADMIN_BASE_URL', async () => {
		const { env, emailSend } = makeEnv({ ADMIN_BASE_URL: 'https://admin.example.com' });
		const user = makeUser();

		await sendPasswordChanged(env, user);

		const payload = emailSend.mock.calls[0][0] as IEmailMessageBuilder;
		const body = payload.body as { type: string; content: string };
		expect(body.content).toContain('https://admin.example.com/request-reset');
	});

	it('greeting uses user.displayName when present', async () => {
		const { env, emailSend } = makeEnv();
		const user = makeUser({ displayName: 'Alice' });

		await sendPasswordChanged(env, user);

		const payload = emailSend.mock.calls[0][0] as IEmailMessageBuilder;
		const body = payload.body as { type: string; content: string };
		expect(body.content).toContain('<p>Hi Alice,</p>');
	});

	it('escapes displayName in the greeting', async () => {
		const { env, emailSend } = makeEnv();
		// Bypass schema — defense-in-depth against a malicious displayName that
		// somehow bypassed the min(1) schema validator upstream.
		const user = makeUser({
			displayName: '<script>alert(1)</script>',
		} as unknown as Partial<IUser>);

		await sendPasswordChanged(env, user);

		const payload = emailSend.mock.calls[0][0] as IEmailMessageBuilder;
		const body = payload.body as { type: string; content: string };
		expect(body.content).toContain('<p>Hi &lt;script&gt;alert(1)&lt;/script&gt;,</p>');
		expect(body.content).not.toContain('<script>alert(1)</script>');
	});

	it('does not throw when env.EMAIL.send rejects; logs [emails/sendPasswordChanged]', async () => {
		const failingSend = vi.fn().mockRejectedValue(new Error('SMTP down'));
		const { env } = makeEnv({ emailSend: failingSend });
		const user = makeUser();

		await expect(sendPasswordChanged(env, user)).resolves.toBeUndefined();

		expect(errorSpy).toHaveBeenCalled();
		const firstArg = String(errorSpy.mock.calls[0][0]);
		expect(firstArg).toContain('[emails/sendPasswordChanged]');
	});

	it('does not log an error when env.EMAIL.send resolves normally', async () => {
		const { env, emailSend } = makeEnv();
		const user = makeUser();

		await sendPasswordChanged(env, user);

		expect(emailSend).toHaveBeenCalledTimes(1);
		expect(errorSpy).not.toHaveBeenCalled();
	});

	it('body does NOT contain the user password hash (defense-in-depth)', async () => {
		const { env, emailSend } = makeEnv();
		const user = makeUser({ passwordHash: 'pbkdf2$sha256$600000$SALT-ABC$HASH-XYZ' });

		await sendPasswordChanged(env, user);

		const payload = emailSend.mock.calls[0][0] as IEmailMessageBuilder;
		const body = payload.body as { type: string; content: string };
		expect(body.content).not.toContain('pbkdf2$sha256$600000$SALT-ABC$HASH-XYZ');
		expect(body.content).not.toContain('SALT-ABC');
		expect(body.content).not.toContain('HASH-XYZ');
	});
});
