/**
 * Declaration merge extending the auto-generated Env (from wrangler types)
 * with Phase 9 secrets/vars that are referenced from src/ but not yet emitted
 * into worker-configuration.d.ts. Re-run `wrangler types` after wrangler.jsonc
 * is updated and this file can be trimmed.
 */
declare interface __BaseEnv_Env {
	/** Comma-separated list of owner email addresses (bootstrap safety net) */
	OWNER_EMAILS?: string;
	/** "development" in local dev; "production" otherwise */
	ENVIRONMENT?: string;
}
