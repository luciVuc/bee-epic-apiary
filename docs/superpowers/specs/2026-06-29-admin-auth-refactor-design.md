# Admin Auth Refactor — Separate app identity from Cloudflare deployment account

**Status:** Draft (awaiting user review)
**Date:** 2026-06-29
**Authors:** Lucian Vuc, Claude (brainstorming)
**Supersedes:** the "Plan 3" Cloudflare-Access auth model documented in `services/AGENTS.md` and the `Cf-Access-Jwt-Assertion` branch in `services/src/utils/resolveCaller.ts`

## Problem

Admin-user identity is currently entangled with the deployer's Cloudflare account. The admin Pages site and the worker both sit behind Cloudflare Access; the worker's `resolveCaller` trusts the `Cf-Access-Jwt-Assertion` header and matches the email claim against a KV `staff` list. To log into the admin app, a person must be in the deployer's Cloudflare Access team — which means every shop owner who deploys this app must manage admin users _through Cloudflare_, not through the app itself.

This conflates two concerns that should be separate:

1. **Who deployed the app** — owns the Cloudflare account hosting the worker + Pages sites + KV namespaces.
2. **Who can log into the admin** — owner, manager, employee, vendor — should be managed inside the app, with credentials the OWNER creates and rotates from a Users tab.

## Goal

Refactor the admin app (services + admin) so admin users are first-class records inside the app:

- Owner-managed users with email-and-password credentials
- Invite-only signup (no public registration)
- Role-based access (`OWNER > MANAGER > EMPLOYEE > VENDOR`)
- Self-service password change and display-name edit
- Owner-configurable password policy (min length, breach-check, change-notification email)
- Cloudflare Access is removed from the admin path entirely
- One-time `BOOTSTRAP_OWNER_EMAIL` env var creates the first OWNER on a fresh deploy

## Non-goals

- MFA / passkeys / SSO (future)
- Audit log of admin actions (future)
- Per-route fine-grained permissions beyond the four-role rank ladder (future)
- Email deliverability beyond what the existing pipeline provides (no Resend/Postmark)
- D1 / SQLite backing store — KV today, but data layer is structured so D1 is a future swap, not a rewrite
- Storefront (`web/`) — zero changes

## Decisions (locked-in from brainstorming Q&A)

| #   | Decision                                                                                                                          |
| --- | --------------------------------------------------------------------------------------------------------------------------------- |
| Q1  | Invite-only — OWNER invites users by email, no public signup                                                                      |
| Q2  | Email + password — classic credentials, hashed server-side                                                                        |
| Q3  | HttpOnly cookie session — short-lived access JWT + rotated refresh JWT                                                            |
| Q4  | KV-backed storage in `CONTENT_KV`, behind a repository layer so D1 migration is a future swap                                     |
| Q5  | Greenfield cut of the existing `staff` KV record — OWNER re-invites everyone after upgrade                                        |
| Q6  | First OWNER via `BOOTSTRAP_OWNER_EMAIL` + first-login claim; env var goes inert after first OWNER exists                          |
| Q7  | Reuse existing email pipeline with per-template `from` address (e.g. `accounts@`)                                                 |
| Q8  | Rename `FULFILLMENT` → `EMPLOYEE`; add `VENDOR` (read-only)                                                                       |
| Q8b | VENDOR sees same reads as EMPLOYEE; cross-cutting write floor enforces `rank >= EMPLOYEE`                                         |
| Q9  | Remove Cloudflare Access entirely from the admin path                                                                             |
| Q10 | Keep `Authorization: Bearer <API_SECRET_KEY>` fallback for CI / scripts                                                           |
| Q11 | Login rate-limit by `(ip, email)`: 5 per 15 min via existing DO limiter                                                           |
| Q12 | Length-only password policy (NIST-style), owner-configurable min length (floor 8), owner-toggleable HIBP k-anonymity breach check |
| Q13 | "Password changed" email sent on every change, owner-toggleable (default on)                                                      |
| Q14 | Invite tokens valid 7 days, single-use; password-reset tokens valid 1 hour, single-use                                            |
| Q15 | Full self-service: password change + display name; OWNER controls role/status/email                                               |

## Approach

In-app auth, no third-party SaaS. The worker grows an `auth/` module: users live in `CONTENT_KV` (with a future migration path to D1), login issues HttpOnly cookies signed by a worker-side `JWT_SIGNING_SECRET`, refresh tokens rotate with replay detection, and Cloudflare Access goes away.

Two alternatives were considered and rejected:

- **Managed auth SaaS (Clerk/WorkOS/Auth0/Supabase Auth):** trades CF Access coupling for a different vendor coupling, adds an external dependency and a new failure mode, and contradicts the "make SETUP.md simpler" goal.
- **Keep CF Access, swap the IdP behind it:** doesn't solve the coupling — admin users still need to be added through Cloudflare Access policies on the deployer's account.

---

## Architecture

### Trust boundary changes

