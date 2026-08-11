// Manual Env augmentation for secrets that `wrangler types` does not emit into
// `worker-configuration.d.ts`. Secrets live in `.dev.vars` (local) or are set
// via `wrangler secret put` (prod), so wrangler has no static value to infer a
// type from — it omits them from the generated base env. Declaration-merging
// them onto `Env` here keeps `worker-configuration.d.ts` regenerable while
// giving call sites real types instead of `(env as unknown as { ... })` casts.
//
// AUTH_FROM_ADDRESS: the `From:` on every auth email (invite, reset,
// password-changed). Optional — `authFromAddress` falls back to
// `noreply@<host>` when unset. See `src/auth/emails/from.ts`.
interface Env {
	AUTH_FROM_ADDRESS?: string;
	// JWT_SIGNING_SECRET is a required secret (HS256 cookie-signing key). `wrangler
	// types` emits it as an OPTIONAL literal in `worker-configuration.d.ts` because
	// secrets have no static value to infer from, which forces `string | undefined`
	// at every `signJwt`/`verifyJwt` call site. It is asserted-present at startup
	// (see `test/contract/secrets.spec.ts`), so we narrow it to a required `string`
	// here. Declaration-merging widens the generated literal to `string` and drops
	// the `?`, giving call sites a real non-optional type without editing the
	// regenerable generated file.
	JWT_SIGNING_SECRET: string;
}

declare namespace Cloudflare {
	interface Env {
		AUTH_FROM_ADDRESS?: string;
		JWT_SIGNING_SECRET: string;
	}
}
