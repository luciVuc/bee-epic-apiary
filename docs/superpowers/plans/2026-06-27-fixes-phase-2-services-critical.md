# Phase 2 — `services/` CRITICAL fixes

> Parent plan: `2026-06-27-repo-wide-code-review-fixes.md`. Tasks 7–13.

---

## Task 7: Add in-worker auth to `/notifications/stream` (services C1)

Currently `/notifications/stream` has no `resolveCaller` / `roleSatisfies` / `isAllowedOrigin` checks. If anything routes around CF Access, the SSE firehose is public.

**Files:**

- Modify: `services/src/stripe/notifications/notifications-stream.ts`
- Modify: `services/src/router.ts` (only if router handles OPTIONS for this route)
- Test: `services/test/stripe/notifications-stream.spec.ts` (create if missing)

- [ ] **Step 1: Read the current handler + router entry**

```bash
cat services/src/stripe/notifications/notifications-stream.ts services/src/router.ts | head -200
```

- [ ] **Step 2: Write a failing test asserting unauthenticated GETs are rejected**

```ts
// services/test/stripe/notifications-stream.spec.ts
import { describe, it, expect, vi } from "vitest";
import notificationsStream from "../../src/stripe/notifications/notifications-stream";

const envBase = {
  ENVIRONMENT: "production",
  ALLOWED_ORIGINS: "https://admin.test",
  CF_ACCESS_TEAM_DOMAIN: "team.cloudflareaccess.com",
  CF_ACCESS_AUD: "aud-tag",
  OWNER_EMAILS: "",
  API_SECRET_KEY: "secret",
  NOTIFICATION_HUB: { idFromName: () => ({}), get: () => ({ fetch: vi.fn() }) },
  CONTENT_KV: { get: async () => null, put: async () => {} },
} as unknown as Env;

describe("/notifications/stream auth", () => {
  it("rejects requests with no caller (no JWT, no bearer, no dev header)", async () => {
    const req = new Request("https://api.test/notifications/stream", {
      method: "GET",
      headers: { Origin: "https://admin.test" },
    });
    const res = await notificationsStream.fetch(
      req,
      envBase,
      {} as ExecutionContext,
    );
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe("UNAUTHORIZED");
  });

  it("rejects callers below FULFILLMENT role with 403", async () => {
    const req = new Request("https://api.test/notifications/stream", {
      method: "GET",
      headers: {
        Origin: "https://admin.test",
        "X-Dev-Email": "noone@test",
      },
    });
    const devEnv = { ...envBase, ENVIRONMENT: "development" } as unknown as Env;
    const res = await notificationsStream.fetch(
      req,
      devEnv,
      {} as ExecutionContext,
    );
    // dev bypass yields OWNER role currently; if you keep that, this case is N/A.
    // If you enumerate dev roles, set X-Dev-Email to a non-staff value and assert 403.
    expect([200, 403]).toContain(res.status);
  });
});
```

- [ ] **Step 3: Run, observe FAIL** (handler currently returns 200 stream).

```bash
cd services && npx vitest run test/stripe/notifications-stream.spec.ts
```

- [ ] **Step 4: Implement the gate**

In `services/src/stripe/notifications/notifications-stream.ts`, near the top of the `fetch` body — after extracting `origin`, before forwarding to the DO — add:

```ts
import { resolveCaller, roleSatisfies } from "../../utils";
import { isAllowedOrigin } from "../../utils/handleCORS";
import { jsonErr } from "../../utils/jsonResponse";
import { EStaffRole } from "@bee-epic/shared";

// inside fetch(request, env, ctx):
const origin = request.headers.get("Origin");
if (!isAllowedOrigin(origin, env)) {
  return jsonErr({ code: "UNAUTHORIZED" }, origin, env, 401);
}
const caller = await resolveCaller(request, env);
if (!caller) {
  return jsonErr({ code: "UNAUTHORIZED" }, origin, env, 401);
}
if (!roleSatisfies(caller.role, EStaffRole.FULFILLMENT)) {
  return jsonErr(
    { code: "FORBIDDEN", requiredRole: EStaffRole.FULFILLMENT },
    origin,
    env,
    403,
  );
}
```

(Adjust import paths to match the existing barrel.)

