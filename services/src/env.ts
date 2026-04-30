import { config } from 'dotenv';

config();

function requireEnv(name: string): string {
	const value = process.env[name];
	if (!value) {
		throw new Error(`Missing required environment variable: ${name}`);
	}
	return value;
}

export default {
	STRIPE_SECRET_KEY: requireEnv('STRIPE_SECRET_KEY'),
	ALLOWED_ORIGINS: requireEnv('ALLOWED_ORIGINS'),
} satisfies Env;