| Today                                                                   | After refactor                                                                                                             |
| ----------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Cloudflare Access gates the admin SPA and the worker                    | Both publicly reachable; SPA shows a login page, worker rejects unauthenticated requests at the handler level              |
| Worker trusts `Cf-Access-Jwt-Assertion` (verified via JWKS + `jose`)    | Worker trusts its own HttpOnly cookie (`bea_at`, `bea_rt`) verified with HMAC-SHA256 against a worker-owned signing secret |
| Identity comes from CF Access's `email` claim → KV `staff` lookup       | Identity comes from a `user:<email>` record in `CONTENT_KV` with hashed password, role, status                             |
| `X-Dev-Email` dev bypass header                                         | Same shape, but now looks up the user in the local users collection (still gated by `ENVIRONMENT === 'development'`)       |
| Bearer `Authorization: <API_SECRET_KEY>` → synthetic `ci@service` OWNER | **Unchanged**                                                                                                              |

### Layered structure (worker `services/src/auth/`)

```
services/src/auth/
├── repo/                       # the D1 swap-point — only these touch env.CONTENT_KV
│   ├── userRepo.ts
│   ├── inviteRepo.ts
│   ├── resetRepo.ts
│   └── refreshFamilyRepo.ts
├── crypto/                     # zero KV access
│   ├── passwordHash.ts         # PBKDF2-SHA256, 600k iters, self-describing format
│   ├── jwt.ts                  # HMAC-SHA256 sign/verify with type-claim discrimination
│   └── tokens.ts               # URL-safe random tokens for invites/resets
├── policy/
│   ├── policyRepo.ts           # KV-backed `auth-policy` config + 30s in-isolate cache
│   └── validatePassword.ts     # length + denylist + optional HIBP k-anonymity (fail-open)
├── emails/
│   ├── from.ts                 # per-template `from` address resolver
│   ├── sendInvite.ts
│   ├── sendReset.ts
│   └── sendPasswordChanged.ts
├── handlers/
│   ├── login.ts | logout.ts | refresh.ts
│   ├── acceptInvite.ts | requestReset.ts | completeReset.ts
│   ├── changePassword.ts | updateMe.ts
│   ├── listUsers.ts | inviteUser.ts | updateUser.ts | deleteUser.ts | reinviteUser.ts
│   ├── bootstrapOwner.ts
│   └── policyHandlers.ts       # GET/PUT /settings/auth-policy
└── resolveCaller.ts            # rewritten — cookie | bearer | (dev) X-Dev-Email
```

### Request flow

```
Browser → admin Pages site (public)
        ↓ POST /auth/login (email + password)
      Worker → resolveCaller? no. → loginHandler → validates →
              sets HttpOnly cookies bea_at (1h, path=/) + bea_rt (30d, path=/auth/refresh)
        ↓ subsequent API calls send cookies automatically (withCredentials: true)
      Worker → resolveCaller → verify bea_at JWT → caller ready
        ↓ access expired but refresh valid?
      Browser auto-calls POST /auth/refresh → new bea_at + rotated bea_rt → retry original request
```

The admin axios client gets a response interceptor: any 401 with the refresh cookie present triggers a single `/auth/refresh` retry, then replays the original request. On refresh failure, `resetAuth` runs and `RequireCaller` redirects to `/login`. HttpOnly cookies mean the SPA never touches the tokens.

### What leaves the codebase

- `jose` dependency
- `getJwks()` JWKS-caching block in `resolveCaller`
- `Cf-Access-Jwt-Assertion` branch in `resolveCaller`
- KV `staff` record and `StaffListSchema` (replaced by users collection)
- `CF_ACCESS_TEAM_DOMAIN`, `CF_ACCESS_AUD`, `OWNER_EMAILS` Wrangler secrets
- "Step 10 — Configure Cloudflare Access" section of `SETUP.md`
- `X-Dev-Email` interceptor on the admin axios client (the worker still accepts it in dev; the SPA no longer sends it)

### What's added

- Wrangler secrets: `JWT_SIGNING_SECRET` (32 random bytes base64), `BOOTSTRAP_OWNER_EMAIL`, optional `AUTH_FROM_ADDRESS`
- ~12 new worker routes under `/auth/*` and `/users/*`
- `Users` tab in admin Settings (OWNER-only), replacing `Staff` tab
- `Security` tab in admin Settings (OWNER-only) — password policy knobs
- Login + invite-accept + password-reset + bootstrap-owner pages in the admin SPA

---

## Data model

All records JSON in `CONTENT_KV`, validated by Zod schemas in `@bee-epic/shared/src/auth.ts` (new file).

### Key naming

| Pattern                          | Holds                                                                    |
| -------------------------------- | ------------------------------------------------------------------------ |
| `user:<email-lower>`             | One user record                                                          |
| `user-index`                     | `string[]` of all user emails (maintained transactionally by `userRepo`) |
| `invite:<token>`                 | One pending invite (single-use, 7-day TTL via `expiresAt`)               |
| `pwreset:<token>`                | One pending reset (single-use, 1-hour TTL via `expiresAt`)               |
| `refresh:<userEmail>:<familyId>` | One refresh-token family                                                 |
| `auth-policy`                    | Password-policy config                                                   |