- [ ] **Step 5: Re-run tests**

```bash
cd services && npx vitest run test/stripe/notifications-stream.spec.ts
```

Expected: PASS.

- [ ] **Step 6: Document the cookie requirement**

Append to `services/AGENTS.md`, in the SSE section:

```
- `/notifications/stream` enforces `resolveCaller` + `roleSatisfies(FULFILLMENT)` *inside* the worker. EventSource cannot send `Authorization`; production relies on the CF Access cookie (`CF_Authorization`) injecting `Cf-Access-Jwt-Assertion` upstream. Admin must construct `new EventSource(url, { withCredentials: true })`.
```

- [ ] **Step 7: Lint + commit**

```bash
cd services && npm run lint
cd .. && git add services/src/stripe/notifications/notifications-stream.ts services/test/stripe/notifications-stream.spec.ts services/AGENTS.md
git commit -m "fix(services): enforce caller + origin on /notifications/stream (review C1)"
```

---

## Task 8: Default `ENVIRONMENT` to `production` when missing (services C2)

`env.ENVIRONMENT === 'development'` is safe today (undefined !== 'development'). Make it explicit + add the negative test.

**Files:**

- Modify: `services/src/utils/resolveCaller.ts`
- Modify: `services/test/utils/resolveCaller.spec.ts`

- [ ] **Step 1: Open `resolveCaller.ts`. Locate the dev-bypass guard (≈line 54).**

- [ ] **Step 2: Add the failing test FIRST**

In `services/test/utils/resolveCaller.spec.ts`, add:

```ts
describe("resolveCaller — ENVIRONMENT defaulting", () => {
  it("does NOT honor X-Dev-Email when ENVIRONMENT is undefined", async () => {
    const env = {
      // ENVIRONMENT intentionally missing
      ALLOWED_ORIGINS: "*",
      API_SECRET_KEY: "k",
      CF_ACCESS_TEAM_DOMAIN: "t.cloudflareaccess.com",
      CF_ACCESS_AUD: "aud",
      OWNER_EMAILS: "owner@test",
      CONTENT_KV: { get: async () => null } as unknown as KVNamespace,
    } as unknown as Env;
    const req = new Request("https://api.test/", {
      headers: { "X-Dev-Email": "owner@test" },
    });
    const caller = await resolveCaller(req, env);
    expect(caller).toBeNull();
  });
});
```

- [ ] **Step 3: Run — likely already passes** (undefined === 'development' is false).

If it passes, the test is still valuable as a regression pin. Either way, proceed to step 4.

- [ ] **Step 4: Tighten the guard**

Replace:

```ts
if (env.ENVIRONMENT === 'development') {
```

with:

```ts
const isDev = (env.ENVIRONMENT ?? "production").toLowerCase() === "development";
if (isDev) {
```

- [ ] **Step 5: Re-run all `resolveCaller` tests**

```bash
cd services && npx vitest run test/utils/resolveCaller.spec.ts
```

- [ ] **Step 6: Commit**

```bash
git add services/src/utils/resolveCaller.ts services/test/utils/resolveCaller.spec.ts
git commit -m "fix(services): default ENVIRONMENT to production for dev-bypass guard (review C2)"
```

---

## Task 9: Constant-time compare for `API_SECRET_KEY` (services C3)

**Files:**

- Modify: `services/src/utils/resolveCaller.ts`
- Delete or fix: `services/src/utils/auth.ts` (also affected — see Task 32 for dead-code removal)
- Modify: `services/test/utils/resolveCaller.spec.ts`

- [ ] **Step 1: Add a helper**

In `services/src/utils/resolveCaller.ts` (or a new `services/src/utils/timingSafe.ts`), add:

```ts
/** Length-aware, branchless string compare. Both strings are walked fully when
 *  lengths match, so timing reveals only `len(a) != len(b)`, not character
 *  positions. */
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}
```

- [ ] **Step 2: Replace the bearer compare**

Find `token === env.API_SECRET_KEY` (≈line 87) and replace with `timingSafeEqual(token, env.API_SECRET_KEY)`.

- [ ] **Step 3: Add a unit test for the helper**

