# Phase 9 expansion — trust-chain swap

Companion to `docs/superpowers/plans/2026-06-30-admin-auth-refactor.md`. Expands the summarized Phase 9 tasks to Phase-1-level TDD granularity. This is the phase that actually cuts the branch over from Cloudflare Access + `staff` KV to the new cookie-based session, so ordering matters: the code changes in 9.1 will break every test that relied on `X-Dev-Email` + `staff` KV until 9.2 lands. Task 9.4 removes the last consumer of `StaffListSchema` in the worker. Tasks 9.5–9.7 shape the boundary the admin SPA (Phase 10) will observe. 9.8 is the checkpoint.

**One standing pattern:** every handler test in the branch today authenticates via `X-Dev-Email` + a `staff` KV entry (see `services/test/auth/handlers/listUsers.spec.ts:47-49` for the canonical shape). After Task 9.1 lands, the dev-bypass path resolves callers from `user:*` records instead. Task 9.2 rewrites the `resolveCaller` unit tests directly. The other 12 handler spec files that use `staff`-KV seeding do NOT need updating in this phase — because the fresh trust chain in 9.1 preserves the dev-bypass entry-point contract (`X-Dev-Email` still works when `ENVIRONMENT=development`), the only change those spec files need is to swap `seedStaff` for `createUser`. That mass migration happens in Task 9.1's implementation (it's part of the rewrite scope — see 9.1's "downstream test migration" section) so the branch never lands in a broken state.

---

## Task 9.1 — Rewrite `services/src/utils/resolveCaller.ts`

**Objective.** Replace the CF Access JWT + `staff` KV trust chain with a cookie-first, in-app trust chain. Delete the `jose` dependency, the JWKS cache, the `staff` KV read, and `__resetResolveCallerCaches`. Keep `roleSatisfies`, `ICaller`, and the `ENVIRONMENT` fail-safe.

**Files touched.**

- `services/src/utils/resolveCaller.ts` — full rewrite
- All 12 spec files listed in `grep -rln "'staff'" services/test --include='*.spec.ts'` — mechanical swap from `seedStaff` (writes `staff` KV) to `seedUsers` (calls `createUser` per member) so tests keep working after the trust-chain change
- `services/src/utils/withAuthHandler.ts` — no change (imports `resolveCaller`, `roleSatisfies` from `./index`, both survive)
- `services/src/router.ts` — no change (imports `resolveCaller` from `./utils`, unchanged surface)

**New trust chain (in evaluation order).**

1. **Cookie path** — `readCookie(request, ACCESS_COOKIE)` returns `bea_at`. If present, call `verifyJwt(token, env.JWT_SIGNING_SECRET, 'access')`. On success, look up `userRepo.getUser(env, payload.sub)`; if the user exists and `status !== DISABLED`, return `{ email: user.email, role: user.role, via: 'cookie' }`. Any of {no cookie, verify null, user missing, DISABLED} falls through.
2. **Bearer path** — unchanged from today. `Authorization: Bearer <API_SECRET_KEY>` (`timingSafeEqual`) → `{ email: 'ci@service', role: OWNER, via: 'bearer' }`. Requires `env.API_SECRET_KEY` set.
3. **Dev bypass** — only when `(env.ENVIRONMENT ?? '').toLowerCase() === 'development'`. Read `X-Dev-Email` header; look up the corresponding user via `userRepo.getUser(env, email)`. If user exists and `status !== DISABLED`, return `{ email: user.email, role: user.role, via: 'dev' }`. **OWNER_EMAILS fallback stays** — if `getUser` returns null AND the email appears in `env.OWNER_EMAILS` (comma-split, trim, lowercase), return `{ email, role: OWNER, via: 'dev' }`. This is what makes the very first Phase-9-era test-run possible before any users are seeded (bootstrap flow relies on it).

**Ordering rationale.** Cookie first because it's the production path — every authenticated admin request carries `bea_at`, and the hot loop cannot afford a KV probe before the JWT verify short-circuits. Bearer second because it's a CI-only edge case that most requests skip via the header-absence guard. Dev bypass last (and gated on `ENVIRONMENT`) so a config gap in production cannot open the door.

**What leaves the file.**