### `IUser`

```ts
{
  schemaVersion: 1,
  email: string,                  // lowercase
  displayName: string,
  role: EStaffRole,               // OWNER | MANAGER | EMPLOYEE | VENDOR
  status: EUserStatus,            // ACTIVE | INVITED | DISABLED
  passwordHash: string | null,    // null while INVITED
  createdAt: number,
  updatedAt: number,
  lastLoginAt: number | null,
  lastLoginIp: string | null,     // truncated /24 v4 or /48 v6
}
```

`EUserStatus`:

- `INVITED` — record exists, no password yet, invite token outstanding
- `ACTIVE` — has password, can log in
- `DISABLED` — login refused with generic 401

### `IInvite`

```ts
{
  schemaVersion: 1,
  token: string,
  email: string,
  role: EStaffRole,
  displayName?: string,
  invitedBy: string,
  createdAt: number,
  expiresAt: number,              // createdAt + 7 days
}
```

### `IPasswordReset`

```ts
{
  schemaVersion: 1,
  token: string,
  email: string,
  createdAt: number,
  expiresAt: number,              // createdAt + 1 hour
}
```

### `IRefreshFamily`

```ts
{
  schemaVersion: 1,
  familyId: string,
  email: string,
  currentJti: string,
  createdAt: number,
  lastRefreshedAt: number,
  expiresAt: number,              // createdAt + 30 days; refresh does not extend, login does
  userAgent: string | null,
  ip: string | null,
}
```

**Refresh rotation rules:** Login creates a new family. Each `/auth/refresh` requires the JWT's `jti` to match the family's `currentJti`; on success, both are rotated. Mismatch (replay) **destroys the entire family** — that session is dead.

**Hard cap:** 10 concurrent refresh families per user; creating an 11th evicts the oldest.

### `IAuthPolicy`

```ts
{
  schemaVersion: 1,
  minLength: number,              // default 12, hard floor 8 enforced at put-time
  checkBreachCorpus: boolean,     // default true
  notifyOnPasswordChange: boolean,// default true
  updatedAt: number,
  updatedBy: string,
}
```

### Password hash format

```
pbkdf2$sha256$<iterations>$<base64-salt>$<base64-hash>
```

- PBKDF2-SHA-256 via `crypto.subtle.deriveBits` (native, zero bundle cost)
- 600_000 iterations (OWASP recommendation, 2024)
- 16-byte random salt per password
- 32-byte hash
- Constant-time verify via the existing `timingSafeEqual` on raw bytes
- Self-describing → future iteration bumps are seamless; future Argon2id is a swap inside `passwordHash.ts`

### JWT shapes

Access (`bea_at`):

```json
{
  "sub": "user@example.com",
  "role": "OWNER",
  "type": "access",
  "iat": 1730000000,
  "exp": 1730003600,
  "iss": "bea-admin"
}
```

Refresh (`bea_rt`):

```json
{
  "sub": "user@example.com",
  "fid": "<familyId>",
  "jti": "<jti>",
  "type": "refresh",
  "iat": 1730000000,
  "exp": 1732592000,
  "iss": "bea-admin"
}
```

Both HMAC-SHA256 with `env.JWT_SIGNING_SECRET`. Distinct `type` claim blocks one being used where the other is expected.

### Cookies

| Cookie   | Path            | Max-Age       | HttpOnly | Secure    | SameSite |
| -------- | --------------- | ------------- | -------- | --------- | -------- |
| `bea_at` | `/`             | 3600 (1h)     | ✅       | ✅ (prod) | `Lax`    |
| `bea_rt` | `/auth/refresh` | 2592000 (30d) | ✅       | ✅ (prod) | `Lax`    |

`SameSite=Lax` is sufficient because the admin SPA and the API share an eTLD+1 (already validated by `cookieScope.ts`). Path-scoped refresh cookie keeps it off every API call.

---

## API surface

### Auth endpoints (unauthenticated)

| Method | Path                    | Body                              | Success                          | Errors                                                                                        |
| ------ | ----------------------- | --------------------------------- | -------------------------------- | --------------------------------------------------------------------------------------------- |
| `POST` | `/auth/login`           | `{email, password}`               | `200 {caller}` + sets cookies    | `401 INVALID_CREDENTIALS`, `429 RATE_LIMITED`, `403 ACCOUNT_DISABLED`                         |
| `POST` | `/auth/logout`          | `{}`                              | `204` + clears cookies           | —                                                                                             |
| `POST` | `/auth/refresh`         | `{}`                              | `200 {caller}` + rotates cookies | `401 NO_REFRESH`, `401 INVALID_REFRESH`, `401 REUSED_REFRESH` (family destroyed)              |
| `POST` | `/auth/accept-invite`   | `{token, password, displayName?}` | `200 {caller}` + sets cookies    | `400 INVALID_TOKEN`, `400 EXPIRED_TOKEN`, `400 WEAK_PASSWORD {reasons}`, `409 ALREADY_ACTIVE` |
| `POST` | `/auth/request-reset`   | `{email}`                         | `200 {}` always (no enumeration) | `429 RATE_LIMITED`                                                                            |
| `POST` | `/auth/complete-reset`  | `{token, password}`               | `200 {caller}` + sets cookies    | `400 INVALID_TOKEN`, `400 EXPIRED_TOKEN`, `400 WEAK_PASSWORD`                                 |
| `POST` | `/auth/bootstrap-owner` | `{email}`                         | `200 {inviteEmailSent: true}`    | `403 BOOTSTRAP_DISABLED`, `400 EMAIL_MISMATCH`                                                |