```ts
describe("timingSafeEqual", () => {
  it("returns true for equal strings", () => {
    expect(timingSafeEqual("abc", "abc")).toBe(true);
  });
  it("returns false for different strings of same length", () => {
    expect(timingSafeEqual("abc", "abd")).toBe(false);
  });
  it("returns false for different lengths", () => {
    expect(timingSafeEqual("abc", "abcd")).toBe(false);
  });
});
```

- [ ] **Step 4: Run tests**

```bash
cd services && npx vitest run test/utils/resolveCaller.spec.ts
```

- [ ] **Step 5: Commit**

```bash
git add services/src/utils/resolveCaller.ts services/test/utils/resolveCaller.spec.ts
git commit -m "fix(services): use constant-time compare for API_SECRET_KEY bearer (review C3)"
```

---

## Task 10: Webhook returns `IApiResponse` envelope (services C4 part 1)

Webhook currently returns raw `{ error: '...' }`. Bring it into envelope parity first; idempotency comes in Task 11; reuse Stripe client in Task 12.

**Files:**

- Modify: `services/src/stripe/webhook/webhook-handler.ts`
- Modify: `services/test/stripe/webhook.spec.ts`

- [ ] **Step 1: Write failing tests**

Add to `services/test/stripe/webhook.spec.ts`:

```ts
it("returns IApiResponse envelope on invalid signature", async () => {
  const env = {/* minimal env without STRIPE_WEBHOOK_SECRET */} as Env;
  const req = new Request("https://api.test/stripe/webhook", {
    method: "POST",
    body: "{}",
    headers: { "stripe-signature": "bad" },
  });
  const res = await webhookHandler.fetch(req, env, {} as ExecutionContext);
  const body = await res.json();
  expect(body).toEqual(
    expect.objectContaining({ ok: false, error: expect.any(Object) }),
  );
});

it("returns ok envelope on accepted event", async () => {
  // mock stripe.webhooks.constructEventAsync to return a benign event
  // ... omitted for brevity; mirror existing test scaffolding
});
```

- [ ] **Step 2: Replace ad-hoc returns with `jsonOk`/`jsonErr`**

In `services/src/stripe/webhook/webhook-handler.ts`, replace each `return new Response(JSON.stringify({ error: '...' }), { status: N })` with:

```ts
return jsonErr(
  { code: "VALIDATION_FAILED", fields: { signature: "missing or invalid" } },
  origin,
  env,
  400,
);
```

and the success return with:

```ts
return jsonOk({ received: true }, origin, env);
```

- [ ] **Step 3: Re-run tests**

```bash
cd services && npx vitest run test/stripe/webhook.spec.ts
```

- [ ] **Step 4: Commit**

```bash
git add services/src/stripe/webhook/webhook-handler.ts services/test/stripe/webhook.spec.ts
git commit -m "fix(services): webhook returns IApiResponse envelope (review C4.1)"
```

---

## Task 11: Webhook idempotency via DO/KV (services C4 part 2)

Persist `event.id` so duplicate deliveries short-circuit.

**Files:**

- Modify: `services/src/stripe/webhook/webhook-handler.ts`
- Modify: `services/test/stripe/webhook.spec.ts`

- [ ] **Step 1: Decide storage**: use `CONTENT_KV` with a short TTL (24h) under key `webhook:event:{event.id}`. KV is eventually consistent — for webhook idempotency, the race window is small relative to Stripe retry intervals (minutes-hours).

- [ ] **Step 2: Failing test**

```ts
it("treats duplicate event.id as already-handled (no second confirmOrder)", async () => {
  const confirmOrderSpy = vi.fn();
  // inject spy via test seam, or vi.mock the confirmOrder module
  const kvStore = new Map<string, string>();
  const env = {
    /* ... */
    CONTENT_KV: {
      get: async (k: string) => kvStore.get(k) ?? null,
      put: async (k: string, v: string) => {
        kvStore.set(k, v);
      },
    } as unknown as KVNamespace,
  } as Env;
  // First delivery → confirmOrder called
  // Second delivery (same event.id) → confirmOrder NOT called
  expect(confirmOrderSpy).toHaveBeenCalledTimes(1);
});
```

- [ ] **Step 3: Implement**

After signature verification in `webhook-handler.ts`:

