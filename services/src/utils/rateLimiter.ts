/**
 * Options for configuring the RateLimiter
 */
export interface RateLimiterOptions {
	/** Maximum number of requests allowed within the window */
	maxRequests: number;
	/** Time window in seconds */
	windowSeconds: number;
}

/**
 * Result of a rate limit check
 */
export interface RateLimiterResult {
	/** Whether the request is allowed */
	allowed: boolean;
	/** Number of requests remaining in the current window */
	remaining: number;
	/** Unix timestamp (seconds) when the rate limit window resets */
	resetTime: number;
}

/**
 * KV-based rate limiter for Cloudflare Workers.
 * Tracks request counts using Cloudflare KV storage with automatic expiration.
 *
 * @example
 * const rateLimiter = new RateLimiter(env.RATE_LIMIT_KV, {
 *   maxRequests: 100,
 *   windowSeconds: 60
 * });
 * const result = await rateLimiter.check('192.168.1.1:POST');
 * if (!result.allowed) {
 *   // Return 429 Too Many Requests
 * }
 */
export class RateLimiter {
	private kv: KVNamespace;
	private options: RateLimiterOptions;

	/**
	 * Creates a new RateLimiter instance
	 *
	 * @param {KVNamespace} kv - Cloudflare KV namespace for storing request counts
	 * @param {RateLimiterOptions} options - Configuration options for rate limiting
	 */
	constructor(kv: KVNamespace, options: RateLimiterOptions) {
		this.kv = kv;
		this.options = options;
	}

	/**
	 * Check if a request from the given key is allowed under the rate limit.
	 * Increments the request count for the key in the current time window.
	 *
	 * @param {string} key - Unique identifier for the request (e.g., "IP:method" or "user123")
	 * @returns {Promise<RateLimiterResult>} Object containing allowed status, remaining requests, and reset time
	 *
	 * @example
	 * const result = await rateLimiter.check('192.168.1.1:POST');
	 * if (result.allowed) {
	 *   // Process request
	 *   console.log(`Requests remaining: ${result.remaining}`);
	 * } else {
	 *   // Reject with 429
	 *   console.log(`Rate limit resets at: ${result.resetTime}`);
	 * }
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