### Auth endpoints (authenticated)

| Method | Path                    | Body                             | Success                | Role                                                                                |
| ------ | ----------------------- | -------------------------------- | ---------------------- | ----------------------------------------------------------------------------------- |
| `GET`  | `/whoami`               | —                                | `200 {caller \| null}` | unchanged                                                                           |
| `POST` | `/auth/change-password` | `{currentPassword, newPassword}` | `204`                  | any logged-in (invalidates _other_ refresh families; current session keeps working) |
| `PUT`  | `/users/me`             | `{displayName}`                  | `200 {user}`           | any logged-in                                                                       |

### User management (OWNER-only)

| Method   | Path                     | Body                             | Success                        | Errors                                                                                              |
| -------- | ------------------------ | -------------------------------- | ------------------------------ | --------------------------------------------------------------------------------------------------- |
| `GET`    | `/users`                 | —                                | `200 {users: IUserPublic[]}`   | —                                                                                                   |
| `POST`   | `/users/invite`          | `{email, role, displayName?}`    | `201 {user, inviteSent: true}` | `409 USER_EXISTS`, `400 INVALID_ROLE`, `400 INVALID_EMAIL`                                          |
| `PUT`    | `/users/:email`          | `{role?, status?, displayName?}` | `200 {user}`                   | `404 USER_NOT_FOUND`, `400 CANNOT_DEMOTE_LAST_OWNER`, `400 CANNOT_DISABLE_SELF`, `400 INVALID_ROLE` |
| `DELETE` | `/users/:email`          | —                                | `204`                          | `404 USER_NOT_FOUND`, `400 CANNOT_DELETE_LAST_OWNER`, `400 CANNOT_DELETE_SELF`                      |
| `POST`   | `/users/:email/reinvite` | `{}`                             | `200 {inviteSent: true}`       | `404 USER_NOT_FOUND`, `409 USER_ALREADY_ACTIVE`                                                     |

`IUserPublic` = `IUser` minus `passwordHash`. Stripped server-side by `userRepo.toPublic()`.

### Auth policy (slots into `/settings/:type`)

| Method | Path                    | Body                                                     | Role                                           |
| ------ | ----------------------- | -------------------------------------------------------- | ---------------------------------------------- |
| `GET`  | `/settings/auth-policy` | —                                                        | any logged-in (admin UI reads to render hints) |
| `PUT`  | `/settings/auth-policy` | `{minLength, checkBreachCorpus, notifyOnPasswordChange}` | OWNER                                          |

### Existing endpoints — role updates after the refactor

| Endpoint                                                                      | Today       | After refactor                     |
| ----------------------------------------------------------------------------- | ----------- | ---------------------------------- |
| `GET /products`, `/products/count`, `/products/stats`, `/products/:id`        | Public      | Public                             |
| `POST /products`, `PUT /products/:id`, `DELETE /products/:id`, `POST /prices` | MANAGER     | MANAGER                            |
| `GET /orders`, `/orders/:id`, `PUT /orders/:id`                               | FULFILLMENT | EMPLOYEE (rename)                  |
| `GET /settings/site\|process\|testimonials\|categories`                       | Public      | Public                             |
| `PUT /settings/site\|process\|testimonials\|categories`                       | MANAGER     | MANAGER                            |
| `GET\|PUT /settings/staff`                                                    | (varies)    | **REMOVED** — replaced by `/users` |
| `GET /notifications/stream`                                                   | FULFILLMENT | EMPLOYEE (rename)                  |
| `GET /whoami`                                                                 | always-on   | always-on, now reads cookie        |

### Cross-cutting write floor

`withAuthHandler` (the new sibling of `withStripeHandler`) enforces, in order:

1. CORS preflight (existing `handleCORS`)
2. `isAllowedOrigin`
3. Optional rate-limit bucket
4. `resolveCaller` — may be null
5. Per-route `requiredRole` floor (if set): caller present AND `roleSatisfies(caller.role, requiredRole)`
6. **Write-method floor:** if method ∈ {POST, PUT, DELETE, PATCH} AND caller present, require `rank(caller.role) >= rank(EMPLOYEE)` — VENDOR gets `403 FORBIDDEN_WRITE_ROLE`

`withStripeHandler` is refactored to delegate steps 1–6 to `withAuthHandler` and only add Stripe client initialization.

### New `IApiError` codes