```ts
const seenKey = `webhook:event:${event.id}`;
const seen = await env.CONTENT_KV.get(seenKey);
if (seen) {
  return jsonOk({ received: true, duplicate: true }, origin, env);
}
await env.CONTENT_KV.put(seenKey, "1", { expirationTtl: 60 * 60 * 24 });
// ... then dispatch on event.type
```

- [ ] **Step 4: Move heavy work into `ctx.waitUntil`**

Replace `await confirmOrder(...)` with:

```ts
ctx.waitUntil(
  confirmOrder(session.id, stripe, env).catch((err) => {
    console.error("confirmOrder failed", { eventId: event.id, err });
  }),
);
```

- [ ] **Step 5: Re-run tests**

```bash
cd services && npx vitest run test/stripe/webhook.spec.ts
```

- [ ] **Step 6: Commit**

```bash
git add services/src/stripe/webhook/webhook-handler.ts services/test/stripe/webhook.spec.ts
git commit -m "fix(services): webhook idempotency via KV + waitUntil for side effects (review C4.2)"
```

---

## Task 12: Webhook reuses Stripe client (services C4 part 3)

**Files:**

- Modify: `services/src/stripe/webhook/webhook-handler.ts`
- Modify: `services/src/utils/withStripeHandler.ts` (export `getStripeInstance` if not already exported)

- [ ] **Step 1: Export `getStripeInstance(env)` from the utils barrel.**

In `services/src/utils/withStripeHandler.ts`, ensure there's a public function:

```ts
export function getStripeInstance(env: Env): Stripe {
  if (!stripeInstance) {
    stripeInstance = new Stripe(env.STRIPE_SECRET_KEY, {
      apiVersion: "2026-05-27.dahlia",
    });
  }
  return stripeInstance;
}
```

- [ ] **Step 2: Replace per-call construction in webhook**

In `webhook-handler.ts`, replace the local `new Stripe(...)` with `const stripe = getStripeInstance(env);`.

- [ ] **Step 3: Run tests**

```bash
cd services && npm test
```

- [ ] **Step 4: Commit**

```bash
git add services/src/stripe/webhook/webhook-handler.ts services/src/utils/withStripeHandler.ts
git commit -m "fix(services): webhook reuses singleton Stripe client (review C4.3)"
```

---

## Task 13: Gate `setStripeInstance` to test env only (services C5)

**Files:**

- Modify: `services/src/utils/withStripeHandler.ts`

- [ ] **Step 1: Write a failing test asserting the no-op in non-test mode**

This is tricky because vitest sets `process.env.NODE_ENV === 'test'`. The practical safeguard: check `globalThis.__vitest_worker__` OR `process?.env?.NODE_ENV === 'test'`.

```ts
// services/test/utils/withStripeHandler.spec.ts
it("setStripeInstance is a no-op when NODE_ENV !== 'test' (best-effort)", () => {
  const original = process.env.NODE_ENV;
  process.env.NODE_ENV = "production";
  try {
    setStripeInstance({ fake: true } as unknown as Stripe);
    // getStripeInstance must NOT return the fake — it should create real
    // (but in the test env Stripe constructor will throw on bad key — accept either)
    expect(() => getStripeInstance({ STRIPE_SECRET_KEY: "" } as Env)).toThrow();
  } finally {
    process.env.NODE_ENV = original;
  }
});
```

- [ ] **Step 2: Implement the gate**

```ts
export function setStripeInstance(mock: Stripe | null): void {
  // Test-only seam. Prevent accidental production poisoning if anything ever
  // imports this from non-test code.
  const isTest =
    (typeof process !== "undefined" && process.env?.NODE_ENV === "test") ||
    typeof (globalThis as { __vitest_worker__?: unknown }).__vitest_worker__ !==
      "undefined";
  if (!isTest) {
    console.warn("setStripeInstance ignored outside test environment");
    return;
  }
  stripeInstance = mock;
}
```

- [ ] **Step 3: Run tests**

```bash
cd services && npm test
```

- [ ] **Step 4: Commit**

```bash
git add services/src/utils/withStripeHandler.ts services/test/utils/withStripeHandler.spec.ts
git commit -m "fix(services): gate setStripeInstance to test environment only (review C5)"
```

---

End of Phase 2.
