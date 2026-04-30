export interface RateLimiterOptions {
	/** Maximum number of requests allowed within the window */
	maxRequests: number;
	/** Time window in seconds */
	windowSeconds: number;
}

export interface RateLimiterResult {
	allowed: boolean;
	remaining: number;
	resetTime: number;
}

export class RateLimiter {
	private kv: KVNamespace;
	private options: RateLimiterOptions;

	constructor(kv: KVNamespace, options: RateLimiterOptions) {
		this.kv = kv;
		this.options = options;
	}

	/**
	 * Check if a request from the given key (e.g., IP) is allowed
	 */
	async check(key: string): Promise<RateLimiterResult> {
		const now = Math.floor(Date.now() / 1000);
		const windowStart = Math.floor(now / this.options.windowSeconds) * this.options.windowSeconds;
		const resetTime = windowStart + this.options.windowSeconds;
		const kvKey = `rate_limit:${key}:${windowStart}`;

		// Get current count from KV
		const currentCountStr = await this.kv.get(kvKey);
		const currentCount = currentCountStr ? parseInt(currentCountStr, 10) : 0;

		if (currentCount >= this.options.maxRequests) {
			return {
				allowed: false,
				remaining: 0,
				resetTime,
			};
		}

		// Increment count
		const newCount = currentCount + 1;
		await this.kv.put(kvKey, newCount.toString(), {
			expiration: resetTime + 60, // Expire shortly after window ends
		});

		return {
			allowed: true,
			remaining: Math.max(0, this.options.maxRequests - newCount),
			resetTime,
		};
	}
}

export default RateLimiter;