```
ACCOUNT_DISABLED, BOOTSTRAP_DISABLED, CANNOT_DELETE_LAST_OWNER, CANNOT_DELETE_SELF,
CANNOT_DEMOTE_LAST_OWNER, CANNOT_DISABLE_SELF, EMAIL_MISMATCH, EXPIRED_TOKEN,
FORBIDDEN_WRITE_ROLE, INVALID_CREDENTIALS, INVALID_EMAIL, INVALID_POLICY,
INVALID_REFRESH, INVALID_ROLE, INVALID_TOKEN, NO_REFRESH, REUSED_REFRESH,
USER_ALREADY_ACTIVE, USER_EXISTS, USER_NOT_FOUND, WEAK_PASSWORD (carries {reasons: string[]})
```

### Rate-limit budgets

| Bucket                            | Limit | Window |
| --------------------------------- | ----- | ------ |
| `auth:login:<ip>:<email>`         | 5     | 15 min |
| `auth:request-reset:<ip>:<email>` | 3     | 1 hour |
| `auth:request-reset:<ip>`         | 20    | 1 hour |
| `auth:refresh:<ip>`               | 60    | 1 min  |
| `auth:bootstrap-owner:<ip>`       | 5     | 1 hour |
| `users:invite:<ownerEmail>`       | 30    | 1 hour |

---

## Worker components — file map

### `auth/repo/` — only files touching `env.CONTENT_KV` for auth data (D1 swap-point)

- **`userRepo.ts`** — `get`, `create`, `update`, `delete`, `list`, `countByRole`, `toPublic`, `rebuildIndex` (ops)
- **`inviteRepo.ts`** — `create`, `consume` (atomic get+delete), `invalidateForEmail`
- **`resetRepo.ts`** — identical shape, `IPasswordReset`
- **`refreshFamilyRepo.ts`** — `get`, `create` (evicts oldest at 11th), `rotate`, `delete`, `deleteAllForEmail`, `listForEmail`

### `auth/crypto/` — primitives, zero KV

- **`passwordHash.ts`** — `hash`, `verify` (parses iters from stored string)
- **`jwt.ts`** — `signAccess`, `signRefresh`, `verify(token, secret, expectedType)` returns null on any failure
- **`tokens.ts`** — `generateUrlSafeToken(bytes = 32)`

### `auth/policy/`

- **`policyRepo.ts`** — `get` (30s isolate cache), `put` (enforces `minLength >= 8` floor)
- **`validatePassword.ts`** — length + denylist + optional HIBP k-anonymity (fail-open on network error)

### `auth/emails/`

- **`from.ts`** — `authFromAddress(env, kind)` resolves per-template `from` address
- **`sendInvite`**, **`sendReset`**, **`sendPasswordChanged`** — render + send via existing `env.EMAIL.send()` / Formspark pipeline; errors logged, not bubbled

### `auth/handlers/`

One file per route from the API surface above. Each handler is small (15–60 lines); `withAuthHandler` owns rate-limiting, role checks, envelope shaping, error mapping.

**Non-obvious handler details:**

- **`login`** — rate-limit → user lookup → constant-time password verify → status check → new refresh family → cookies → `lastLoginAt`/`lastLoginIp` (truncated)
- **`refresh`** — rate-limit → parse `bea_rt` → JWT-verify with `expectedType: 'refresh'` → load family → if `jti !== currentJti` **destroy family** and 401 → rotate → new cookies
- **`acceptInvite`** — consume invite atomically → check existing user not `ACTIVE` → validate password → hash → flip to `ACTIVE` → new family → cookies
- **`bootstrapOwner`** — `countByRole(OWNER) === 0` AND `email === BOOTSTRAP_OWNER_EMAIL`; idempotent re-trigger of invite if an `INVITED` OWNER already exists with that email

### `auth/resolveCaller.ts` — rewritten

Three-path chain, in order:

1. **Cookie** — read `bea_at` → `jwt.verify(token, secret, 'access')` → hydrate caller from claims. No KV read per-request. Status checks (DISABLED) happen at login/refresh time; worst case is bounded by the 1h access TTL.
2. **Bearer** — unchanged: `Authorization: Bearer <API_SECRET_KEY>` → `{email: 'ci@service', role: OWNER, via: 'bearer'}`
3. **Dev bypass** — `ENVIRONMENT === 'development'` + `X-Dev-Email` → `userRepo.get(email)` from the local users collection (not the old `staff` key) → `via: 'dev'`

`via` enum becomes `'cookie' | 'bearer' | 'dev'`. JWKS cache, `jose` import, `Cf-Access-Jwt-Assertion` branch, and `getStaffList` all deleted.

### `utils/withAuthHandler.ts` — new sibling of `withStripeHandler`

Signature: `withAuthHandler<T>({ requiredRole?, rateLimit?, handler })`. Steps 1–6 above on every request. `withStripeHandler` delegates to it and only adds Stripe client init.

### `router.ts` — changes

- Add contiguous `/auth/*` and `/users/*` block
- Update `EStaffRole.FULFILLMENT` → `EStaffRole.EMPLOYEE` on `/orders/*` and `/notifications/stream`
- Remove `/settings/staff` matcher
- Add `auth-policy` to the `/settings/:type` accepted-types set

