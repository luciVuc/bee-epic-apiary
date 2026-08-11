# Phase 8 — Expanded Task Detail

> **Companion to** `docs/superpowers/plans/2026-06-30-admin-auth-refactor.md` **Phase 8** (summarized there).
> **Spec:** `docs/superpowers/specs/2026-06-29-admin-auth-refactor-design.md`
> **Preceding phases:** Phases 1–7 are already complete on `feat/admin-auth-refactor` (see git log).

## Goal

Add the user-management and auth-policy handlers on the worker so that an authenticated OWNER can CRUD users through the admin SPA, and read/write the password policy. Every handler is one file under `services/src/auth/handlers/`, one spec under `services/test/auth/handlers/`, and is wired into `router.ts`. Adds `POST /users/invite`, `PUT /users/:email`, `DELETE /users/:email`, `POST /users/:email/reinvite`, `GET /users`, `PUT /users/me`, and `GET|PUT /settings/auth-policy`.

## Conventions inherited from Phase 7

All handlers follow the pattern established by `services/src/auth/handlers/bootstrapOwner.ts` and its siblings:

- Body validated with a Zod schema declared at module scope
- Envelope: success → `jsonOk(data, origin, env)`, failure → `jsonErr({code, ...}, origin, env)`
- Rate-limit **inside the handler** with a dedicated bucket key (not the wrapper's generic bucket), computed before body parse when the bucket is per-IP
- Emails sent via existing senders in `services/src/auth/emails/`; SMTP failures are logged, not bubbled
- IP truncated via `truncateIp()` before persistence (from `services/src/auth/policy/truncateIp.ts`)
- `EMAIL` binding is optional — check `env.EMAIL` before calling send
- Handler files export the default `{ fetch: withAuthHandler(...) } satisfies ExportedHandler<Env>` shape
- Specs use the `makeKv()` + `makeEnv()` helpers pattern from `services/test/auth/handlers/bootstrapOwner.spec.ts`

Repo APIs currently available:

| Module                        | Exports                                                                                                     |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `auth/repo/userRepo`          | `getUser`, `createUser`, `updateUser`, `deleteUser`, `listUsers`, `countByRole`, `toPublic`, `rebuildIndex` |
| `auth/repo/inviteRepo`        | `createInvite`, `getInvite`, `consumeInvite`, `invalidateForEmail`                                          |
| `auth/repo/resetRepo`         | `createReset`, `getReset`, `consumeReset`, `invalidateForEmail`                                             |
| `auth/repo/refreshFamilyRepo` | `getFamily`, `createFamily`, `rotateFamily`, `deleteFamily`, `deleteAllForEmail`, `listForEmail`            |
| `auth/repo/policyRepo`        | `getPolicy`, `putPolicy`, `_clearCacheForTests`                                                             |
| `auth/crypto/*`               | `hashPassword`, `verifyPassword`, `signJwt`, `verifyJwt`, `generateUrlSafeToken`                            |
| `auth/emails/*`               | `sendInvite`, `sendReset`, `sendPasswordChanged`, `authFromAddress`                                         |
| `auth/policy/*`               | `validatePassword`, `truncateIp`, `PASSWORD_DENYLIST`                                                       |
| `auth/cookies`                | `setSessionCookies`, `clearSessionCookies`, `readCookie`, `ACCESS_COOKIE`, `REFRESH_COOKIE`                 |
| `utils` (barrel)              | `withAuthHandler`, `jsonOk`, `jsonErr`, `RateLimiter`, `resolveCaller`, `roleSatisfies`                     |

## Reconciliation notes vs. the spec

- **Env var name.** Spec says `BOOTSTRAP_OWNER_EMAIL` (singular) but the actual worker binding used by the shipped `bootstrapOwner` handler is `OWNER_EMAILS` (comma-separated). Phase 8 keeps that convention — nothing in Phase 8 references a bootstrap env var directly, so the reconciliation is inherited, not repeated.
- **New rate-limit buckets.** The spec table lists `users:invite:<ownerEmail>` at 30/hr. Phase 8 uses this exact key format.
- **`updateMe`.** Spec §admin/API says `PUT /users/me` accepts only `{displayName}`. Phase 8 respects that — password changes go through the already-shipped `POST /auth/change-password`; role/status edits are OWNER-only via `PUT /users/:email`.

---

## Task 8.1 — `listUsers` handler

**Endpoint:** `GET /users` → `200 {users: IUserPublic[]}`
**Role floor:** `OWNER` via `withAuthHandler({ requiredRole: OWNER })`.
**Files:**

- Create: `services/src/auth/handlers/listUsers.ts`
- Create: `services/test/auth/handlers/listUsers.spec.ts`

- [ ] **Step 1: Write the failing test**

Create `services/test/auth/handlers/listUsers.spec.ts` modeled on `bootstrapOwner.spec.ts` for the `makeKv()`/`makeEnv()` helpers. Test cases:

1. Anonymous request → 401 `UNAUTHORIZED`
2. VENDOR-role caller → 403 `FORBIDDEN` with `requiredRole: 'OWNER'`
3. MANAGER-role caller → 403 `FORBIDDEN` with `requiredRole: 'OWNER'`
4. OWNER caller → 200 with `data.users` array containing every user record, `passwordHash` stripped
5. OWNER caller against empty KV → 200 with `data.users: []`
6. OWNER caller when `listUsers` returns records including DISABLED users → those records ARE included in the payload (spec: list includes all lifecycle states; the admin UI decides how to display them)
7. Ordering is stable: sorted alphabetically by lowercase email — asserted via response body order

Auth is exercised by injecting a caller through `resolveCaller`. Reuse the existing helper approach in `bootstrapOwner.spec.ts` (build a request with a valid `bea_at` cookie via `signJwt`, or dev-bypass with `X-Dev-Email` + `ENVIRONMENT=development`).

- [ ] **Step 2: Run test to verify it fails**

Run: `cd services && npm test -- listUsers`
Expected: fail — module not found.

- [ ] **Step 3: Create `services/src/auth/handlers/listUsers.ts`**

```ts
/**
 * GET /users — return every user record (public shape, no passwordHash).
 *
 * OWNER-only. The response is sorted by lowercase email for stable UI
 * rendering (the KV index is already sorted by userRepo.writeIndex, but we
 * re-sort here defensively so any recovery/rebuild path can't hand the UI a
 * jittery order).
 */
import { EStaffRole, type IUserPublic } from "@bee-epic/shared";
import { jsonOk, withAuthHandler } from "../../utils";
import { listUsers, toPublic } from "../repo/userRepo";

async function handleListUsers(
  _request: Request,
  env: Env,
  origin: string | null,
): Promise<Response> {
  const users = await listUsers(env);
  const publicUsers: IUserPublic[] = users
    .map(toPublic)
    .sort((a, b) => a.email.localeCompare(b.email));
  return jsonOk({ users: publicUsers }, origin, env);
}

export default {
  fetch: withAuthHandler("GET", handleListUsers, {
    requiredRole: EStaffRole.OWNER,
  }),
} satisfies ExportedHandler<Env>;
```

- [ ] **Step 4: Run tests + lint**

Run: `cd services && npm test -- listUsers && npm run lint`
Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add services/src/auth/handlers/listUsers.ts services/test/auth/handlers/listUsers.spec.ts
git commit -m "feat(auth): add GET /users handler (OWNER-only) for user list"
```

---

## Task 8.2 — `inviteUser` handler

**Endpoint:** `POST /users/invite` → `201 {user, inviteSent: true}`
**Role floor:** `OWNER`.
**Rate limit:** `users:invite:<ownerEmail>` — 30 per hour.
**Body:** `{email: string, role: EStaffRole, displayName?: string}`
**Files:**

- Create: `services/src/auth/handlers/inviteUser.ts`
- Create: `services/test/auth/handlers/inviteUser.spec.ts`

Non-obvious behaviour to encode:

- Email is lowercased server-side before any lookup or storage.
- Role must be one of `OWNER | MANAGER | EMPLOYEE | VENDOR`. Anything else → 400 `INVALID_ROLE`.
- Duplicate detection is against the **user record**, not against outstanding invites. If a user exists in any state → 409 `USER_EXISTS`. (Re-inviting an INVITED user is task 8.5 `reinviteUser`, not this handler.)
- displayName defaults to the local-part of the email if omitted, preserving the pattern used by `bootstrapOwner`.
- Fresh `INVITED` user record is created BEFORE the invite is minted — same order as `bootstrapOwner`. If invite creation fails after the user is created, the user record stays as INVITED with no live invite; task 8.5 covers the resend path.
- `sendInvite` failure is logged, not bubbled — the invite record is already in KV.
- Response is `201`, not `200` — new resource created. `jsonOk` defaults to 200; pass `status: 201` explicitly (`jsonResponse({ ok: true, data: ... }, 201, origin, env)`). Confirm `jsonOk` signature accepts status override; if not, use `jsonResponse` directly like `jsonResponse({ ok: true, data: {...} }, 201, origin, env)`.

- [ ] **Step 1: Write the failing test**

Test cases:

1. Anonymous → 401 `UNAUTHORIZED`
2. MANAGER → 403 `FORBIDDEN`
3. OWNER with duplicate email → 409 `USER_EXISTS`
4. OWNER with invalid role string → 400 `VALIDATION_FAILED` (Zod) OR `INVALID_ROLE` (post-parse — choose one and pin the assertion)
5. OWNER happy path → 201 with `{user: IUserPublic, inviteSent: true}`, user record present in KV, invite record present in KV, `env.EMAIL.send` called once
6. OWNER when `env.EMAIL` is undefined → still 201, no crash, no `inviteSent: false` (we cannot know delivery status)
7. Rate-limit trip: 31st invite in an hour returns 429 with `retryAfter`

- [ ] **Step 2: Run test to verify it fails**

Run: `cd services && npm test -- inviteUser`
Expected: fail — module not found.

- [ ] **Step 3: Create `services/src/auth/handlers/inviteUser.ts`**

Skeleton (subagent to complete with the full JSDoc block matching sibling handlers):

```ts
/** POST /users/invite — OWNER-only. Creates an INVITED user + mints + emails an invite. */
import { z } from "zod";
import {
  EStaffRole,
  EUserStatus,
  INVITE_TTL_MS,
  StaffRoleSchema,
  toUserPublic,
  type IInvite,
  type IUser,
} from "@bee-epic/shared";
import {
  jsonErr,
  jsonResponse,
  RateLimiter,
  withAuthHandler,
} from "../../utils";
import { generateUrlSafeToken } from "../crypto/tokens";
import { sendInvite } from "../emails/sendInvite";
import { createInvite } from "../repo/inviteRepo";
import { createUser, getUser } from "../repo/userRepo";

const InviteBodySchema = z.object({
  email: z
    .string()
    .min(1)
    .transform((s) => s.toLowerCase().trim()),
  role: StaffRoleSchema,
  displayName: z.string().min(1).max(120).optional(),
});

const PER_OWNER_MAX = 30;
const WINDOW_SECONDS = 60 * 60;

async function handleInviteUser(
  request: Request,
  env: Env,
  origin: string | null,
  caller?: import("../../utils/resolveCaller").ICaller,
): Promise<Response> {
  // caller is guaranteed present by withAuthHandler({requiredRole: OWNER}).
  if (!caller) return jsonErr({ code: "UNAUTHORIZED" }, origin, env);

  if (env.RATE_LIMITER) {
    const limiter = new RateLimiter(env.RATE_LIMITER, {
      maxRequests: PER_OWNER_MAX,
      windowSeconds: WINDOW_SECONDS,
    });
    const result = await limiter.check(
      `users:invite:${caller.email.toLowerCase()}`,
    );
    if (!result.allowed) {
      return jsonErr(
        { code: "RATE_LIMITED", retryAfter: result.resetTime },
        origin,
        env,
      );
    }
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return jsonErr(
      { code: "VALIDATION_FAILED", fields: { body: "Invalid JSON" } },
      origin,
      env,
    );
  }
  const parsed = InviteBodySchema.safeParse(raw);
  if (!parsed.success) {
    const flat = parsed.error.flatten().fieldErrors as Record<
      string,
      string[] | undefined
    >;
    const fields: Record<string, string> = {};
    for (const [k, v] of Object.entries(flat)) {
      if (v && v.length > 0) fields[k] = v[0];
    }
    return jsonErr({ code: "VALIDATION_FAILED", fields }, origin, env);
  }
  const { email, role, displayName } = parsed.data;

  const existing = await getUser(env, email);
  if (existing) {
    return jsonErr({ code: "USER_EXISTS" }, origin, env);
  }

  const now = Date.now();
  const user: IUser = {
    schemaVersion: 1,
    email,
    displayName: displayName ?? email.split("@")[0],
    role,
    status: EUserStatus.INVITED,
    passwordHash: null,
    createdAt: now,
    updatedAt: now,
    lastLoginAt: null,
    lastLoginIp: null,
  };
  await createUser(env, user);

  const invite: IInvite = {
    schemaVersion: 1,
    token: generateUrlSafeToken(32),
    email,
    role,
    displayName: user.displayName,
    invitedBy: caller.email,
    createdAt: now,
    expiresAt: now + INVITE_TTL_MS,
  };
  await createInvite(env, invite);

  try {
    if (env.EMAIL) await sendInvite(env, invite);
  } catch (err) {
    console.error("[inviteUser] sendInvite failed", err);
  }

  return jsonResponse(
    { ok: true, data: { user: toUserPublic(user), inviteSent: true } },
    201,
    origin,
    env,
  );
}

export default {
  fetch: withAuthHandler("POST", handleInviteUser, {
    requiredRole: EStaffRole.OWNER,
  }),
} satisfies ExportedHandler<Env>;
```

- [ ] **Step 4: Run tests + lint**

Run: `cd services && npm test -- inviteUser && npm run lint`
Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add services/src/auth/handlers/inviteUser.ts services/test/auth/handlers/inviteUser.spec.ts
git commit -m "feat(auth): add POST /users/invite handler (OWNER-only)"
```

---

## Task 8.3 — `updateUser` handler

**Endpoint:** `PUT /users/:email` → `200 {user: IUserPublic}`
**Role floor:** `OWNER`.
**Body:** `{role?: EStaffRole, status?: EUserStatus, displayName?: string}` (all optional)
**Path param:** `:email` — URL-decoded, lowercased server-side.
**Files:**

- Create: `services/src/auth/handlers/updateUser.ts`
- Create: `services/test/auth/handlers/updateUser.spec.ts`

Guards to encode:

1. **User exists** → 404 `USER_NOT_FOUND` if missing.
2. **Last-OWNER demotion guard:** if the patch changes `role` away from OWNER AND `countByRole(OWNER) === 1` AND the target is that OWNER → 400 `CANNOT_DEMOTE_LAST_OWNER`.
3. **Last-OWNER disable guard:** if the patch sets `status: DISABLED` AND `countByRole(OWNER) === 1` AND the target is that OWNER → 400 `CANNOT_DEMOTE_LAST_OWNER` (spec surfaces the same code for both cases; keep parity).
4. **Self-disable guard:** if `caller.email === target.email` AND patch sets `status: DISABLED` → 400 `CANNOT_DISABLE_SELF`.
5. **Self-demotion is allowed** if not the last OWNER (a co-owner may demote themselves).
6. **Role transition to DISABLED via `status` is not the same as removing.** The user remains listed. `deleteUser` (task 8.4) is the terminal action.
7. **Side effect on disable:** transitioning any user to `DISABLED` invalidates their refresh families (`deleteAllForEmail`) and their outstanding invite tokens (`inviteRepo.invalidateForEmail`) — the account can't come back to life on its own after being locked. This is deliberate: today's session survives until access-cookie expiry, subsequent /refresh will fail because their family is gone.
8. **Side effect on role change:** the cached role in an outstanding access cookie (`bea_at`) may be stale until it expires (max 1h). Documented; not fixed here.

- [ ] **Step 1: Write the failing test**

Test cases:

1. Non-OWNER caller → 403 `FORBIDDEN`
2. OWNER updates non-existent email → 404 `USER_NOT_FOUND`
3. OWNER changes another user's `displayName` → 200, response reflects change, `updatedAt` bumped
4. OWNER changes another user's `role` from MANAGER to EMPLOYEE → 200
5. OWNER attempts to demote the sole OWNER (themselves or another) → 400 `CANNOT_DEMOTE_LAST_OWNER`
6. Two OWNERs exist; OWNER A demotes OWNER B → 200
7. OWNER attempts to DISABLE themselves → 400 `CANNOT_DISABLE_SELF`
8. OWNER disables another user → 200, `deleteAllForEmail` called for that user, `inviteRepo.invalidateForEmail` called
9. OWNER disables the sole OWNER (someone else) → 400 `CANNOT_DEMOTE_LAST_OWNER`
10. Empty body / no patchable fields → 400 `VALIDATION_FAILED` (Zod refine — at least one of role/status/displayName)
11. Invalid role value → 400 `VALIDATION_FAILED`

- [ ] **Step 2: Run test to verify it fails**

- [ ] **Step 3: Implement**

Structure follows the same pattern as `bootstrapOwner.ts`; parse email from URL path, load user, evaluate guards, compute patch, delegate to `updateUser` in userRepo, invoke side effects, return `toPublic(updated)`.

Import both `invalidateForEmail as invalidateInvitesForEmail` from `inviteRepo` and `deleteAllForEmail` from `refreshFamilyRepo` — the name collision is real (both repos have `invalidateForEmail` shape but the family repo calls it `deleteAllForEmail`).

- [ ] **Step 4: Run tests + lint**

- [ ] **Step 5: Commit**

```bash
git add services/src/auth/handlers/updateUser.ts services/test/auth/handlers/updateUser.spec.ts
git commit -m "feat(auth): add PUT /users/:email handler with last-OWNER + self-disable guards"
```

---

## Task 8.4 — `deleteUser` handler

**Endpoint:** `DELETE /users/:email` → `204`
**Role floor:** `OWNER`.
**Files:**

- Create: `services/src/auth/handlers/deleteUser.ts`
- Create: `services/test/auth/handlers/deleteUser.spec.ts`

Guards:

1. 404 `USER_NOT_FOUND` if the target doesn't exist.
2. 400 `CANNOT_DELETE_SELF` if `caller.email === target.email`.
3. 400 `CANNOT_DELETE_LAST_OWNER` if target is the sole OWNER (count of ACTIVE+INVITED OWNERs is 1).

Side effects:

- `refreshFamilyRepo.deleteAllForEmail(target.email)` — session dies
- `inviteRepo.invalidateForEmail(target.email)` — any outstanding invite is dead
- `resetRepo.invalidateForEmail(target.email)` — outstanding reset tokens killed
- `userRepo.deleteUser(target.email)` — record + index entry gone

Response: 204 No Content. Use `jsonResponse({ ok: true, data: null }, 204, ...)` — matches the pattern used by `logout`.

- [ ] **Step 1: Failing tests**
- [ ] **Step 2: Verify fail**
- [ ] **Step 3: Implement**
- [ ] **Step 4: Green**
- [ ] **Step 5: Commit**

```bash
git commit -m "feat(auth): add DELETE /users/:email with last-OWNER + self guards"
```

---

## Task 8.5 — `reinviteUser` handler

**Endpoint:** `POST /users/:email/reinvite` → `200 {inviteSent: true}`
**Role floor:** `OWNER`.
**Files:**

- Create: `services/src/auth/handlers/reinviteUser.ts`
- Create: `services/test/auth/handlers/reinviteUser.spec.ts`

Behaviour:

1. Load user; 404 `USER_NOT_FOUND` if missing.
2. If `user.status === ACTIVE` → 409 `USER_ALREADY_ACTIVE`.
3. If `user.status === DISABLED` → 400 `INVALID_ROLE` is WRONG — this needs a code. Options: reuse `USER_ALREADY_ACTIVE` for "not resendable" is misleading; use `VALIDATION_FAILED { fields: { status: "user is disabled" } }` OR extend the error union. **Decision for this task:** the spec allows only re-inviting INVITED users (§API surface). A DISABLED user is a hard 400 `USER_ALREADY_ACTIVE` — wrong. Instead, return **400 `INVALID_ROLE`** — also wrong. The cleanest fit is **404 `USER_NOT_FOUND`** — pretending it's not there is misleading. **Chosen resolution:** the plan doc adds no new error code here; instead, we widen the semantics of `USER_ALREADY_ACTIVE` at this endpoint to mean "user not in an invitable state" (INVITED is the only invitable state). Handler comment must call this out. Alternative: reuse `VALIDATION_FAILED` with `{status: 'DISABLED'}`. Either is defensible; pick one at implementation time and document it in the handler docstring.
4. Otherwise (INVITED): `inviteRepo.invalidateForEmail(email)`, mint a fresh invite, `sendInvite`, return.
5. Fire-and-forget email like other handlers.

- [ ] **Step 1: Failing tests**

Cases: anon 401, non-OWNER 403, missing 404, ACTIVE 409, DISABLED (documented choice), INVITED happy → 200 with new invite in KV, `env.EMAIL.send` called once, old invites deleted.

- [ ] **Step 2–5: as above**

```bash
git commit -m "feat(auth): add POST /users/:email/reinvite (OWNER-only)"
```

---

## Task 8.6 — `updateMe` handler

**Endpoint:** `PUT /users/me` → `200 {user: IUserPublic}`
**Role floor:** any authenticated user (no `requiredRole` — the write-method floor of EMPLOYEE will apply, so VENDOR can't hit this either. That's a deliberate side effect of the shipped write-floor policy; document in the handler comment.)
**Body:** `{displayName: string}` — only field editable via self-service.
**Files:**

- Create: `services/src/auth/handlers/updateMe.ts`
- Create: `services/test/auth/handlers/updateMe.spec.ts`

Behaviour:

1. Load the caller's user record (`getUser(env, caller.email)`).
2. If not found (should never happen post-refactor, but guard) → 404.
3. Patch `displayName` only. Everything else in the record is untouched.
4. Return `{user: toPublic(updated)}`.

Note re: VENDOR: the write-floor blocks `PUT` for VENDOR unless we set `public: true`. That would defeat the point — updating your own display name should require _being_ the user. Solution: since MANAGER and OWNER can hit this, and EMPLOYEE can too, VENDOR being locked out is acceptable for MVP. If we later want VENDORs to edit their own display name, we'd add an `allowSelfWriteWhenVendor` option to `withAuthHandler`. Not in scope for Phase 8.

- [ ] **Step 1: Failing tests**

Cases: anon 401, VENDOR 403 `FORBIDDEN_WRITE_ROLE`, EMPLOYEE happy → 200, empty body / missing displayName → 400 `VALIDATION_FAILED`, whitespace-only displayName → 400.

- [ ] **Step 2–5: as above**

```bash
git commit -m "feat(auth): add PUT /users/me self-service displayName edit"
```

---

## Task 8.7 — `policyHandlers` (GET/PUT /settings/auth-policy)

**Endpoints:**

- `GET /settings/auth-policy` → any authenticated caller. `200 IAuthPolicy` (returns `DEFAULT_AUTH_POLICY` when nothing persisted — the shipped `policyRepo.getPolicy` already handles that).
- `PUT /settings/auth-policy` → OWNER-only. Body is a full `IAuthPolicy`. `200 IAuthPolicy` (the persisted, stamped value).

**Files:**

- Create: `services/src/auth/handlers/policyHandlers.ts` (both GET and PUT in one file — parallels `settings-handler.ts`).
- Create: `services/test/auth/handlers/policyHandlers.spec.ts`

**Design notes:**

- Two exported handlers, one for GET, one for PUT — each wrapped independently with `withAuthHandler`. The router matches `/settings/auth-policy` and dispatches by method.
- `PUT` body: schema-validate with `AuthPolicySchema`. If invalid → 400 `INVALID_POLICY` (per spec's new error code) with field details. `putPolicy` also clamps `minLength` up to `AUTH_POLICY_MIN_LENGTH_FLOOR` — that's a _defense-in-depth_ backstop; the schema already enforces the floor.
- `updatedBy` is stamped server-side from `caller.email` — never trust the client.
- `updatedAt` is stamped by `putPolicy` itself; the handler can pass `Date.now()` or any placeholder — the repo overwrites it.
- `schemaVersion` must be `1`. Handler stamps it if the client omitted it.

- [ ] **Step 1: Failing tests**

Cases (GET):

1. Anonymous → 401 `UNAUTHORIZED` (any caller required — spec §API surface)
2. VENDOR (authenticated) → 200 with `DEFAULT_AUTH_POLICY`
3. After PUT, subsequent GET returns the persisted value

Cases (PUT): 4. Anonymous → 401 5. MANAGER → 403 `FORBIDDEN` requiredRole OWNER 6. OWNER happy → 200 with echoed policy, `updatedBy = caller.email`, `updatedAt` numeric 7. OWNER with `minLength: 4` → 400 `INVALID_POLICY` (schema rejects, floor is 8) 8. OWNER with a valid policy → 200; a follow-up GET returns exactly what was PUT

- [ ] **Step 2: Verify fail**
- [ ] **Step 3: Implement**

```ts
/** GET|PUT /settings/auth-policy — read-any / write-OWNER. */
import { z } from "zod";
import {
  AuthPolicySchema,
  DEFAULT_AUTH_POLICY,
  EStaffRole,
  type IAuthPolicy,
} from "@bee-epic/shared";
import { jsonErr, jsonOk, withAuthHandler } from "../../utils";
import { getPolicy, putPolicy } from "../repo/policyRepo";

async function handleGetPolicy(
  _request: Request,
  env: Env,
  origin: string | null,
): Promise<Response> {
  const policy = await getPolicy(env);
  return jsonOk(policy, origin, env);
}

// Author-relaxed schema for the PUT body: schemaVersion/updatedAt are stamped
// by the repo; updatedBy is stamped by the handler from caller.email.
const PolicyInputSchema = AuthPolicySchema.partial({
  schemaVersion: true,
  updatedAt: true,
  updatedBy: true,
});

async function handlePutPolicy(
  request: Request,
  env: Env,
  origin: string | null,
  caller?: import("../../utils/resolveCaller").ICaller,
): Promise<Response> {
  if (!caller) return jsonErr({ code: "UNAUTHORIZED" }, origin, env);
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return jsonErr({ code: "INVALID_POLICY" }, origin, env);
  }
  const parsed = PolicyInputSchema.safeParse(raw);
  if (!parsed.success) {
    return jsonErr({ code: "INVALID_POLICY" }, origin, env);
  }
  const now = Date.now();
  const toPersist: IAuthPolicy = {
    schemaVersion: 1,
    minLength: parsed.data.minLength,
    checkBreachCorpus: parsed.data.checkBreachCorpus,
    notifyOnPasswordChange: parsed.data.notifyOnPasswordChange,
    updatedAt: now,
    updatedBy: caller.email.toLowerCase(),
  };
  try {
    const persisted = await putPolicy(env, toPersist);
    return jsonOk(persisted, origin, env);
  } catch (err) {
    console.error("[policyHandlers] putPolicy failed", err);
    return jsonErr({ code: "INVALID_POLICY" }, origin, env);
  }
}

export const getPolicyHandler = {
  fetch: withAuthHandler("GET", handleGetPolicy, {
    requiredRole: EStaffRole.VENDOR,
  }),
} satisfies ExportedHandler<Env>;

export const putPolicyHandler = {
  fetch: withAuthHandler("PUT", handlePutPolicy, {
    requiredRole: EStaffRole.OWNER,
  }),
} satisfies ExportedHandler<Env>;
```

> Note the `requiredRole: EStaffRole.VENDOR` on GET — that's the lowest rank, so it effectively means "any authenticated caller."

- [ ] **Step 4: Green**
- [ ] **Step 5: Commit**

```bash
git commit -m "feat(auth): add GET|PUT /settings/auth-policy handlers"
```

---

## Task 8.8 — Wire routes into `router.ts`

**Files:**

- Modify: `services/src/router.ts`
- Modify: `services/test/router.spec.ts` (if it exists; otherwise cover in the individual handler specs)

Add a new contiguous `/users/*` block after the existing `/auth/*` block. Wire `/settings/auth-policy` before the existing `/settings/:type` regex match.

Additions:

```ts
// Route: /users
if (pathname === "/users" || pathname === "/users/") {
  if (request.method === "GET") return listUsersHandler.fetch(request, env);
  if (request.method === "POST") return inviteUserHandler.fetch(request, env); // not used — /users is GET only. Remove this branch.
  if (request.method === "OPTIONS") return listUsersHandler.fetch(request, env);
  return jsonErr(
    { code: "METHOD_NOT_ALLOWED", allowed: ["GET", "OPTIONS"] },
    origin,
    env,
  );
}

// Route: /users/invite
if (pathname === "/users/invite" || pathname === "/users/invite/") {
  if (request.method === "POST") return inviteUserHandler.fetch(request, env);
  if (request.method === "OPTIONS")
    return inviteUserHandler.fetch(request, env);
  return jsonErr(
    { code: "METHOD_NOT_ALLOWED", allowed: ["POST", "OPTIONS"] },
    origin,
    env,
  );
}

// Route: /users/me — MUST match BEFORE /users/:email to avoid the parametric branch swallowing it
if (pathname === "/users/me" || pathname === "/users/me/") {
  if (request.method === "PUT") return updateMeHandler.fetch(request, env);
  if (request.method === "OPTIONS") return updateMeHandler.fetch(request, env);
  return jsonErr(
    { code: "METHOD_NOT_ALLOWED", allowed: ["PUT", "OPTIONS"] },
    origin,
    env,
  );
}

// Route: /users/:email/reinvite
const reinviteMatch = pathname.match(/^\/users\/([^/]+)\/reinvite$/);
if (reinviteMatch) {
  if (request.method === "POST") return reinviteUserHandler.fetch(request, env);
  if (request.method === "OPTIONS")
    return reinviteUserHandler.fetch(request, env);
  return jsonErr(
    { code: "METHOD_NOT_ALLOWED", allowed: ["POST", "OPTIONS"] },
    origin,
    env,
  );
}

// Route: /users/:email
const userEmailMatch = pathname.match(/^\/users\/([^/]+)$/);
if (userEmailMatch) {
  if (request.method === "PUT") return updateUserHandler.fetch(request, env);
  if (request.method === "DELETE") return deleteUserHandler.fetch(request, env);
  if (request.method === "OPTIONS")
    return handleCORS(request, env, ["PUT", "DELETE"]);
  return jsonErr(
    { code: "METHOD_NOT_ALLOWED", allowed: ["PUT", "DELETE", "OPTIONS"] },
    origin,
    env,
  );
}
```

For `/settings/auth-policy`:

```ts
// Route: /settings/auth-policy — MUST precede the /settings/:type regex
if (
  pathname === "/settings/auth-policy" ||
  pathname === "/settings/auth-policy/"
) {
  if (request.method === "GET") return getPolicyHandler.fetch(request, env);
  if (request.method === "PUT") return putPolicyHandler.fetch(request, env);
  if (request.method === "OPTIONS")
    return handleCORS(request, env, ["GET", "PUT"]);
  return jsonErr(
    { code: "METHOD_NOT_ALLOWED", allowed: ["GET", "PUT", "OPTIONS"] },
    origin,
    env,
  );
}
```

Ordering matters: `/users/me`, `/users/invite`, `/users/:email/reinvite` must all match before the generic `/users/:email`. `/settings/auth-policy` must match before the `/settings/(site|process|testimonials|categories|staff)` regex.

- [ ] **Step 1**: Add the 8 imports at the top of `router.ts` (5 for users, 2 for policy handlers, plus `handleCORS` if not already used in that block).
- [ ] **Step 2**: Add the route blocks in the correct order.
- [ ] **Step 3**: Update the JSDoc "Routes" comment at the top of the file to include the new endpoints.
- [ ] **Step 4**: Run `cd services && npm test && npm run lint`.
- [ ] **Step 5**: Commit.

```bash
git commit -m "feat(router): wire /users/* and /settings/auth-policy routes"
```

---

## Task 8.9 — Phase 8 green checkpoint

- [ ] **Step 1: Full services test suite**

Run: `cd services && npm test`
Expected: all pre-existing tests + the 7 new handler specs green. No pre-existing test should have been modified — Phase 8 is purely additive.

- [ ] **Step 2: Lint + format**

Run: `cd services && npm run lint`

- [ ] **Step 3: Full-repo build sanity check**

Run: `cd .. && npm run build --prefix services`. Expected: passes.

- [ ] **Step 4: Update phase progress note**

Append to `docs/superpowers/plans/2026-06-30-admin-auth-refactor.md` a short "Phase 8 status" line noting completion date + commit range.

- [ ] **Step 5: No user-facing commit** — the individual task commits are the record of work. This checkpoint is a verification, not a commit.

---

## Sequencing / dependencies within Phase 8

Tasks 8.1–8.7 are largely independent — each is one handler + spec. Ordering choice for the subagent runs:

1. **8.1 (listUsers)** — simplest, no side effects; establishes the OWNER-only spec pattern.
2. **8.2 (inviteUser)** — depends on nothing but the sibling handlers and existing repos.
3. **8.7 (policyHandlers)** — self-contained; lets the admin UI in Phase 10 fetch policy hints.
4. **8.6 (updateMe)** — self-contained.
5. **8.3 (updateUser)** — depends on `refreshFamilyRepo.deleteAllForEmail` + `inviteRepo.invalidateForEmail`, both already shipped.
6. **8.5 (reinviteUser)** — depends on `inviteRepo` — pattern shared with 8.2.
7. **8.4 (deleteUser)** — depends on all three cross-repo invalidation calls.
8. **8.8 (router)** — after all handler files exist.
9. **8.9 (checkpoint)** — after 8.8.

## Test data / fixtures

Every handler spec reuses `makeKv()` and `makeEnv()` from the pattern in `services/test/auth/handlers/bootstrapOwner.spec.ts`. For authenticated requests, build a `bea_at` cookie via:

```ts
async function buildAuthCookie(
  email: string,
  role: EStaffRole,
  env: Env,
): Promise<string> {
  const token = await signJwt(
    { sub: email, role, type: "access" },
    env.JWT_SIGNING_SECRET,
    3600,
  );
  return `bea_at=${token}`;
}
```

Then include `Cookie: bea_at=...` on the request. Alternative: `X-Dev-Email: user@example.com` + set `env.ENVIRONMENT = 'development'`. Both paths are exercised by `resolveCaller.spec.ts`; either is fine for handler tests.
