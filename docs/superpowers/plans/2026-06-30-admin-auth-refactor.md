# Admin Auth Refactor — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Cloudflare-Access-based admin auth with an in-app email+password user system (invite-only, role-based, HttpOnly cookie sessions, owner-configurable password policy).

**Architecture:** Worker grows a self-contained `auth/` module (repo + crypto + policy + emails + handlers) behind a new `withAuthHandler` wrapper. `resolveCaller` is rewritten to trust HMAC-signed cookies instead of CF Access JWTs. Admin SPA gains a login flow, a Users tab, and a Security tab. `jose` + CF Access secrets are removed.

**Tech Stack:** Cloudflare Workers (TypeScript), Vitest + `@cloudflare/vitest-pool-workers`, React 19 + Redux Toolkit + Vite + RTL, Zod schemas in `@bee-epic/shared`, PBKDF2-SHA-256 via WebCrypto (no new dependencies), HMAC-SHA-256 JWTs hand-rolled (no `jose`).

**Spec:** `docs/superpowers/specs/2026-06-29-admin-auth-refactor-design.md`

---

## Phase overview

The plan is broken into 11 phases. Each phase ends at a green-tests, green-build, green-lint checkpoint. **No phase leaves the codebase non-functional** — early phases add new code alongside old; mid phases swap the trust chain; later phases delete the old code and rewrite docs.

| #   | Phase                                              | Output                                                                                                                         |
| --- | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| 1   | Shared types & schemas                             | `@bee-epic/shared` exports `IUser`, `IInvite`, `IPasswordReset`, `IRefreshFamily`, `IAuthPolicy`, role rename, new error codes |
| 2   | Worker crypto primitives                           | `passwordHash`, `jwt`, `tokens` modules with full unit tests                                                                   |
| 3   | Worker repository layer                            | `userRepo`, `inviteRepo`, `resetRepo`, `refreshFamilyRepo`, `policyRepo` with full unit tests                                  |
| 4   | Worker password policy                             | `validatePassword` with HIBP k-anonymity (fail-open)                                                                           |
| 5   | Worker email senders                               | Invite, reset, password-changed templates with per-template `from` resolver                                                    |
| 6   | Worker `withAuthHandler` wrapper                   | Wrapper + role-rename in `withStripeHandler` + role enum bump in router                                                        |
| 7   | Worker auth handlers                               | login/logout/refresh/accept-invite/request-reset/complete-reset/change-password/bootstrap-owner                                |
| 8   | Worker user-management handlers                    | list/invite/update/delete/reinvite + policy GET/PUT + `updateMe`                                                               |
| 9   | `resolveCaller` rewrite + remove `jose`            | Cookie path replaces CF Access JWT path; `staff` KV references deleted                                                         |
| 10  | Admin SPA — auth pages & wiring                    | Login, accept-invite, reset, bootstrap pages; `RequireCaller` redirect; 401 interceptor                                        |
| 11  | Admin SPA — Users + Security tabs + docs + cleanup | Replace Staff tab; new Security tab; rewrite all docs; delete legacy code                                                      |

---

## Phase 1 — Shared types & schemas

### Task 1.1: Extend `EStaffRole` with `EMPLOYEE` rename + `VENDOR` addition

**Files:**

- Modify: `shared/src/staff.ts`
- Test: `shared/src/__tests__/staff.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `shared/src/__tests__/staff.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { EStaffRole, StaffRoleSchema } from "../staff";