### Wrangler bindings & secrets

**Added:** `JWT_SIGNING_SECRET` (32 random bytes base64), `BOOTSTRAP_OWNER_EMAIL`, optional `AUTH_FROM_ADDRESS`.

**Removed:** `CF_ACCESS_TEAM_DOMAIN`, `CF_ACCESS_AUD`, `OWNER_EMAILS`.

**Unchanged:** `STRIPE_*`, `ALLOWED_ORIGINS`, `API_SECRET_KEY`, `EMAIL`, KV namespaces, DO bindings.

### Existing files touched

| File                                        | Change                                                                                                   |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `services/src/utils/resolveCaller.ts`       | Rewritten                                                                                                |
| `services/src/utils/withStripeHandler.ts`   | Delegates auth to `withAuthHandler`, adds write-method floor                                             |
| `services/src/router.ts`                    | New routes, role rename, staff removal, auth-policy addition                                             |
| `services/src/settings/settings-handler.ts` | Remove staff branch; add `auth-policy` branch                                                            |
| `services/package.json`                     | Remove `jose`                                                                                            |
| `services/.dev.vars.example`                | Document new secrets, remove CF Access secrets                                                           |
| `shared/src/staff.ts`                       | Rename `FULFILLMENT` → `EMPLOYEE`; add `VENDOR`; export `EUserStatus`                                    |
| `shared/src/auth.ts`                        | **New** — `IUser`, `IUserPublic`, `IInvite`, `IPasswordReset`, `IRefreshFamily`, `IAuthPolicy` + schemas |
| `shared/src/api.ts`                         | Add new `IApiError` codes + `httpStatusFor` mappings                                                     |
| `shared/src/index.ts`                       | Re-export `auth.ts`                                                                                      |
| `services/test/**`                          | New `auth/` test suites; existing tests updated for `EMPLOYEE` rename                                    |

---

## Admin app components

### New file layout

```
admin/src/
├── pages/
│   ├── LoginPage.tsx                  # email + password
│   ├── AcceptInvitePage.tsx           # set password from invite token
│   ├── RequestResetPage.tsx           # "forgot password"
│   ├── CompleteResetPage.tsx          # set new password from reset token
│   ├── BootstrapOwnerPage.tsx         # first-OWNER claim
│   └── settings/
│       ├── UsersTab.tsx               # REPLACES StaffTab.tsx
│       └── SecurityTab.tsx            # NEW — password policy knobs
├── components/auth/
│   ├── RequireCaller.tsx              # CHANGED — redirects to /login on null caller
│   ├── LoginForm.tsx
│   ├── PasswordField.tsx
│   ├── ChangePasswordModal.tsx
│   └── UserMenu.tsx                   # in AdminNavbar: name, change password, logout
├── hooks/
│   ├── useCaller.ts                   # CHANGED
│   └── useAuthActions.ts              # NEW — login/logout/refresh/changePassword wrappers
├── store/
│   └── authSlice.ts                   # CHANGED — login/logout/refresh thunks + refreshInFlight mutex
├── utils/
│   ├── api.ts                         # CHANGED — /auth/* and /users/* + 401-refresh interceptor
│   └── authPolicy.ts                  # NEW — client-side mirror of validatePassword (UX only)
└── App.tsx                            # CHANGED — adds /login, /accept-invite, /reset, /bootstrap
```

### Routing

Public routes: `/login`, `/accept-invite`, `/request-reset`, `/reset`, `/bootstrap`. Everything else is private, gated by `RequireCaller`.

`RequireCaller` becomes a redirector:

- `loading|idle` → spinner (unchanged)
- `error` → existing retry UI (unchanged)
- `succeeded && caller === null` → `<Navigate to="/login" state={{from: location}} replace />`
- `succeeded && caller` → render children

`BootstrapGuard` wraps `LoginPage`: on mount it checks `bootstrapAvailable` (returned by `/whoami` when no caller AND zero users exist) → redirects to `/bootstrap` if so.

OWNER-only sub-routes use a `<RoleGate role={EStaffRole.OWNER}>` component (Users tab, Security tab).

### `authSlice` — new state

```ts
{
  caller, status, error,
  loginInFlight: boolean,
  logoutInFlight: boolean,
  refreshInFlight: boolean,   // doubles as 401-interceptor mutex
}
```

Thunks: `login`, `logout`, `refresh`, `changePassword`. `logout`/failed-`refresh` reset caller to null + status to succeeded → `RequireCaller` redirects to `/login`.

### `api.ts` — 401 interceptor

On any 401 response:

1. Skip if request URL is `/auth/*` (no recursion)
2. Skip if `refreshInFlight` is already true → queue a promise that resolves when the in-flight refresh finishes
3. Dispatch `refresh()`, await, **re-issue the original request**
4. On refresh failure: dispatch `resetAuth`, let original error bubble → `RequireCaller` redirects

`withCredentials: true` is already set; the existing `cookieScope.ts` eTLD+1 warning becomes a **blocking** deployment configuration error.

### Pages