- `import { createRemoteJWKSet, jwtVerify } from 'jose';` — deleted
- `import { StaffListSchema } from '@bee-epic/shared';` — deleted (still exported from shared/, but no worker code consumes it after this phase)
- `type IStaffMember` type alias — deleted
- `jwksCache`, `getJwks`, `staffCache`, `STAFF_TTL_MS`, `getStaffList`, `__resetResolveCallerCaches` — all deleted
- The entire Path B (CF Access JWT) block — deleted
- The old `resolveRole` function — deleted (users are looked up directly)

**What stays.**

- `ICaller` interface — CHANGE the `via` union from `'jwt' | 'bearer' | 'dev'` to `'cookie' | 'bearer' | 'dev'`. This is a breaking type change; the compiler will flag every consumer for us. In practice `withAuthHandler.ts` and `router.ts` reference `.role` / `.email` only, never `.via` — audit both to confirm before shipping.
- `roleSatisfies` + the `RANK` map — unchanged.
- The `ENVIRONMENT` fail-safe logic (`.toLowerCase() === 'development'`).

**Imports the new file needs.**

```ts
import { EStaffRole, EUserStatus } from "@bee-epic/shared";
import { ACCESS_COOKIE, readCookie } from "../auth/cookies";
import { verifyJwt } from "../auth/crypto/jwt";
import { getUser } from "../auth/repo/userRepo";
import { timingSafeEqual } from "./timingSafeEqual";
```

Note the import cycle risk: `resolveCaller` is at `services/src/utils/resolveCaller.ts`, and it needs `userRepo` at `services/src/auth/repo/userRepo.ts`, which does NOT import from `utils/` — verified with `grep -n "from '../..'" services/src/auth/repo/userRepo.ts` (only imports from `@bee-epic/shared`). Safe.

**Downstream test migration (part of this task).**

The 12 spec files under `services/test/**/*.spec.ts` that call `env.CONTENT_KV.put('staff', ...)` today authenticate via `X-Dev-Email` + a `staff` KV list. After 9.1 the dev-bypass path resolves callers via `getUser`, so the seed changes but the header pattern is preserved. Each file's `seedStaff(env, members)` helper becomes `seedUsers(env, members)`:

```ts
// Before (staff KV)
async function seedStaff(
  env: Env,
  members: Array<{ email: string; role: EStaffRole }>,
): Promise<void> {
  await env.CONTENT_KV.put("staff", JSON.stringify(members));
}

// After (user records)
async function seedUsers(
  env: Env,
  members: Array<{ email: string; role: EStaffRole }>,
): Promise<void> {
  const now = Date.now();
  for (const m of members) {
    await createUser(env, {
      schemaVersion: 1,
      email: m.email,
      displayName: m.email,
      role: m.role,
      status: EUserStatus.ACTIVE,
      passwordHash: null,
      createdAt: now,
      updatedAt: now,
      lastLoginAt: null,
      lastLoginIp: null,
    });
  }
}
```

The subagent for 9.1 MUST update these 12 files atomically with the source rewrite so the suite stays green:

- `services/test/auth/handlers/inviteUser.spec.ts`
- `services/test/auth/handlers/reinviteUser.spec.ts`
- `services/test/auth/handlers/deleteUser.spec.ts`
- `services/test/auth/handlers/updateUser.spec.ts`
- `services/test/auth/handlers/policyHandlers.spec.ts`
- `services/test/auth/handlers/updateMe.spec.ts`
- `services/test/auth/handlers/changePassword.spec.ts`
- `services/test/auth/handlers/listUsers.spec.ts`
- `services/test/settings/settings-handler.spec.ts` — separate treatment: this file's staff KV writes are legitimately about the `/settings/staff` endpoint, which is being deleted in 9.4. The subagent for 9.1 leaves this file's staff test cases alone; 9.4 will delete them.
- `services/test/notifications/notifications-stream.spec.ts` — audit; if it uses `X-Dev-Email` + `staff` for the SSE stream's auth, migrate; if it uses bearer, leave alone.
- `services/test/utils/handleCORS.spec.ts` — audit; if only imports the schema, leave alone.
- `services/test/utils/withAuthHandler.spec.ts` — this one is different: it defines its OWN inline `makeCaller` that scans `STAFF_LIST` at the handler-test seam without exercising `resolveCaller`. Confirm this by reading the file, and if so leave alone.
- `services/test/utils/withStripeHandler.spec.ts` — same audit.

The `resolveCaller.spec.ts` rewrite is Task 9.2, NOT part of this task's migration.

**Test-driven contract (rewrite scope).** For each new resolveCaller code path, write a red test first, then make it green. Detailed cases go in Task 9.2; the implementer here writes the source to satisfy the contract stated below and confirms all 12 downstream files still compile and pass.

