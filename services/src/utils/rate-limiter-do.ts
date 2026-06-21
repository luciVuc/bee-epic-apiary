import { DurableObject } from 'cloudflare:workers';

interface IRateLimitEntry {
	count: number;
	resetAt: number;
}

export class RateLimiterDO extends DurableObject {
	private state: DurableObjectState;
	private counts = new Map<string, IRateLimitEntry>();

	constructor(state: DurableObjectState, env: Env) {
		super(state, env);
		this.state = state;
	}

	async check(
		key: string,
		maxRequests: number,
		windowSeconds: number,
	): Promise<{ allowed: boolean; remaining: number; resetTime: number }> {
		const now = Date.now() / 1000;
		const entry = this.counts.get(key);

		if (!entry || now >= entry.resetAt) {
			const resetTime = Math.floor(now + windowSeconds);
			this.counts.set(key, { count: 1, resetAt: resetTime });
			return { allowed: true, remaining: maxRequests - 1, resetTime };
		}

		if (entry.count >= maxRequests) {
			return { allowed: false, remaining: 0, resetTime: Math.ceil(entry.resetAt) };
		}

		entry.count++;
		return { allowed: true, remaining: maxRequests - entry.count, resetTime: Math.ceil(entry.resetAt) };
	}
}
