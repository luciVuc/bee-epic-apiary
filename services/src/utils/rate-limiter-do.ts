import { DurableObject } from 'cloudflare:workers';

interface IRateLimitEntry {
	count: number;
	resetAt: number;
}

export interface IRateLimitStorage {
	get<T = unknown>(key: string): Promise<T | undefined>;
	put(key: string, value: unknown, options?: { expirationTtl?: number }): Promise<void>;
}

/**
 * Pure logic for `RateLimiterDO.check()` — extracted so it can be unit-tested against a
 * fake storage without needing a real `DurableObject` runtime. The DO itself stays a
 * thin shell that forwards to this function inside `blockConcurrencyWhile`.
 *
 * Counts are persisted in `state.storage`; the in-memory `Map` of the previous
 * implementation was lost on every isolate eviction (review I1).
 */
export async function checkRateLimit(
	storage: IRateLimitStorage,
	key: string,
	maxRequests: number,
	windowSeconds: number,
): Promise<{ allowed: boolean; remaining: number; resetTime: number }> {
	const now = Math.floor(Date.now() / 1000);
	const storageKey = `rl:${key}`;
	const entry = await storage.get<IRateLimitEntry>(storageKey);

	if (!entry || now >= entry.resetAt) {
		const next: IRateLimitEntry = { count: 1, resetAt: now + windowSeconds };
		await storage.put(storageKey, next, { expirationTtl: windowSeconds + 5 });
		return { allowed: true, remaining: maxRequests - 1, resetTime: next.resetAt };
	}

	if (entry.count >= maxRequests) {
		return { allowed: false, remaining: 0, resetTime: entry.resetAt };
	}

	const updated: IRateLimitEntry = { count: entry.count + 1, resetAt: entry.resetAt };
	await storage.put(storageKey, updated, { expirationTtl: windowSeconds + 5 });
	return { allowed: true, remaining: maxRequests - updated.count, resetTime: entry.resetAt };
}

export class RateLimiterDO extends DurableObject {
	private state: DurableObjectState;

	constructor(state: DurableObjectState, env: Env) {
		super(state, env);
		this.state = state;
	}

	async check(
		key: string,
		maxRequests: number,
		windowSeconds: number,
	): Promise<{ allowed: boolean; remaining: number; resetTime: number }> {
		return this.state.blockConcurrencyWhile(() =>
			checkRateLimit(this.state.storage as unknown as IRateLimitStorage, key, maxRequests, windowSeconds),
		);
	}
}