**Contract (asserted by 9.2 tests).**

- `resolveCaller` returns `{via: 'cookie'}` when a valid `bea_at` cookie is present AND the referenced user exists AND `status !== DISABLED`.
- Returns null when: no cookie, verify fails (bad signature, expired, wrong type, missing sub), user missing, user DISABLED.
- After a failed cookie path, evaluates bearer (unchanged).
- After bearer, evaluates dev bypass (gated on `ENVIRONMENT`).
- Dev bypass: `X-Dev-Email` header → `getUser(email)` → non-DISABLED user → `{via: 'dev'}`. Falls to `OWNER_EMAILS` if user missing.
- Dev bypass ignores `X-Dev-Email` in production (empty / missing / any non-`development` value).

**Acceptance.**

- `npm --workspace services test -- resolveCaller` — green (with 9.2's rewrite)
- `npm --workspace services test` — full suite green (12 spec files migrated)
- `npm --workspace services run lint` — clean
- `grep -rn "jose" services/src` — zero hits
- `grep -rn "getStaffList\|__resetResolveCallerCaches" services/src services/test` — zero hits (the exported reset-fn is gone; downstream tests that used it must drop the call)

**Model selection.** Standard (Sonnet). Multi-file coordination + trust-boundary code — needs judgment. Not a mechanical port.

---

## Task 9.2 — Rewrite `services/test/utils/resolveCaller.spec.ts`

**Objective.** Replace every test case in the file for the new trust chain. The rewrite exercises the cookie-first path, then bearer, then dev — plus the fail-safe defaults and OWNER_EMAILS fallback.

**Delete.**

- `vi.mock('jose', ...)` and all `mockJwtVerify` / `mockCreateRemoteJWKSet` machinery.
- The entire "Path B: Cloudflare Access JWT" describe.
- The entire "JWT verification pinning (review I10)" describe.
- The JWKS-related cases in "caches (review I9)": `memoizes the JWKS instance...`, `rebuilds the JWKS when CF_ACCESS_TEAM_DOMAIN changes`.
- The staff-list caching cases (`caches the staff list across calls within the TTL window`, `falls back to a fresh KV read after __resetResolveCallerCaches`) — the underlying feature is gone.
- All `import { __resetResolveCallerCaches } from '../../src/utils/resolveCaller';`.

**Keep and adapt.**

- The `roleSatisfies` describe — unchanged (function surface hasn't moved).
- Dev-bypass cases — change the fixture to seed users via `createUser` instead of writing `staff` KV. Rewrite `makeKv(STAFF_LIST)` calls to a fresh KV + a `seedUsers(env, members)` helper (same shape as 9.1's downstream migration snippet).
- ENVIRONMENT defaulting cases — the assertions are unchanged; just fix the fixture.

**New cases (cookie path).** Use real `signJwt`/`verifyJwt` (no mocking) — the tokens are cheap to mint and asserting on real crypto catches regressions the jose mock hid. Fixture:

```ts
async function mintAccessCookieHeader(
  env: Env,
  email: string,
): Promise<string> {
  const token = await signJwt(
    { sub: email, type: "access", role: EStaffRole.OWNER },
    env.JWT_SIGNING_SECRET,
    Math.floor(ACCESS_TTL_MS / 1000),
  );
  return `${ACCESS_COOKIE}=${token}`;
}
```

Cases (each in a `describe('resolveCaller — Path A: cookie')` block):

1. `returns caller when bea_at cookie is valid and user is ACTIVE` — expect `{via: 'cookie', role: user.role}`. Note: the ROLE returned MUST come from `userRepo.getUser`, not from the JWT payload — otherwise a stale JWT could keep an EMPLOYEE promoted to MANAGER after a demotion. Verify by seeding the user as MANAGER, minting a JWT that claims OWNER, and asserting the caller resolves as MANAGER.
2. `returns null when bea_at cookie signature is bad` — flip a byte in the sig segment; verify returns null; the flow does NOT fall through to dev (no `X-Dev-Email` set), so result is null.
3. `returns null when bea_at cookie is expired` — mint with `ttlSeconds: -60`; expect null.
4. `returns null when bea_at cookie references a non-existent user` — mint a valid JWT for `ghost@test.com`, do NOT `createUser` for that email; expect null.
5. `returns null when bea_at cookie references a DISABLED user` — seed user with `status: DISABLED`; mint valid cookie for their email; expect null. This is the enforcement point that makes disabled-user login rejection stick even if the attacker still holds a valid pre-disable JWT.
6. `evaluates bearer after cookie failure` — attach an invalid cookie + a valid `Authorization: Bearer <API_SECRET_KEY>`; expect `{via: 'bearer'}`.
7. `evaluates dev-bypass after cookie failure` — attach an invalid cookie + `X-Dev-Email` + `ENVIRONMENT: development` + a seeded user; expect `{via: 'dev'}`.
8. `treats a missing bea_at cookie the same as an invalid one (falls through)` — no cookie header at all; only bearer set; expect `{via: 'bearer'}`.
9. `resolves role from the current user record, not the JWT claim` — see #1's note; explicit case asserting server-side role authority.

**Path B (bearer) cases.** Keep as-is; they're already correct. The one adjustment: today's `returns null when there is no Authorization header` case is still valid, but consider adding a sibling case `returns null when Authorization header uses a non-Bearer scheme` (e.g. `Basic <b64>`) to lock in the scheme check.

**Path C (dev) cases.**

- Fixture: seed the users store via `createUser` instead of `staff` KV.
- Update the "returns caller when email is in staff list" case → rename to "returns caller when email matches an ACTIVE user record".
- Add case: `returns null when X-Dev-Email matches a DISABLED user record` — enforces the same status gate the cookie path enforces.
- Update the "returns OWNER when email is in OWNER_EMAILS but not in staff list" case → keep the OWNER_EMAILS-fallback semantics, but re-word: "returns OWNER via OWNER_EMAILS fallback when no user record exists". This case matters for the bootstrap flow.
- Add case: `case-insensitive user lookup` — same as the existing but assert via `getUser`.

**Env fixture.** The new `makeEnv` no longer needs CF_ACCESS_* bindings. It DOES need `JWT_SIGNING_SECRET`. Add:

```ts
function makeEnv(overrides: Partial<Env> = {}): Env {
  return {
    CONTENT_KV: makeKv(),
    JWT_SIGNING_SECRET:
      "test-secret-value-abc-123-must-be-at-least-32-bytes-decoded",
    API_SECRET_KEY: "",
    ENVIRONMENT: "production",
    ...overrides,
  } as unknown as Env;
}
```

**Acceptance.**

- All new cases green.
- `resolveCaller.spec.ts` no longer imports from `jose` or references `__resetResolveCallerCaches`.
- `npm --workspace services test -- resolveCaller` — green.

**Model selection.** Standard. Test rewrite is mechanical once the contract is defined but requires enough judgment to keep the ordering and fall-through semantics visible.

---

## Task 9.3 — Uninstall `jose`

**Objective.** Remove the dependency from `services/package.json`, prune the lockfile, verify no remaining imports.

**Steps.**

1. From repo root: `npm --workspace services uninstall jose`. This edits `services/package.json` AND the workspace-level `package-lock.json`.
2. `grep -rn "'jose'\|\"jose\"" services/src services/test` — MUST return zero. If anything shows up, 9.1 / 9.2 left a straggler; fix it here.
3. `grep -rn "jose" services/package.json` — MUST return zero.
4. `git status` — should show `services/package.json` and `package-lock.json` modified.
5. `npm --workspace services test` — full suite green.

**Acceptance.**

- `services/package.json` has no `jose` entry (dependencies or devDependencies).
- `package-lock.json` has no `node_modules/jose` entry.
- `npm --workspace services test` passes.

**Model selection.** Cheap (Haiku). Pure mechanical.

---

## Task 9.4 — Delete `/settings/staff` surface

**Objective.** Remove the `/settings/staff` route, the settings-handler staff branch, and every test case that exercised it. The `staff` KV key becomes orphan data — that's intentional, the operator can prune it later or leave it as an inert legacy blob.

**Files touched.**

- `services/src/router.ts` — line 250: drop `staff` from the regex `/^\/settings\/(site|process|testimonials|categories|staff)$/`. New value: `/^\/settings\/(site|process|testimonials|categories)$/`.
- `services/src/settings/settings-handler.ts` — delete the `if (url.pathname === '/settings/staff' ...) { ... }` block entirely (lines 10–57 in the current file). Drop the `StaffListSchema` import from line 1. The remaining handler starts at the `const match = url.pathname.match(/^\/settings\/(site|process|testimonials|categories)$/);` guard, which is already correct.
- `services/test/settings/settings-handler.spec.ts` — delete the "allows OWNER to PUT /settings/staff" and "returns 403 when MANAGER tries to PUT /settings/staff" describes / cases. Any `STAFF_LIST` fixture used only by those cases can also go.
- `docs/superpowers/plans/*` — no changes required; the plan already anticipates this.

**Non-goals.**

- Do NOT delete `StaffListSchema` from `shared/src/staff.ts` in this task — it's re-exported and there's a plausible read-only consumer in the admin app. That's a Phase 11 doc/cleanup task. The worker just stops using it.
- Do NOT delete the `staff` KV key from any environment. Leaving it inert is safer than a migration script that could nuke real data mid-cutover.

**Test-driven check.**

1. Before deleting anything, add a new red test in `settings-handler.spec.ts`: `returns NOT_FOUND for GET /settings/staff` — asserts the endpoint is gone.
2. Make the code change; that test now passes.
3. Delete the two obsolete describes.
4. `npm --workspace services test -- settings-handler` — green.
5. `npm --workspace services test` — full suite green.
6. `grep -rn "'/settings/staff'\|\\\"settings/staff\\\"" services/src services/test` — zero hits after the deletes.

**Acceptance.**

- Router regex no longer matches `staff`.
- Settings handler has no staff branch.
- Full services suite green.

**Model selection.** Cheap (Haiku). Mechanical delete-block, with the one new red test to gate it.

---

## Task 9.5 — `/whoami` bootstrapAvailable flag

**Objective.** When `/whoami` returns a null caller, add a `bootstrapAvailable: boolean` field to the response body so the admin SPA (Phase 10.5) knows whether to offer the bootstrap flow.

**Files touched.**

- `services/src/router.ts` — the `/whoami` branch (lines 274–281 in the current file).
- `services/test/index.spec.ts` — add cases (or a new dedicated spec file if the file has grown too long — audit first).

**Behavior.**

- When `resolveCaller` returns a caller: response is `{ok: true, data: {caller}}` — unchanged.
- When `resolveCaller` returns null: compute `activeOwners = (await listUsers(env)).filter(u => u.role === OWNER && u.status === ACTIVE).length`. Response is `{ok: true, data: {caller: null, bootstrapAvailable: activeOwners === 0}}`.
- Note that we count ONLY ACTIVE owners here — an INVITED OWNER from an incomplete bootstrap does NOT close the bootstrap gate, so the operator can retry. This matches bootstrapOwner.ts:122 (the same computation) — that's the whole point: `/whoami`'s `bootstrapAvailable` is the CLIENT-side equivalent of `bootstrapOwner`'s SERVER-side gate.

**Import to add.** `import { listUsers } from './auth/repo/userRepo';` at the top of `router.ts`.

**Test cases (services/test/index.spec.ts or new file).**

1. `GET /whoami returns bootstrapAvailable: true when no ACTIVE OWNERs exist and no caller` — seed zero users; expect `data: {caller: null, bootstrapAvailable: true}`.
2. `GET /whoami returns bootstrapAvailable: false when an ACTIVE OWNER exists and no caller` — seed one ACTIVE OWNER; expect `data: {caller: null, bootstrapAvailable: false}`.
3. `GET /whoami returns bootstrapAvailable: true when only INVITED OWNERs exist and no caller` — seed one INVITED OWNER (no password); still `true`.
4. `GET /whoami omits bootstrapAvailable when caller is present` — set up a valid caller (via dev bypass with a seeded user); expect `data: {caller: {...}}` with NO `bootstrapAvailable` key. (Confirm the omission with `expect(body.data).not.toHaveProperty('bootstrapAvailable')`.)
5. `GET /whoami counts DISABLED OWNERs as non-ACTIVE (bootstrapAvailable stays true)` — seed one DISABLED OWNER; expect `bootstrapAvailable: true`.

**Perf note.** `listUsers` reads the index + N-user records. For an admin panel with <100 users this is fine. If we ever need to scale this, the shape to introduce is an `ownerCount` KV counter — do NOT introduce it prematurely.

**Acceptance.**

- All 5 cases green.
- Existing `/whoami` tests still pass (caller-present shape unchanged).

**Model selection.** Cheap–Standard. The code change is trivial; the test surface deserves care to avoid regressing the existing `/whoami` contract.

---

## Task 9.6 — `.dev.vars.example` rewrite

**Objective.** Update the sample env file to match the new trust chain. Remove CF Access secrets. Add auth secrets. Keep the safety-net entries the bootstrap flow relies on.

**New contents (drop-in).**

```
# ⚠️ STRIPE_SECRET_KEY is your live/test Stripe secret key — never share it
STRIPE_SECRET_KEY=sk_test_your_stripe_test_key_here

# STRIPE_WEBHOOK_SECRET is required for verifying Stripe webhook events.
STRIPE_WEBHOOK_SECRET=whsec_your_webhook_secret_here

ALLOWED_ORIGINS=http://localhost:5173,http://localhost:5174,http://localhost:8787

# ---------- Admin auth (Phase 9 trust chain) ----------
#
# All admin write endpoints authenticate via `resolveCaller()` in
# src/utils/resolveCaller.ts. There are three paths in evaluation order:
#
#   1. Cookie      — `bea_at` HttpOnly session cookie (production path)
#   2. Bearer      — `Authorization: Bearer <API_SECRET_KEY>` (CI / scripts)
#   3. Dev bypass  — `X-Dev-Email` header (only when ENVIRONMENT=development)
#
# ENVIRONMENT: set to `development` locally so the dev bypass is active and
# session cookies drop the `Secure` flag (localhost is http-only). Any other
# value — including empty — is treated as production. Keep it unset in prod.
ENVIRONMENT=development

# JWT_SIGNING_SECRET: HMAC-SHA256 key used to sign session JWTs (`bea_at`,
# `bea_rt`) via `signJwt` in src/auth/crypto/jwt.ts. MUST be at least 32 bytes
# when base64-decoded. Generate locally with:
#   openssl rand -base64 48
# In production this MUST be set as a Wrangler secret; NEVER commit the value.
JWT_SIGNING_SECRET=change-me-min-32-bytes-base64-decoded

# AUTH_FROM_ADDRESS: the `From:` on every auth email (invite, reset, password-
# changed notification). Format: `Display Name <you@example.com>` or bare
# address. Must be a domain your email provider is authorized to send from.
AUTH_FROM_ADDRESS=Bee Epic Apiary <noreply@example.com>

# API_SECRET_KEY: bearer fallback for CI / service-to-service calls. Maps to
# OWNER role at runtime. Optional — leave blank to disable bearer auth
# entirely.
API_SECRET_KEY=dev-api-key-change-me

# OWNER_EMAILS: bootstrap allow-list AND never-lockout safety net. Comma-
# separated. Any email here can:
#   (a) drive `POST /auth/bootstrap-owner` to mint the very first OWNER invite
#   (b) authenticate via `X-Dev-Email` in dev even before their user record
#       exists (bootstrap escape hatch)
# Once at least one ACTIVE OWNER exists, (a) is disabled by the completion
# gate in src/auth/handlers/bootstrapOwner.ts. Keep this list SHORT — a single
# operator address is the norm.
OWNER_EMAILS=owner@example.com
```

**What leaves.**

- `CF_ACCESS_TEAM_DOMAIN` — deleted (was for the old JWKS verify path).
- `CF_ACCESS_AUD` — deleted (was for the old JWKS verify path).
- The "Plan 3: Cloudflare Access JWT + staff role auth" comment block — deleted.

**What stays.**

- Stripe keys.
- `ALLOWED_ORIGINS`.
- `API_SECRET_KEY` (repurposed comment: now the CI/scripts fallback, not paired with CF Access).
- `OWNER_EMAILS` (updated comment: now doubles as bootstrap allow-list — this is a spec-reconciliation note, matches bootstrapOwner.ts:14-18).

**Acceptance.**

- File written verbatim to the block above.
- `grep -n "CF_ACCESS\|jose" services/.dev.vars.example` — zero hits.
- `grep -n "JWT_SIGNING_SECRET\|AUTH_FROM_ADDRESS" services/.dev.vars.example` — both present.

**Model selection.** Cheap (Haiku). Documentation edit.

---

## Task 9.7 — Contract test `services/test/contract/secrets.spec.ts`

**Objective.** Add a small contract test that asserts `JWT_SIGNING_SECRET` is present at build time and its base64-decoded byte length is at least 32. This catches a truncated / placeholder secret before it can ship — the branch's whole session-integrity story rests on that HMAC key having enough entropy.

**Why in the test suite.** The `.dev.vars.example` documentation is advisory. A CI secret typo won't fail the build any other way. A single Vitest that reads `process.env` (or, in the vitest-pool-workers runtime, `env`) turns the constraint into a hard build gate. This is standard security-contract test hygiene.

**File location.** New directory: `services/test/contract/`. Rationale: the existing `services/test/` layout groups tests by module (utils/, auth/, stripe/, settings/, notifications/). Contract tests are cross-cutting infra assertions with no matching source module; a dedicated `contract/` sub-directory signals that clearly.

**Test file contents.**

```ts
import { describe, it, expect } from "vitest";
import { env } from "cloudflare:test";

/**
 * Contract: JWT_SIGNING_SECRET must be present and cryptographically
 * strong enough to serve as the HMAC-SHA256 key for session cookies.
 *
 * Byte-length check: HMAC-SHA256 uses a 256-bit block; a key shorter than
 * 32 bytes decoded gets NULL-padded by WebCrypto, which does not weaken
 * the primitive but strongly suggests a placeholder value made it to
 * production. Fail the build to force a real value.
 *
 * The value is expected to be base64-encoded so operators can copy-paste
 * `openssl rand -base64 48` output into wrangler secrets without shell-
 * quoting concerns.
 */
describe("secrets contract", () => {
  it("JWT_SIGNING_SECRET is present", () => {
    expect(env.JWT_SIGNING_SECRET).toBeTypeOf("string");
    expect(env.JWT_SIGNING_SECRET.length).toBeGreaterThan(0);
  });

  it("JWT_SIGNING_SECRET decodes to at least 32 bytes", () => {
    // Use atob to decode base64 without pulling in Buffer. atob throws on
    // invalid base64, which itself is a useful failure.
    let decodedLength: number;
    try {
      decodedLength = atob(env.JWT_SIGNING_SECRET).length;
    } catch {
      throw new Error(
        "JWT_SIGNING_SECRET is not valid base64 — expected `openssl rand -base64 N` output",
      );
    }
    expect(decodedLength).toBeGreaterThanOrEqual(32);
  });
});
```

**Test-fixture wiring.** The contract test relies on `env.JWT_SIGNING_SECRET` being set in the vitest-pool-workers test environment. Confirm `services/wrangler.jsonc`'s `env.test` (or `env.development`) block has a stub value that clears the 32-byte bar — `dGVzdC1zZWNyZXQtdmFsdWUtYWJjLTEyMy1tdXN0LWJlLWF0LWxlYXN0LTMyLWJ5dGVzLWRlY29kZWQ=` (base64 of the test string we use elsewhere) is a fine fixture. If the binding isn't already there, the subagent adds it as part of this task.

**Acceptance.**

- Both cases green in the vitest-pool-workers runtime.
- Removing / truncating the wrangler stub value causes at least one case to fail (verify manually before landing).

**Model selection.** Cheap (Haiku). Pure spec-driven infrastructure test.

---

## Task 9.8 — Phase 9 green checkpoint

**Objective.** Confirm the whole services package is on the new trust chain, lock in the state with a plan-doc note, move on.

**Steps.**

1. `cd services && npm run test` — full suite green (expect ≥ 933 pass — 9.2 may drop a few JWKS cases and 9.4 will drop the settings/staff cases; the net should stay in the 900s).
2. `cd services && npm run lint` — clean.
3. `grep -rn "jose\|Cf-Access-Jwt-Assertion\|StaffListSchema\|getStaffList" services/src` — zero hits.
4. `git log --oneline master..HEAD | head -30` — verify the Phase 9 commit set is coherent (one commit per task, ideally).
5. Update `docs/superpowers/plans/2026-06-30-admin-auth-refactor.md`: append a paragraph after the Phase 8 completion note that captures Phase 9's outcome, commits, and any design decisions worth surfacing. Model the language on the existing Phase 8 completion note.
6. Commit the plan update with `docs(plans): mark Phase 9 complete (2026-07-03)`.
7. Mark Task #11 (Phase 9) completed in the tracker; mark Task #12 (Phase 10) in_progress.

**Acceptance.**

- Test suite fully green.
- Lint clean.
- Plan doc updated + committed.
- `grep` audits show the old surface is gone from `services/src`.

**Model selection.** Cheap. Verification + a small doc write.

---

## Ordering / dependency graph

```
9.0 (this doc, committed)
 └─ 9.1 (resolveCaller rewrite + 12-spec migration)
     ├─ 9.2 (resolveCaller.spec rewrite) — depends on 9.1 landing
     └─ 9.4 (delete /settings/staff) — depends on 9.1 landing (removes the last staff consumer)
 └─ 9.3 (uninstall jose) — depends on 9.1 (there are no more importers)
 └─ 9.5 (whoami bootstrapAvailable) — independent of 9.1–9.4, can land in parallel
 └─ 9.6 (dev.vars.example) — independent, can land in parallel with 9.5
 └─ 9.7 (secrets contract test) — depends on 9.6's JWT_SIGNING_SECRET being documented; can share a commit with 9.6 if desired
 └─ 9.8 (green checkpoint) — depends on all above
```

Practical dispatch order (single-thread subagent): **9.1 → 9.2 → 9.3 → 9.4 → 9.5 → 9.6 → 9.7 → 9.8**. Every step ends with the test suite green so a failure at any point is bisectable.

---

## Notes on approach (from the Phase 8 retro)

- Every task ends with `npm run test` + `npm run lint` green before the commit lands. If a subagent's implementer step leaves the suite red, that's a BLOCKED status even if the intent was right — the branch stays green between commits.
- Every task goes through spec review → code quality review. Two-stage. Fix loops until both approve. See Phase 8's 8.3 and 8.7 for the pattern in action.
- The `X-Dev-Email` header is preserved as a dev-only escape hatch. It is NOT deprecated in Phase 9 — Phase 10.12 removes the admin-side interceptor as part of the client cutover. The server contract stays intact for CI, scripts, and any residual manual dev-loop use.
- Reviewer follow-up from Phase 8: the "error taxonomy pass" flagged by 8.7's policyHandlers docstring is NOT in Phase 9 scope. Keep the door open — if the reviewer for any Phase 9 task suggests we should widen the taxonomy while we're touching auth code, we'll consider it inline; otherwise it stays as a Phase 11 doc entry.

---

## Completion — 2026-07-05

Phase 9 landed. Trust chain is now **cookie → bearer → dev**, jose is gone, `/settings/staff` is retired, `/whoami` exposes the bootstrap gate, and the secrets contract is machine-checked at test time.

**Commits (chronological, oldest first):**

- `874507c` — docs(plans): expand Phase 9 tasks to Phase-1-level detail _(9.0)_
- `0f5203b` — refactor(auth): rewrite resolveCaller for cookie-first trust chain _(9.1)_
- `a0056d6` — test(auth): rewrite resolveCaller spec for cookie-first trust chain _(9.2)_
- `389ff4b` — chore(deps): uninstall jose; drop stale `vi.mock('jose')` in two specs _(9.3)_
- `fbb865b` — refactor: delete /settings/staff surface _(9.4)_
- `287ff1c` — docs(test): fix stale bearer-path claim in withAuthHandler.spec.ts comment _(9.4 polish)_
- `6fbfd41` — feat(whoami): add bootstrapAvailable flag when caller is null _(9.5)_
- `2e52ae7` — chore(services): rewrite .dev.vars.example for Phase 9 trust chain _(9.6)_
- `815d268` — test(services): add JWT_SIGNING_SECRET contract test _(9.7; also seeded a dev-only stub into `wrangler.jsonc` env.development.vars)_
- `650acb0` — chore(wrangler): clarify JWT_SIGNING_SECRET stub comment _(9.7 polish)_
- `47a785b` — chore(services): remove residual CF Access references _(9.8 audit — cleaned `env.d.ts` and the notifications-stream JSDoc)_

**Grep audit (all zero — run at close-out):**

- `grep -rn "'jose'\|\"jose\"" services/src services/test` → 0
- `grep -c '"jose"' services/package.json services/package-lock.json` → 0 / 0
- `grep -rn "CF_ACCESS\|Cf-Access-Jwt-Assertion" services/src services/test` → 0
- `grep -rn "settings/staff" services/src` → 0
- `grep -rn "StaffListSchema" services/src` → 0

**Final suite state:**

- `cd services && npm test -- --run` → **67 files, 936 pass / 8 skipped / 0 fail**
- `cd services && npm run lint` → clean

**Deferred (intentionally out of scope):**

- `services/AGENTS.md` and `services/API.md` — flagged during 9.4's code-quality review as still describing the CF Access surface. Deferred to Phase 11.9/11.10 which explicitly own those rewrites.
- Widening the auth error taxonomy (raised in Phase 8's 8.7 policyHandlers review) — still not in scope; carried forward to Phase 11 docs.

**Ready for Phase 10** (admin SPA auth cutover). The server contract for `X-Dev-Email` remains intact and gated on `ENVIRONMENT=development`; Phase 10.12 removes the admin-side interceptor.