- **`LoginPage`** — email + password, autofocus. `INVALID_CREDENTIALS` and `ACCOUNT_DISABLED` both surface as generic "Invalid email or password". `RATE_LIMITED` shows retry-after copy. On success: `navigate(state.from ?? '/dashboard', {replace: true})`. No sign-up link. `<Link to="/request-reset">Forgot your password?</Link>`.
- **`AcceptInvitePage`** / **`CompleteResetPage`** — read `?token=`, fetch policy on mount to render hints, two fields (new + confirm), submit. `WEAK_PASSWORD` shows server-returned `reasons[]` inline.
- **`RequestResetPage`** — one field; always shows "If an account with that email exists, we've sent a reset link." regardless of outcome.
- **`BootstrapOwnerPage`** — one field, hint "must match `BOOTSTRAP_OWNER_EMAIL`"; submit → "Check your email for the setup link." `BootstrapGuard` makes the page inaccessible once any OWNER exists.

### Navbar + self-service

`UserMenu` in `AdminNavbar` (top-right): display-name (inline edit → `PUT /users/me`), "Change password" → `ChangePasswordModal`, divider, "Log out". `ChangePasswordModal` validates against the live policy; on success shows "Password updated. Other sessions have been logged out." (the current session keeps working — server contract).

### Users tab

Table columns: Display name, Email, Role, Status, Last login, Actions. Inline role/status edits → `PUT /users/:email`. Per-row "Resend invite" (when `INVITED`) and "Delete" (with confirm; last-OWNER and self guards client-side, server-enforced too). "Invite user" form: email + role + optional display name → `POST /users/invite`. Each change is its own API call — no "Save the list" footgun.

### Security tab

Three controls bound to `IAuthPolicy`: number input for `minLength` (helper "Must be at least 8"), toggle for `checkBreachCorpus` (with HIBP k-anonymity explanation), toggle for `notifyOnPasswordChange`. OWNER-only via `RoleGate`.

### What gets deleted from admin

- `admin/src/pages/settings/StaffTab.tsx`
- `X-Dev-Email` interceptor in `admin/src/utils/api.ts`
- `VITE_DEV_EMAIL` env var (ignored by the SPA going forward)
- "Access required. Sign in via Cloudflare Access to continue." copy in `RequireCaller`

### Storefront (`web/`)

**Zero changes.**

---

## Migration / cutover

### Strategy

Single coordinated deploy — worker, admin SPA, and CF Access policy all change together. No staged interleaving (we agreed on greenfield cut in Q5).

**Deploy order (single PR):**

1. CI runs all tests
2. Deploy `services` worker first (new routes additive; old `/settings/staff` returns 404)
3. Deploy `admin` Pages site second
4. **Manual one-time step:** owner disables or deletes the Cloudflare Access app in front of the admin Pages site (documented in `SETUP.md`)

### Pre-deploy: data cleanup

Stale `staff` KV record is harmless after deploy (nothing reads it). `SETUP.md` notes the optional tidy-up:

```bash
npx wrangler kv key delete --binding=CONTENT_KV "staff"
```

### Post-deploy: bootstrap walkthrough

1. Owner sets Wrangler secrets: `JWT_SIGNING_SECRET`, `BOOTSTRAP_OWNER_EMAIL`; removes `CF_ACCESS_*` and `OWNER_EMAILS`
2. CI deploys
3. Owner disables CF Access app
4. Owner visits admin URL → `BootstrapGuard` → `/bootstrap`
5. Owner submits email matching `BOOTSTRAP_OWNER_EMAIL` → worker creates `INVITED` OWNER + sends invite email
6. Owner clicks link → `/accept-invite` → sets password (≥ 12 chars, breach-checked)
7. Owner is logged in as `ACTIVE` OWNER
8. Settings → Users → invite Manager/Employee/Vendor as needed
9. Each invitee accepts via email link

After step 7, `/bootstrap` becomes inert (`countByRole(OWNER) > 0`).

### Documentation updates

