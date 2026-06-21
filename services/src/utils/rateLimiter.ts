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

	constructor(doNamespace: DurableObjectNamespace, options: IRateLimiterOptions) {
		this.doNamespace = doNamespace;
		this.options = options;
	}

	async check(key: string): Promise<IRateLimiterResult> {
		const stub = this.doNamespace.getByName('default');
		try {
			const result = await stub.check(key, this.options.maxRequests, this.options.windowSeconds);
			return result;
		} catch {
			return { allowed: true, remaining: this.options.maxRequests, resetTime: Math.floor(Date.now() / 1000) + this.options.windowSeconds };
		}
	}
}

export default RateLimiter;
