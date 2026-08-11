export interface IRateLimiterOptions {
	maxRequests: number;
	windowSeconds: number;
}

export interface IRateLimiterResult {
	allowed: boolean;
	remaining: number;
	resetTime: number;
}

export class RateLimiter {
	private doNamespace: DurableObjectNamespace<import('./rate-limiter-do').RateLimiterDO>;
	private options: IRateLimiterOptions;

	constructor(doNamespace: DurableObjectNamespace<import('./rate-limiter-do').RateLimiterDO>, options: IRateLimiterOptions) {
		this.doNamespace = doNamespace;
		this.options = options;
	}

	async check(key: string): Promise<IRateLimiterResult> {
		const stub = this.doNamespace.getByName('default');
		try {
			const result = await stub.check(key, this.options.maxRequests, this.options.windowSeconds);
			return result;
		} catch (err) {
			// Fail-open preserves availability when the DO is unreachable, but the error
			// must reach observability — without this log, a degraded rate limiter is
			// invisible to monitoring (review I2).
			console.error('rate-limiter DO unreachable; failing open', { err: String(err), key });
			return { allowed: true, remaining: this.options.maxRequests, resetTime: Math.floor(Date.now() / 1000) + this.options.windowSeconds };
		}
	}
}

export default RateLimiter;