| File                 | Change                                                                                                                                              |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SETUP.md`           | Delete Step 10 (CF Access). New Step 10: "Set auth secrets and bootstrap your OWNER account" — three Wrangler commands + the email-flow walkthrough |
| `README.md`          | Required secrets table: remove `CF_ACCESS_*` + `OWNER_EMAILS`; add `JWT_SIGNING_SECRET`, `BOOTSTRAP_OWNER_EMAIL`                                    |
| `AGENTS.md` (root)   | Rewrite "Admin App Specifics → Auth"; remove "Staff list" bullet; add "Users collection" bullet                                                     |
| `services/AGENTS.md` | Rewrite Auth section (Plan 3 → Plan 4 — in-app users); document new endpoints, trust chain, `via` values                                            |
| `services/API.md`    | Add `/auth/*` and `/users/*` sections; remove `/settings/staff`; add `auth-policy`                                                                  |
| `services/SOURCE.md` | New `auth/` module index                                                                                                                            |
| `admin/README.md`    | Note new login flow; `VITE_DEV_EMAIL` ignored by SPA                                                                                                |

### Rollback plan

Single-commit revert + redeploy. Wrinkles:

1. **Don't delete old Wrangler secrets immediately** — keep `CF_ACCESS_*` + `OWNER_EMAILS` for ~1 week post-cutover so a revert works without re-secrets
2. **Don't delete the CF Access app immediately** — just disable it; re-enable is a single click
3. **New `user:*` KV records** harmless after rollback (old worker doesn't read them); a forward redeploy resumes where it left off (users who set passwords in the failed window need to reset)
4. **Cookies** expire on their own (`bea_at` 1h, `bea_rt` 30d); no active cleanup

---

## Testing strategy

### Worker unit tests (`services/test/auth/`)

- `crypto/passwordHash.spec.ts` — hash round-trip, verify rejects wrong password, iters parsed from stored string
- `crypto/jwt.spec.ts` — happy path, expired, wrong type, bad signature, malformed → null
- `repo/userRepo.spec.ts` — CRUD, index maintained, `countByRole`, `toPublic` strips hash
- `repo/refreshFamilyRepo.spec.ts` — rotate updates `currentJti`, 11th evicts oldest, `deleteAllForEmail`
- `policy/validatePassword.spec.ts` — length, denylist, breach-check hit/miss/network-error (fail-open)
- `handlers/login.spec.ts` — happy, bad password (generic 401), disabled (still generic), rate-limit, one family per login
- `handlers/refresh.spec.ts` — rotation, replay destroys family, missing cookie, expired
- `handlers/acceptInvite.spec.ts` — happy, expired, weak password surfaces reasons, used token
- `handlers/bootstrapOwner.spec.ts` — happy, mismatch, inert after first OWNER
- `handlers/inviteUser.spec.ts`, `updateUser.spec.ts` — duplicates, last-OWNER guard, self-disable guard
- `resolveCaller.spec.ts` — cookie/bearer/dev paths, dev ignored in prod
- `withAuthHandler.spec.ts` — VENDOR read but no write, MANAGER write OK, anonymous 401

### Worker integration tests (extend existing `index.spec.ts`)

- Full login round trip with cookie → protected route
- Full refresh round trip with expired access token
- Full invite + accept round trip

### Admin tests (`admin/src/`)

- `LoginPage` happy/errors, redirect-after-login via `state.from`
- `RequireCaller` four-state matrix
- `api` interceptor: refresh succeeds (retry), refresh fails (resetAuth), `/auth/*` skip, concurrent 401s coalesce
- `UsersTab` invite/edit/disable/delete + guards
- `SecurityTab` policy load + save + floor enforcement
- `UserMenu` change-password modal, logout
- `useCaller` four state transitions

### E2E (`admin/E2E-TESTING-PLAN.md`)

New "Auth flows" section with three Playwright scenarios:

1. Bootstrap a fresh worker (empty CONTENT_KV) → `/bootstrap` → land logged in as OWNER
2. As OWNER, invite MANAGER → click invite link → set password → reach `/dashboard` without Users tab visibility
3. Log out → wrong password 5× → rate-limit message → (mocked clock) → log back in

### CI

No new pipeline steps. New tests run via existing matrix. Added safety: `services/test/contract/secrets.spec.ts` asserting `JWT_SIGNING_SECRET` is present and ≥ 32 bytes when base64-decoded — misconfigured deploys fail loudly.

### Acceptance criteria

- Fresh deploy with empty KV → `/bootstrap` → dashboard, end-to-end
- Invited MANAGER accepts → can log in
- VENDOR logs in → reads all list pages → every write returns `403 FORBIDDEN_WRITE_ROLE`
- OWNER attempting last-OWNER demotion/deletion/self-disable → server-enforced 400
- Logged-in session survives access-token expiry (transparent refresh)
- Refresh-token replay → family destroyed → forced re-login
- 6th login attempt in 15 min → 429 with `Retry-After`
- HIBP unreachable with breach-check on → password set still succeeds (fail-open)
- `VITE_DEV_EMAIL` set in admin `.env` is ignored by the SPA
- All six docs (root `AGENTS.md`, `SETUP.md`, `README.md`, `services/AGENTS.md`, `services/API.md`, `services/SOURCE.md`) describe the new world with no stale CF-Access references

---

## Future work (explicitly out of scope)

- **D1 migration** — `repo/` layer is the swap-point. One-time migration script iterates `KV.list({prefix:"user:"})` and `INSERT`s into D1; `schemaVersion: 1` on each record makes branching explicit. Worker code outside `repo/` doesn't change.
- **MFA / passkeys** — add a `mfaSecret` field to `IUser` (TOTP) and a `webauthnCredentials` array; gate behind an `auth-policy.requireMfa` toggle.
- **Audit log** — append-only `audit:<userEmail>:<timestamp>` records on every user-management write; new "Audit" tab for OWNER.
- **Active sessions view** — Settings → Sessions: list refresh families with UA/IP/last-refreshed and a "Revoke" action.
- **SSO** — could be re-added as an _additional_ trust path in `resolveCaller` (e.g. `via: 'oidc'`) without removing the cookie path.