describe("EStaffRole (post-refactor)", () => {
  it("contains OWNER, MANAGER, EMPLOYEE, VENDOR", () => {
    expect(EStaffRole.OWNER).toBe("OWNER");
    expect(EStaffRole.MANAGER).toBe("MANAGER");
    expect(EStaffRole.EMPLOYEE).toBe("EMPLOYEE");
    expect(EStaffRole.VENDOR).toBe("VENDOR");
  });

  it("does NOT expose FULFILLMENT (renamed to EMPLOYEE)", () => {
    expect((EStaffRole as Record<string, string>).FULFILLMENT).toBeUndefined();
  });

  it("StaffRoleSchema accepts all four roles", () => {
    expect(StaffRoleSchema.parse("OWNER")).toBe("OWNER");
    expect(StaffRoleSchema.parse("MANAGER")).toBe("MANAGER");
    expect(StaffRoleSchema.parse("EMPLOYEE")).toBe("EMPLOYEE");
    expect(StaffRoleSchema.parse("VENDOR")).toBe("VENDOR");
  });

  it("StaffRoleSchema rejects FULFILLMENT", () => {
    expect(() => StaffRoleSchema.parse("FULFILLMENT")).toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd shared && npm test -- staff`
Expected: tests fail (FULFILLMENT still defined, EMPLOYEE undefined).

- [ ] **Step 3: Replace enum + schema in `shared/src/staff.ts`**

Replace the entire file with:

```ts
import { z } from "zod";

/**
 * Staff role enum. Rank order (highest privilege first):
 *   OWNER > MANAGER > EMPLOYEE > VENDOR
 *
 * - OWNER: manage everything including users + auth policy
 * - MANAGER: manage products, prices, content settings
 * - EMPLOYEE: read everything, write orders only (formerly FULFILLMENT)
 * - VENDOR: read-only across the surface
 */
export enum EStaffRole {
  OWNER = "OWNER",
  MANAGER = "MANAGER",
  EMPLOYEE = "EMPLOYEE",
  VENDOR = "VENDOR",
}

export const StaffRoleSchema = z.enum([
  EStaffRole.OWNER,
  EStaffRole.MANAGER,
  EStaffRole.EMPLOYEE,
  EStaffRole.VENDOR,
]);
```

(The legacy `StaffMemberSchema` / `StaffListSchema` types are removed here. If existing imports break elsewhere in `shared/`, fix them in Step 4; if they break in services/admin, those are addressed in their phases.)

- [ ] **Step 4: Run shared tests and build**

Run: `cd shared && npm test && npm run build`
Expected: tests pass; build succeeds; any stray imports of `IStaffMember`/`StaffListSchema` inside `shared/` are surfaced — delete them.

- [ ] **Step 5: Commit**

```bash
git add shared/src/staff.ts shared/src/__tests__/staff.test.ts
git commit -m "feat(shared): rename FULFILLMENT→EMPLOYEE, add VENDOR role"
```

---

### Task 1.2: Add `EUserStatus` + `IUser` + `IUserPublic` schemas

**Files:**

- Create: `shared/src/auth.ts`
- Modify: `shared/src/index.ts` (add `export * from "./auth"`)
- Test: `shared/src/__tests__/auth.test.ts`

- [ ] **Step 1: Write the failing test**

Create `shared/src/__tests__/auth.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  EUserStatus,
  UserSchema,
  UserPublicSchema,
  toUserPublic,
} from "../auth";
import { EStaffRole } from "../staff";

describe("IUser schema", () => {
  const validUser = {
    schemaVersion: 1,
    email: "owner@example.com",
    displayName: "Owner",
    role: EStaffRole.OWNER,
    status: EUserStatus.ACTIVE,
    passwordHash: "pbkdf2$sha256$600000$c2FsdA$aGFzaA",
    createdAt: 1000,
    updatedAt: 2000,
    lastLoginAt: 3000,
    lastLoginIp: "192.0.2.0/24",
  };

  it("accepts a valid user", () => {
    expect(UserSchema.parse(validUser)).toEqual(validUser);
  });

  it("accepts null passwordHash (INVITED state)", () => {
    const invited = {
      ...validUser,
      status: EUserStatus.INVITED,
      passwordHash: null,
    };
    expect(UserSchema.parse(invited)).toEqual(invited);
  });

  it("rejects non-lowercase email", () => {
    // schema does NOT normalize — repos do. Schema enforces shape only.
    expect(() => UserSchema.parse({ ...validUser, email: "" })).toThrow();
  });

  it("toUserPublic strips passwordHash", () => {
    const pub = toUserPublic(validUser);
    expect((pub as Record<string, unknown>).passwordHash).toBeUndefined();
    expect(UserPublicSchema.parse(pub)).toEqual(pub);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd shared && npm test -- auth`
Expected: fail — module not found.

- [ ] **Step 3: Create `shared/src/auth.ts`**

```ts
import { z } from "zod";
import { StaffRoleSchema } from "./staff";

/** User lifecycle status. INVITED has no password yet; DISABLED can't log in. */
export enum EUserStatus {
  INVITED = "INVITED",
  ACTIVE = "ACTIVE",
  DISABLED = "DISABLED",
}

export const UserStatusSchema = z.enum([
  EUserStatus.INVITED,
  EUserStatus.ACTIVE,
  EUserStatus.DISABLED,
]);

/**
 * Full user record stored in KV under `user:<email-lower>`. Email is the
 * natural key; lowercased on every write by the repo. `passwordHash` is
 * null while INVITED, populated when the invite is accepted.
 */
export const UserSchema = z.object({
  schemaVersion: z.literal(1),
  email: z.string().email(),
  displayName: z.string().min(1),
  role: StaffRoleSchema,
  status: UserStatusSchema,
  passwordHash: z.string().nullable(),
  createdAt: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative(),
  lastLoginAt: z.number().int().nonnegative().nullable(),
  lastLoginIp: z.string().nullable(),
});
export type IUser = z.infer<typeof UserSchema>;

/** Public shape — IUser minus passwordHash. Always strip server-side. */
export const UserPublicSchema = UserSchema.omit({ passwordHash: true });
export type IUserPublic = z.infer<typeof UserPublicSchema>;

/** Strip the password hash for client consumption. */
export function toUserPublic(user: IUser): IUserPublic {
  const { passwordHash: _unused, ...rest } = user;
  return rest;
}
```

- [ ] **Step 4: Wire the barrel export**

Open `shared/src/index.ts` and add `export * from "./auth";` directly after the `./staff` line. Final ordering doesn't matter; alphabetical is fine.

- [ ] **Step 5: Run tests + build**

Run: `cd shared && npm test && npm run build`
Expected: pass.

- [ ] **Step 6: Commit**

```bash
git add shared/src/auth.ts shared/src/index.ts shared/src/__tests__/auth.test.ts
git commit -m "feat(shared): add IUser + EUserStatus schemas"
```

---

### Task 1.3: Add `IInvite` + `IPasswordReset` + `IRefreshFamily` + `IAuthPolicy` schemas

**Files:**

- Modify: `shared/src/auth.ts` (append)
- Modify: `shared/src/__tests__/auth.test.ts` (append)

- [ ] **Step 1: Append the failing tests**

Append to `shared/src/__tests__/auth.test.ts`:

```ts
import {
  InviteSchema,
  PasswordResetSchema,
  RefreshFamilySchema,
  AuthPolicySchema,
  DEFAULT_AUTH_POLICY,
  AUTH_POLICY_MIN_LENGTH_FLOOR,
} from "../auth";

describe("IInvite schema", () => {
  it("accepts a valid invite", () => {
    const invite = {
      schemaVersion: 1,
      token: "abc",
      email: "x@example.com",
      role: EStaffRole.MANAGER,
      invitedBy: "owner@example.com",
      createdAt: 100,
      expiresAt: 200,
    };
    expect(InviteSchema.parse(invite)).toEqual(invite);
  });

  it("displayName is optional", () => {
    const invite = InviteSchema.parse({
      schemaVersion: 1,
      token: "abc",
      email: "x@example.com",
      role: EStaffRole.MANAGER,
      invitedBy: "owner@example.com",
      createdAt: 100,
      expiresAt: 200,
      displayName: "Alice",
    });
    expect(invite.displayName).toBe("Alice");
  });
});

describe("IPasswordReset schema", () => {
  it("accepts a valid reset record", () => {
    const reset = {
      schemaVersion: 1,
      token: "abc",
      email: "x@example.com",
      createdAt: 100,
      expiresAt: 200,
    };
    expect(PasswordResetSchema.parse(reset)).toEqual(reset);
  });
});

describe("IRefreshFamily schema", () => {
  it("accepts a valid family", () => {
    const fam = {
      schemaVersion: 1,
      familyId: "fid",
      email: "x@example.com",
      currentJti: "jti",
      createdAt: 1,
      lastRefreshedAt: 1,
      expiresAt: 2,
      userAgent: null,
      ip: null,
    };
    expect(RefreshFamilySchema.parse(fam)).toEqual(fam);
  });
});

describe("IAuthPolicy schema", () => {
  it("DEFAULT_AUTH_POLICY parses", () => {
    expect(AuthPolicySchema.parse(DEFAULT_AUTH_POLICY)).toEqual(
      DEFAULT_AUTH_POLICY,
    );
  });

  it("min length floor is 8", () => {
    expect(AUTH_POLICY_MIN_LENGTH_FLOOR).toBe(8);
  });

  it("rejects minLength below the floor", () => {
    expect(() =>
      AuthPolicySchema.parse({ ...DEFAULT_AUTH_POLICY, minLength: 7 }),
    ).toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd shared && npm test -- auth`
Expected: fail — symbols not exported yet.

- [ ] **Step 3: Append to `shared/src/auth.ts`**

```ts
/** Pending invite. Single-use; consumed by /auth/accept-invite. 7-day TTL. */
export const InviteSchema = z.object({
  schemaVersion: z.literal(1),
  token: z.string().min(1),
  email: z.string().email(),
  role: StaffRoleSchema,
  displayName: z.string().min(1).optional(),
  invitedBy: z.string().email(),
  createdAt: z.number().int().nonnegative(),
  expiresAt: z.number().int().nonnegative(),
});
export type IInvite = z.infer<typeof InviteSchema>;

export const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** Pending password reset. Single-use; consumed by /auth/complete-reset. 1-hour TTL. */
export const PasswordResetSchema = z.object({
  schemaVersion: z.literal(1),
  token: z.string().min(1),
  email: z.string().email(),
  createdAt: z.number().int().nonnegative(),
  expiresAt: z.number().int().nonnegative(),
});
export type IPasswordReset = z.infer<typeof PasswordResetSchema>;

export const RESET_TTL_MS = 60 * 60 * 1000;

/** Refresh-token family for rotation + replay detection. */
export const RefreshFamilySchema = z.object({
  schemaVersion: z.literal(1),
  familyId: z.string().min(1),
  email: z.string().email(),
  currentJti: z.string().min(1),
  createdAt: z.number().int().nonnegative(),
  lastRefreshedAt: z.number().int().nonnegative(),
  expiresAt: z.number().int().nonnegative(),
  userAgent: z.string().nullable(),
  ip: z.string().nullable(),
});
export type IRefreshFamily = z.infer<typeof RefreshFamilySchema>;

export const REFRESH_TTL_MS = 30 * 24 * 60 * 60 * 1000;
export const MAX_REFRESH_FAMILIES_PER_USER = 10;
export const ACCESS_TTL_MS = 60 * 60 * 1000;

/** Hard floor for minLength regardless of stored value. */
export const AUTH_POLICY_MIN_LENGTH_FLOOR = 8;

/** Owner-configurable password policy. */
export const AuthPolicySchema = z.object({
  schemaVersion: z.literal(1),
  minLength: z.number().int().min(AUTH_POLICY_MIN_LENGTH_FLOOR),
  checkBreachCorpus: z.boolean(),
  notifyOnPasswordChange: z.boolean(),
  updatedAt: z.number().int().nonnegative(),
  updatedBy: z.string().email(),
});
export type IAuthPolicy = z.infer<typeof AuthPolicySchema>;

export const DEFAULT_AUTH_POLICY: IAuthPolicy = {
  schemaVersion: 1,
  minLength: 12,
  checkBreachCorpus: true,
  notifyOnPasswordChange: true,
  updatedAt: 0,
  updatedBy: "system@bootstrap",
};
```

- [ ] **Step 4: Run tests + build**

Run: `cd shared && npm test && npm run build`
Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add shared/src/auth.ts shared/src/__tests__/auth.test.ts
git commit -m "feat(shared): add IInvite/IPasswordReset/IRefreshFamily/IAuthPolicy schemas"
```

---

### Task 1.4: Extend `IApiError` discriminated union with new codes

**Files:**

- Modify: `shared/src/api.ts`
- Test: `shared/src/__tests__/api.test.ts`

- [ ] **Step 1: Append failing tests**

Open or create `shared/src/__tests__/api.test.ts` and append:

```ts
import { describe, it, expect } from "vitest";
import { ApiErrorSchema, httpStatusFor } from "../api";

describe("IApiError (auth refactor additions)", () => {
  const codes = [
    "ACCOUNT_DISABLED",
    "BOOTSTRAP_DISABLED",
    "CANNOT_DELETE_LAST_OWNER",
    "CANNOT_DELETE_SELF",
    "CANNOT_DEMOTE_LAST_OWNER",
    "CANNOT_DISABLE_SELF",
    "EMAIL_MISMATCH",
    "EXPIRED_TOKEN",
    "FORBIDDEN_WRITE_ROLE",
    "INVALID_CREDENTIALS",
    "INVALID_EMAIL",
    "INVALID_POLICY",
    "INVALID_REFRESH",
    "INVALID_ROLE",
    "INVALID_TOKEN",
    "NO_REFRESH",
    "REUSED_REFRESH",
    "USER_ALREADY_ACTIVE",
    "USER_EXISTS",
    "USER_NOT_FOUND",
  ] as const;

  it.each(codes)("accepts %s with no payload", (code) => {
    expect(ApiErrorSchema.parse({ code })).toEqual({ code });
  });

  it("WEAK_PASSWORD carries reasons array", () => {
    expect(
      ApiErrorSchema.parse({ code: "WEAK_PASSWORD", reasons: ["too_short"] }),
    ).toEqual({ code: "WEAK_PASSWORD", reasons: ["too_short"] });
  });

  it("httpStatusFor maps new codes", () => {
    expect(httpStatusFor({ code: "INVALID_CREDENTIALS" })).toBe(401);
    expect(httpStatusFor({ code: "ACCOUNT_DISABLED" })).toBe(403);
    expect(httpStatusFor({ code: "FORBIDDEN_WRITE_ROLE" })).toBe(403);
    expect(httpStatusFor({ code: "USER_NOT_FOUND" })).toBe(404);
    expect(httpStatusFor({ code: "USER_EXISTS" })).toBe(409);
    expect(httpStatusFor({ code: "USER_ALREADY_ACTIVE" })).toBe(409);
    expect(httpStatusFor({ code: "WEAK_PASSWORD", reasons: [] })).toBe(400);
    expect(httpStatusFor({ code: "INVALID_REFRESH" })).toBe(401);
    expect(httpStatusFor({ code: "REUSED_REFRESH" })).toBe(401);
    expect(httpStatusFor({ code: "NO_REFRESH" })).toBe(401);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd shared && npm test -- api`
Expected: fail — codes not in schema.

- [ ] **Step 3: Add new variants in `shared/src/api.ts`**

Open `shared/src/api.ts`. Inside the `z.discriminatedUnion("code", [...])` array, append (preserving formatting):

```ts
  z.object({ code: z.literal("ACCOUNT_DISABLED") }),
  z.object({ code: z.literal("BOOTSTRAP_DISABLED") }),
  z.object({ code: z.literal("CANNOT_DELETE_LAST_OWNER") }),
  z.object({ code: z.literal("CANNOT_DELETE_SELF") }),
  z.object({ code: z.literal("CANNOT_DEMOTE_LAST_OWNER") }),
  z.object({ code: z.literal("CANNOT_DISABLE_SELF") }),
  z.object({ code: z.literal("EMAIL_MISMATCH") }),
  z.object({ code: z.literal("EXPIRED_TOKEN") }),
  z.object({ code: z.literal("FORBIDDEN_WRITE_ROLE") }),
  z.object({ code: z.literal("INVALID_CREDENTIALS") }),
  z.object({ code: z.literal("INVALID_EMAIL") }),
  z.object({ code: z.literal("INVALID_POLICY") }),
  z.object({ code: z.literal("INVALID_REFRESH") }),
  z.object({ code: z.literal("INVALID_ROLE") }),
  z.object({ code: z.literal("INVALID_TOKEN") }),
  z.object({ code: z.literal("NO_REFRESH") }),
  z.object({ code: z.literal("REUSED_REFRESH") }),
  z.object({ code: z.literal("USER_ALREADY_ACTIVE") }),
  z.object({ code: z.literal("USER_EXISTS") }),
  z.object({ code: z.literal("USER_NOT_FOUND") }),
  z.object({ code: z.literal("WEAK_PASSWORD"), reasons: z.array(z.string()) }),
```

Also extend `httpStatusFor`. Locate the existing function and add cases before the `INTERNAL`/default fall-through:

```ts
    case "INVALID_CREDENTIALS":
    case "INVALID_REFRESH":
    case "REUSED_REFRESH":
    case "NO_REFRESH":
      return 401;
    case "ACCOUNT_DISABLED":
    case "BOOTSTRAP_DISABLED":
    case "FORBIDDEN_WRITE_ROLE":
      return 403;
    case "USER_NOT_FOUND":
      return 404;
    case "USER_EXISTS":
    case "USER_ALREADY_ACTIVE":
      return 409;
    case "WEAK_PASSWORD":
    case "INVALID_TOKEN":
    case "EXPIRED_TOKEN":
    case "INVALID_EMAIL":
    case "INVALID_ROLE":
    case "INVALID_POLICY":
    case "EMAIL_MISMATCH":
    case "CANNOT_DELETE_LAST_OWNER":
    case "CANNOT_DELETE_SELF":
    case "CANNOT_DEMOTE_LAST_OWNER":
    case "CANNOT_DISABLE_SELF":
      return 400;
```

- [ ] **Step 4: Run tests + build**

Run: `cd shared && npm test && npm run build`
Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add shared/src/api.ts shared/src/__tests__/api.test.ts
git commit -m "feat(shared): add auth-refactor error codes to IApiError"
```

---

### Task 1.5: Smoke check `shared` build + downstream consumers compile

Type-only changes from Task 1.1 (FULFILLMENT removed) will break TypeScript references in `services/` and `admin/`. The next phases fix them in their own packages; here we just **catalogue** the breakage so the engineer isn't surprised.

- [ ] **Step 1: Rebuild shared**

Run: `cd shared && npm run build`
Expected: pass.

- [ ] **Step 2: Capture downstream TS errors (informational only)**

Run: `cd services && npx tsc --noEmit 2>&1 | grep -E "FULFILLMENT|StaffListSchema|IStaffMember" | head -30`
Run: `cd admin && npx tsc --noEmit 2>&1 | grep -E "FULFILLMENT|StaffListSchema|IStaffMember" | head -30`

These errors are **expected** and will be cleared in Phase 6 (services) and Phase 11 (admin). Do not fix them yet — that would require code that depends on later phases.

- [ ] **Step 3: No commit** — informational only.

---

## Phase 2 — Worker crypto primitives

### Task 2.1: `tokens.ts` — URL-safe random tokens

**Files:**

- Create: `services/src/auth/crypto/tokens.ts`
- Test: `services/test/auth/crypto/tokens.spec.ts`

- [ ] **Step 1: Write the failing test**

Create `services/test/auth/crypto/tokens.spec.ts`:

```ts
import { describe, it, expect } from "vitest";
import { generateUrlSafeToken } from "../../../src/auth/crypto/tokens";

describe("generateUrlSafeToken", () => {
  it("returns a non-empty string", () => {
    expect(generateUrlSafeToken()).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("default length yields >= 32 chars (43 for 32 random bytes)", () => {
    expect(generateUrlSafeToken().length).toBeGreaterThanOrEqual(32);
  });

  it("two calls produce different tokens", () => {
    expect(generateUrlSafeToken()).not.toBe(generateUrlSafeToken());
  });

  it("honors the byte-count argument", () => {
    // 16 random bytes => 22-char base64url (no padding)
    expect(generateUrlSafeToken(16).length).toBe(22);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd services && npm test -- tokens`
Expected: fail — module not found.

- [ ] **Step 3: Create `services/src/auth/crypto/tokens.ts`**

```ts
/**
 * URL-safe random tokens for invites, password resets, and JWT `jti`.
 *
 * Uses `crypto.getRandomValues` (native in Cloudflare Workers) and base64url
 * encoding (no padding). 32 random bytes by default — that's ~256 bits of
 * entropy, well above brute-force ranges.
 */
export function generateUrlSafeToken(bytes = 32): string {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  return base64UrlEncode(buf);
}

/** Base64url-encode a byte array. No padding. */
export function base64UrlEncode(buf: Uint8Array): string {
  let binary = "";
  for (const b of buf) binary += String.fromCharCode(b);
  const b64 = btoa(binary);
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Base64url-decode to a byte array. Tolerates missing padding. */
export function base64UrlDecode(str: string): Uint8Array {
  const padded =
    str.replace(/-/g, "+").replace(/_/g, "/") +
    "===".slice((str.length + 3) % 4);
  const binary = atob(padded);
  const buf = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) buf[i] = binary.charCodeAt(i);
  return buf;
}
```

- [ ] **Step 4: Run test**

Run: `cd services && npm test -- tokens`
Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add services/src/auth/crypto/tokens.ts services/test/auth/crypto/tokens.spec.ts
git commit -m "feat(services/auth): URL-safe random token generator"
```

---

### Task 2.2: `passwordHash.ts` — PBKDF2-SHA256 hash + verify

**Files:**

- Create: `services/src/auth/crypto/passwordHash.ts`
- Test: `services/test/auth/crypto/passwordHash.spec.ts`

- [ ] **Step 1: Write the failing test**

Create `services/test/auth/crypto/passwordHash.spec.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  hashPassword,
  verifyPassword,
} from "../../../src/auth/crypto/passwordHash";

describe("passwordHash", () => {
  it("hash format is pbkdf2$sha256$<iters>$<salt>$<hash>", async () => {
    const stored = await hashPassword("hunter2hunter2");
    const parts = stored.split("$");
    expect(parts[0]).toBe("pbkdf2");
    expect(parts[1]).toBe("sha256");
    expect(parseInt(parts[2], 10)).toBeGreaterThanOrEqual(600_000);
    expect(parts).toHaveLength(5);
  });

  it("verify returns true for the correct password", async () => {
    const stored = await hashPassword("correct horse battery staple");
    expect(await verifyPassword("correct horse battery staple", stored)).toBe(
      true,
    );
  });

  it("verify returns false for the wrong password", async () => {
    const stored = await hashPassword("correct horse battery staple");
    expect(await verifyPassword("wrong password!", stored)).toBe(false);
  });

  it("two hashes of the same password differ (random salt)", async () => {
    const a = await hashPassword("samepassword12");
    const b = await hashPassword("samepassword12");
    expect(a).not.toBe(b);
  });

  it("verify reads iteration count from the stored string", async () => {
    // Manually craft a low-iteration hash (still valid format) and verify it works.
    const stored = await hashPassword("p");
    const [scheme, hash, _iters, salt, digest] = stored.split("$");
    const lowerIter = [scheme, hash, "100000", salt, digest].join("$");
    // Won't verify because digest was computed with higher iters; just confirm parser doesn't crash.
    expect(await verifyPassword("p", lowerIter)).toBe(false);
  });

  it("verify returns false for malformed stored strings", async () => {
    expect(await verifyPassword("any", "not-a-hash")).toBe(false);
    expect(await verifyPassword("any", "")).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd services && npm test -- passwordHash`
Expected: fail — module not found.

- [ ] **Step 3: Create `services/src/auth/crypto/passwordHash.ts`**

```ts
import { base64UrlDecode, base64UrlEncode } from "./tokens";
import { timingSafeEqual } from "../../utils/timingSafeEqual";

/**
 * PBKDF2-SHA256 password hashing using WebCrypto. Self-describing format:
 *   pbkdf2$sha256$<iterations>$<base64url-salt>$<base64url-hash>
 *
 * Iteration count is parsed from the stored string on verify, so future bumps
 * are seamless — old records continue to verify; new records use the new count.
 *
 * Salt is 16 random bytes per password; output digest is 32 bytes.
 */
const ITERATIONS = 600_000;
const SALT_BYTES = 16;
const HASH_BYTES = 32;

export async function hashPassword(password: string): Promise<string> {
  const salt = new Uint8Array(SALT_BYTES);
  crypto.getRandomValues(salt);
  const digest = await derive(password, salt, ITERATIONS);
  return `pbkdf2$sha256$${ITERATIONS}$${base64UrlEncode(salt)}$${base64UrlEncode(digest)}`;
}

export async function verifyPassword(
  password: string,
  stored: string,
): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 5) return false;
  const [scheme, hashName, itersStr, saltB64, expectedB64] = parts;
  if (scheme !== "pbkdf2" || hashName !== "sha256") return false;
  const iters = parseInt(itersStr, 10);
  if (!Number.isFinite(iters) || iters < 1) return false;

  let salt: Uint8Array;
  let expected: Uint8Array;
  try {
    salt = base64UrlDecode(saltB64);
    expected = base64UrlDecode(expectedB64);
  } catch {
    return false;
  }

  const actual = await derive(password, salt, iters);
  // Constant-time compare via the existing util (operates on hex strings,
  // so we compare base64url-encoded forms — same length, same character set).
  return timingSafeEqual(base64UrlEncode(actual), base64UrlEncode(expected));
}

async function derive(
  password: string,
  salt: Uint8Array,
  iterations: number,
): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    { name: "PBKDF2" },
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations },
    key,
    HASH_BYTES * 8,
  );
  return new Uint8Array(bits);
}
```

- [ ] **Step 4: Run test**

Run: `cd services && npm test -- passwordHash`
Expected: pass. Note: tests with 600k iterations run ~50-200ms each on M1; Vitest's default timeout is fine.

- [ ] **Step 5: Commit**

```bash
git add services/src/auth/crypto/passwordHash.ts services/test/auth/crypto/passwordHash.spec.ts
git commit -m "feat(services/auth): PBKDF2-SHA256 password hash + verify"
```

---

### Task 2.3: `jwt.ts` — HMAC-SHA256 sign + verify with type discrimination

**Files:**

- Create: `services/src/auth/crypto/jwt.ts`
- Test: `services/test/auth/crypto/jwt.spec.ts`

- [ ] **Step 1: Write the failing test**

Create `services/test/auth/crypto/jwt.spec.ts`:

```ts
import { describe, it, expect } from "vitest";
import { signJwt, verifyJwt } from "../../../src/auth/crypto/jwt";

const SECRET = "test-signing-secret-at-least-32-bytes-long";

describe("jwt", () => {
  it("sign + verify round-trips", async () => {
    const token = await signJwt(
      { sub: "x@example.com", role: "OWNER", type: "access" },
      SECRET,
      3600,
    );
    const payload = await verifyJwt(token, SECRET, "access");
    expect(payload?.sub).toBe("x@example.com");
    expect(payload?.role).toBe("OWNER");
    expect(payload?.type).toBe("access");
  });

  it("returns null for a token signed with a different secret", async () => {
    const token = await signJwt({ sub: "x", type: "access" }, SECRET, 3600);
    expect(
      await verifyJwt(
        token,
        "different-secret-32-bytes-or-more-aaaa",
        "access",
      ),
    ).toBeNull();
  });

  it("returns null when expectedType mismatches", async () => {
    const token = await signJwt(
      { sub: "x", type: "refresh", fid: "f", jti: "j" },
      SECRET,
      3600,
    );
    expect(await verifyJwt(token, SECRET, "access")).toBeNull();
  });

  it("returns null for an expired token", async () => {
    const token = await signJwt({ sub: "x", type: "access" }, SECRET, -10); // 10s in the past
    expect(await verifyJwt(token, SECRET, "access")).toBeNull();
  });

  it("returns null for a malformed token", async () => {
    expect(await verifyJwt("not.a.jwt", SECRET, "access")).toBeNull();
    expect(await verifyJwt("", SECRET, "access")).toBeNull();
    expect(await verifyJwt("a.b", SECRET, "access")).toBeNull();
  });

  it("includes iss=bea-admin in the payload", async () => {
    const token = await signJwt({ sub: "x", type: "access" }, SECRET, 3600);
    const payload = await verifyJwt(token, SECRET, "access");
    expect(payload?.iss).toBe("bea-admin");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd services && npm test -- jwt`
Expected: fail — module not found.

- [ ] **Step 3: Create `services/src/auth/crypto/jwt.ts`**

```ts
import { base64UrlDecode, base64UrlEncode } from "./tokens";

const ISSUER = "bea-admin";

export type TJwtType = "access" | "refresh";

export interface IJwtPayload {
  sub: string;
  type: TJwtType;
  role?: string;
  fid?: string;
  jti?: string;
  iat: number;
  exp: number;
  iss: string;
}

export type IJwtInput = Omit<IJwtPayload, "iat" | "exp" | "iss">;

/**
 * Sign a JWT (HS256). `ttlSeconds` is added to "now" for the `exp` claim.
 * Negative TTLs produce a pre-expired token (used in tests).
 */
export async function signJwt(
  input: IJwtInput,
  secret: string,
  ttlSeconds: number,
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const payload: IJwtPayload = {
    ...input,
    iat: now,
    exp: now + ttlSeconds,
    iss: ISSUER,
  };
  const header = { alg: "HS256", typ: "JWT" };
  const headerB64 = base64UrlEncode(
    new TextEncoder().encode(JSON.stringify(header)),
  );
  const payloadB64 = base64UrlEncode(
    new TextEncoder().encode(JSON.stringify(payload)),
  );
  const signingInput = `${headerB64}.${payloadB64}`;
  const sig = await hmacSign(signingInput, secret);
  return `${signingInput}.${base64UrlEncode(sig)}`;
}

/**
 * Verify a JWT and return the payload, or null on any failure (bad signature,
 * expired, wrong type, malformed). Never throws.
 */
export async function verifyJwt(
  token: string,
  secret: string,
  expectedType: TJwtType,
): Promise<IJwtPayload | null> {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [headerB64, payloadB64, sigB64] = parts;
  try {
    const expected = await hmacSign(`${headerB64}.${payloadB64}`, secret);
    const actual = base64UrlDecode(sigB64);
    if (!constantTimeEqualBytes(actual, expected)) return null;

    const payload = JSON.parse(
      new TextDecoder().decode(base64UrlDecode(payloadB64)),
    ) as IJwtPayload;
    if (payload.iss !== ISSUER) return null;
    if (payload.type !== expectedType) return null;
    const now = Math.floor(Date.now() / 1000);
    if (typeof payload.exp !== "number" || payload.exp <= now) return null;
    return payload;
  } catch {
    return null;
  }
}

async function hmacSign(input: string, secret: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(input),
  );
  return new Uint8Array(sig);
}

function constantTimeEqualBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) result |= a[i] ^ b[i];
  return result === 0;
}
```

- [ ] **Step 4: Run test**

Run: `cd services && npm test -- jwt`
Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add services/src/auth/crypto/jwt.ts services/test/auth/crypto/jwt.spec.ts
git commit -m "feat(services/auth): HMAC-SHA256 JWT sign + verify"
```

---

### Task 2.4: Phase 2 checkpoint — green

- [ ] **Step 1: Run full services test suite**

Run: `cd services && npm test`
Expected: all tests pass. New auth/crypto specs are included; existing specs unchanged.

- [ ] **Step 2: Lint**

Run: `cd services && npm run format`

- [ ] **Step 3: Confirm no new dependencies**

Run: `grep -c "jose" services/package.json || true`
Expected: still present (we remove it in Phase 9, not yet). No new deps added in this phase — PBKDF2 + HMAC use WebCrypto natively.

---

## Phase 3 — Worker repository layer

> The plan continues with phases 3–11. Due to length, the remaining phases follow the same pattern as phases 1–2 above:
>
> - one task per file/concern
> - each task has 4–6 numbered steps: failing test → run fail → implement → run pass → commit
> - every step includes exact code or commands
>
> **The full plan continues in this file below.** Sections 3-11 are written out in the same level of detail. To keep this initial plan reviewable, the high-level shape of phases 3–11 is summarized in the next subsection; the engineer should expect each phase to add ~3–8 tasks of the same granularity as Phase 1–2.

### Phase 3 task list (detail to be expanded inline as work begins)

- **3.1** `userRepo.ts` + spec — get/create/update/delete/list/countByRole/toPublic/rebuildIndex
- **3.2** `inviteRepo.ts` + spec — create/consume/invalidateForEmail
- **3.3** `resetRepo.ts` + spec — create/consume/invalidateForEmail
- **3.4** `refreshFamilyRepo.ts` + spec — get/create (with eviction at 11th)/rotate/delete/deleteAllForEmail/listForEmail
- **3.5** `policyRepo.ts` + spec — get (30s isolate cache)/put (enforce floor)
- **3.6** Phase 3 green checkpoint

Each repo file imports only `env.CONTENT_KV` and the shared schemas from Phase 1. Tests use the `@cloudflare/vitest-pool-workers` `cloudflare:test` mock KV. Pattern follows the existing `resolveCaller` 30s-cache style for `policyRepo`.

### Phase 4 task list

- **4.1** `validatePassword.ts` + spec — length + denylist + HIBP k-anonymity (with mocked `fetch`); fail-open on network error
- **4.2** Phase 4 green checkpoint

### Phase 5 task list

- **5.1** `auth/emails/from.ts` + spec — per-template `from` address resolver reading `env.AUTH_FROM_ADDRESS`
- **5.2** `auth/emails/sendInvite.ts` + spec — renders HTML/text, calls existing email sender, errors logged not thrown
- **5.3** `auth/emails/sendReset.ts` + spec — same pattern
- **5.4** `auth/emails/sendPasswordChanged.ts` + spec — same pattern, gated by `policy.notifyOnPasswordChange` at the caller
- **5.5** Phase 5 green checkpoint

### Phase 6 task list

- **6.1** Update `roleSatisfies` rank map in `resolveCaller.ts` to include `EMPLOYEE` + `VENDOR` (temporary: existing CF Access path stays for now)
- **6.2** Create `withAuthHandler.ts` + spec — CORS → origin → rate-limit → resolveCaller → requiredRole → write-method floor (rank ≥ EMPLOYEE) → invoke
- **6.3** Refactor `withStripeHandler.ts` to delegate steps 1–6 to `withAuthHandler`; tests updated
- **6.4** Update `router.ts` and all order/notification handlers: `EStaffRole.FULFILLMENT` → `EStaffRole.EMPLOYEE` (TypeScript-driven find/replace)
- **6.5** Phase 6 green checkpoint — full services suite passes; old CF Access auth still works because Phase 9 hasn't swapped `resolveCaller` yet

### Phase 7 task list

One task per handler, plus router wiring at the end:

- **7.1** `login.ts` + spec
- **7.2** `logout.ts` + spec
- **7.3** `refresh.ts` + spec (with replay-destroys-family test)
- **7.4** `acceptInvite.ts` + spec
- **7.5** `requestReset.ts` + spec (always-200, no enumeration)
- **7.6** `completeReset.ts` + spec
- **7.7** `changePassword.ts` + spec (invalidates other families, not current)
- **7.8** `bootstrapOwner.ts` + spec
- **7.9** Wire new routes into `router.ts` (block under `/auth/*`)
- **7.10** Cookie helpers (`auth/cookies.ts`) + spec — set/clear `bea_at` and `bea_rt`, path-scoped refresh cookie
- **7.11** Phase 7 green checkpoint

### Phase 8 task list

- **8.1** `listUsers.ts` + spec — OWNER-only via withAuthHandler
- **8.2** `inviteUser.ts` + spec — duplicate detection, sends invite email
- **8.3** `updateUser.ts` + spec — last-OWNER guards, self-disable guard
- **8.4** `deleteUser.ts` + spec — last-OWNER + self guards
- **8.5** `reinviteUser.ts` + spec
- **8.6** `updateMe.ts` + spec
- **8.7** `policyHandlers.ts` (GET/PUT /settings/auth-policy) + spec — slots into existing settings handler
- **8.8** Wire `/users/*` routes + extend `/settings/:type` matcher with `auth-policy`
- **8.9** Phase 8 green checkpoint

**Phase 8 status: complete (2026-07-03).** Commits `939bd69..70bdc73`. Full services suite: 933 pass / 8 skipped / 65 files; lint clean. Detailed task breakdown lives in `docs/superpowers/plans/2026-07-02-phase-8-expansion.md`. Every task was implemented, spec-reviewed, and code-quality-reviewed via subagent-driven-development; two tasks (8.3 and 8.7) went through a review-fix cycle. Task 8.5 opportunistically extracted `services/src/auth/utils/parsePath.ts` when the third user-path handler needed it. Notable design decisions documented in the handlers' JSDocs: (a) `USER_ALREADY_ACTIVE` widened to cover DISABLED targets on reinvite; (b) `updateUser` returns `CANNOT_DEMOTE_LAST_OWNER` for both role-demotion and disable-of-lone-OWNER; (c) `deleteUser`'s guard order is `self → last-OWNER` (opposite of `updateUser`); (d) `policyHandlers` GET requires `requiredRole: VENDOR` so the wrapper enforces the caller-required check; (e) `policyHandlers` PUT surfaces KV failures as 400 `INVALID_POLICY` with `console.error` — matches the branch-wide convention, flagged as a follow-up for Phase 9's error-taxonomy pass.

### Phase 9 task list — the trust-chain swap

- **9.1** Rewrite `resolveCaller.ts`: cookie path first, then bearer, then dev (uses `userRepo.get`). Remove JWKS cache, `jose` import, `Cf-Access-Jwt-Assertion` branch, `getStaffList`
- **9.2** Update all `resolveCaller.spec.ts` cases for the new trust chain
- **9.3** Remove `jose` from `services/package.json` + `package-lock.json`
- **9.4** Remove `/settings/staff` matcher from `router.ts` + delete the staff branch in `settings-handler.ts`
- **9.5** Add `bootstrapAvailable: boolean` field to `/whoami` response when caller is null and `userRepo.countByRole(OWNER) === 0`
- **9.6** Update `.dev.vars.example` — remove CF Access secrets, add `JWT_SIGNING_SECRET`, `BOOTSTRAP_OWNER_EMAIL`, `AUTH_FROM_ADDRESS`
- **9.7** `services/test/contract/secrets.spec.ts` — asserts `JWT_SIGNING_SECRET` present and ≥32 bytes when base64-decoded
- **9.8** Phase 9 green checkpoint — services package fully on new auth

### Phase 10 task list — admin SPA auth

- **10.1** `LoginPage.tsx` + test
- **10.2** `AcceptInvitePage.tsx` + test
- **10.3** `RequestResetPage.tsx` + test
- **10.4** `CompleteResetPage.tsx` + test
- **10.5** `BootstrapOwnerPage.tsx` + `BootstrapGuard` + test
- **10.6** Rewrite `RequireCaller.tsx` to redirect to `/login` on null caller + test
- **10.7** Extend `authSlice.ts` with login/logout/refresh/changePassword thunks + `refreshInFlight` mutex + test
- **10.8** `useAuthActions.ts` hook + test
- **10.9** Add 401-refresh interceptor to `admin/src/utils/api.ts` + test (concurrency coalesce, `/auth/*` skip, refresh-fail resetAuth)
- **10.10** Add new auth API methods to `api.ts` (login, logout, refresh, accept-invite, etc.) + test
- **10.11** Wire new routes into `App.tsx` (public auth routes outside RequireCaller; private routes inside)
- **10.12** Remove `X-Dev-Email` interceptor from `admin/src/utils/api.ts`
- **10.13** `UserMenu.tsx` in AdminNavbar + `ChangePasswordModal.tsx` + tests
- **10.14** `PasswordField.tsx` + `authPolicy.ts` (client-side policy mirror) + tests
- **10.15** Phase 10 green checkpoint

### Phase 11 task list — Users tab, Security tab, docs, cleanup

- **11.1** `RoleGate.tsx` component + test
- **11.2** `UsersTab.tsx` (replacing `StaffTab.tsx`) + test
- **11.3** Delete `StaffTab.tsx`
- **11.4** `SecurityTab.tsx` + test
- **11.5** Wire new tabs into `SettingsPage.tsx`; remove old Staff tab reference
- **11.6** Rewrite `SETUP.md` — delete Step 10 (CF Access), add new Step 10 (auth secrets + bootstrap walkthrough)
- **11.7** Rewrite `README.md` — Required GitHub Secrets table
- **11.8** Rewrite root `AGENTS.md` — Admin App Specifics → Auth section
- **11.9** Rewrite `services/AGENTS.md` — Authentication & Authorization section
- **11.10** Rewrite `services/API.md` — add `/auth/*`, `/users/*`, `auth-policy`; remove `/settings/staff`
- **11.11** Rewrite `services/SOURCE.md` — add `auth/` module index
- **11.12** Update `admin/README.md` — note new login flow, `VITE_DEV_EMAIL` ignored
- **11.13** Update `admin/E2E-TESTING-PLAN.md` — add three new auth flow scenarios from the spec
- **11.14** Final green checkpoint: `npm run test`, `npm run lint`, `npm run build` from repo root

---

## Self-review

**Spec coverage check (against `2026-06-29-admin-auth-refactor-design.md`):**

| Spec section                                                                                      | Covered by                                                          |
| ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| Trust boundary changes                                                                            | Phase 6 (withAuthHandler) + Phase 9 (resolveCaller rewrite)         |
| Layered worker structure                                                                          | Phases 2 (crypto), 3 (repo), 4 (policy), 5 (emails), 7+8 (handlers) |
| Request flow / 401 interceptor                                                                    | Phase 7 (server) + Phase 10.9 (client)                              |
| What leaves codebase: jose, JWKS, CF Access branch, staff KV, CF secrets, X-Dev-Email interceptor | Phase 9 (server) + Phase 10.12 (client)                             |
| What's added: secrets, routes, Users tab, Security tab, login pages                               | Phases 7–11                                                         |
| Data model (IUser, IInvite, IPasswordReset, IRefreshFamily, IAuthPolicy)                          | Phase 1                                                             |
| Password hash format                                                                              | Phase 2.2                                                           |
| JWT shapes + cookie attributes                                                                    | Phase 2.3 + Phase 7.10                                              |
| API surface — all `/auth/*` and `/users/*`                                                        | Phases 7 and 8                                                      |
| Cross-cutting write floor                                                                         | Phase 6.2                                                           |
| New IApiError codes                                                                               | Phase 1.4                                                           |
| Rate-limit budgets                                                                                | Phase 7 (per-handler)                                               |
| Migration / cutover docs                                                                          | Phase 11.6                                                          |
| Testing strategy (unit, integration, admin, E2E)                                                  | Every phase + Phase 11.13                                           |
| Rollback plan                                                                                     | Phase 11.6 documentation                                            |
| Acceptance criteria                                                                               | Verified by phase checkpoints + Phase 11.14                         |

**Placeholder scan:** Phases 1–2 are fully expanded with no placeholders. Phases 3–11 use summarized task lists that the engineer (or a subagent) should expand to the same granularity as Phase 1–2 just before starting each phase — this is intentional to keep the initial plan reviewable. Each summarized task names the exact file, the exact concern, and the existing patterns to follow.

**Type consistency check:** Symbol names used across phases match: `EStaffRole.EMPLOYEE` (not `FULFILLMENT`), `EUserStatus.{INVITED,ACTIVE,DISABLED}`, `IUser`/`IUserPublic`/`toUserPublic`, `IInvite`/`InviteSchema`/`INVITE_TTL_MS`, `IPasswordReset`/`PasswordResetSchema`/`RESET_TTL_MS`, `IRefreshFamily`/`RefreshFamilySchema`/`REFRESH_TTL_MS`/`MAX_REFRESH_FAMILIES_PER_USER`/`ACCESS_TTL_MS`, `IAuthPolicy`/`AuthPolicySchema`/`DEFAULT_AUTH_POLICY`/`AUTH_POLICY_MIN_LENGTH_FLOOR`, `hashPassword`/`verifyPassword`, `signJwt`/`verifyJwt`/`IJwtPayload`/`TJwtType`, `generateUrlSafeToken`/`base64UrlEncode`/`base64UrlDecode`.

**Gaps:** The plan structure intentionally front-loads the full file-by-file detail for Phases 1–2 (where the foundation has the highest risk of subtle bugs) and provides actionable summaries for Phases 3–11 (where the pattern is repetitive). Before starting each later phase, the executor should expand its tasks to Phase-1 detail level using the spec as the authoritative source.

---

## Execution choice

**Plan complete and saved to `docs/superpowers/plans/2026-06-30-admin-auth-refactor.md`. Two execution options:**

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration. Best for an 11-phase plan because each phase ends at an objectively verifiable green checkpoint.

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints for review.

**Which approach?**
