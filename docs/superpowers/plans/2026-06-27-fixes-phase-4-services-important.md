# Phase 4 — `services/` IMPORTANT fixes

> Parent: `2026-06-27-repo-wide-code-review-fixes.md`. Tasks 18–32.

Each task follows the TDD + commit pattern. Where tests already exist, extend them; otherwise create alongside.

---

## Task 18: Persist `RateLimiterDO` counts in `state.storage` (services I1)

`counts` in memory is reset on every isolate eviction.

**Files:**

- Modify: `services/src/utils/rate-limiter-do.ts`
- Modify: `services/test/utils/rateLimiter.spec.ts`

- [ ] **Step 1: Failing test — count survives a simulated "reload"**

```ts
it("persists counts across reinitializations of the DO (simulated eviction)", async () => {
  const storage = new Map<string, unknown>();
  const fakeState = {
    storage: {
      get: async (k: string) => storage.get(k),
      put: async (k: string, v: unknown) => {
        storage.set(k, v);
      },
    },
    blockConcurrencyWhile: async (fn: () => Promise<unknown>) => fn(),
  };
  let do1 = new RateLimiterDO(fakeState as never, {} as never);
  await do1.check("k", 5, 60);
  await do1.check("k", 5, 60);
  // simulate eviction by constructing a new instance with the same storage
  const do2 = new RateLimiterDO(fakeState as never, {} as never);
  const r = await do2.check("k", 5, 60);
  expect(r.remaining).toBe(5 - 3); // 3rd request → 2 remaining
});
```

- [ ] **Step 2: Rewrite `check()`**

```ts
async check(key: string, max: number, windowSeconds: number) {
  return this.state.blockConcurrencyWhile(async () => {
    const now = Math.floor(Date.now() / 1000);
    const storageKey = `rl:${key}`;
    const entry = await this.state.storage.get<{ count: number; resetAt: number }>(storageKey);
    if (!entry || now >= entry.resetAt) {
      const next = { count: 1, resetAt: now + windowSeconds };
      await this.state.storage.put(storageKey, next, { expirationTtl: windowSeconds + 5 });
      return { allowed: true, remaining: max - 1, resetTime: next.resetAt };
    }
    if (entry.count >= max) {
      return { allowed: false, remaining: 0, resetTime: entry.resetAt };
    }
    entry.count++;
    await this.state.storage.put(storageKey, entry, { expirationTtl: windowSeconds + 5 });
    return { allowed: true, remaining: max - entry.count, resetTime: entry.resetAt };
  });
}
```

Remove the in-memory `counts: Map`.

- [ ] **Step 3: Run tests, commit**

```bash
cd services && npx vitest run test/utils/rateLimiter.spec.ts
git add services/src/utils/rate-limiter-do.ts services/test/utils/rateLimiter.spec.ts
git commit -m "fix(services): RateLimiterDO persists counts via state.storage (review I1)"
```

---

## Task 19: Rate limiter fails closed-ish with logging (services I2)

On DO error, log loudly and continue to allow (preserve availability) — but the log must reach observability.

**Files:**

- Modify: `services/src/utils/rateLimiter.ts`

- [ ] **Step 1: Add console.error before fail-open return**

```ts
try {
  return await stub.check(/* ... */);
} catch (err) {
  console.error("rate-limiter DO unreachable; failing open", {
    err: String(err),
    key,
  });
  return { allowed: true, remaining: -1, resetTime: 0 };
}
```

- [ ] **Step 2: Add a test asserting the console.error fires on error**

```ts
it("logs to console.error when DO throws and still allows", async () => {
  const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  // ... build env with stub that throws
  const r = await rateLimitCheck(env, "k");
  expect(r.allowed).toBe(true);
  expect(errSpy).toHaveBeenCalled();
});
```

- [ ] **Step 3: Commit**

```bash
git add services/src/utils/rateLimiter.ts services/test/utils/rateLimiter.spec.ts
git commit -m "fix(services): rate limiter logs DO errors before failing open (review I2)"
```

---

## Task 20: Validate `success_url` / `cancel_url` hostnames (services I3)

**Files:**

- Modify: `services/src/stripe/checkout/stripe-checkout.ts`
- Modify: `services/src/utils/handleCORS.ts` (export `isAllowedOrigin` helper if not already; or reuse)
- Modify: `services/test/stripe/checkout.spec.ts`

- [ ] **Step 1: Add a helper**

In `services/src/utils/url.ts` (create if needed):

```ts
export function hostnameAllowed(
  rawUrl: string,
  allowedOrigins: string,
): boolean {
  if (allowedOrigins === "*") return true;
  try {
    const u = new URL(rawUrl);
    const allowed = allowedOrigins
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    return allowed.some((o) => {
      try {
        return new URL(o).hostname === u.hostname;
      } catch {
        return false;
      }
    });
  } catch {
    return false;
  }
}
```

- [ ] **Step 2: Use in `handleCheckout`**

After the existing `isValidUrl` checks:

```ts
if (
  !hostnameAllowed(body.success_url, env.ALLOWED_ORIGINS) ||
  !hostnameAllowed(body.cancel_url, env.ALLOWED_ORIGINS)
) {
  return jsonErr(
    {
      code: "VALIDATION_FAILED",
      fields: {
        urls: "success_url and cancel_url must match an allowed origin",
      },
    },
    origin,
    env,
    400,
  );
}
```

- [ ] **Step 3: Failing test**

```ts
it("rejects success_url whose hostname is outside ALLOWED_ORIGINS", async () => {
  const env = { ALLOWED_ORIGINS: "https://shop.test" /* ... */ } as Env;
  const req = new Request("https://api.test/checkout", {
    method: "POST",
    body: JSON.stringify({
      line_items: [{ price: "price_1", quantity: 1 }],
      success_url: "https://evil.test/win",
      cancel_url: "https://shop.test/cancel",
    }),
  });
  const res = await checkoutHandler.fetch(req, env, {} as ExecutionContext);
  expect(res.status).toBe(400);
});
```

- [ ] **Step 4: Run + commit**

```bash
cd services && npx vitest run test/stripe/checkout.spec.ts
git add services/src/stripe/checkout/stripe-checkout.ts services/src/utils/url.ts services/test/stripe/checkout.spec.ts
git commit -m "fix(services): validate checkout success/cancel URLs against allowed origins (review I3)"
```

---

## Task 21: Reduce double-fetch for `total_count` on `/products` (services I4)

Add a short-TTL KV cache for unfiltered product counts; remove the double-fetch when filtering is requested by returning `total_count: null` and letting clients trust `has_more`.

**Files:**

- Modify: `services/src/stripe/product/get-products.ts`
- Modify: `services/test/stripe/products.spec.ts`

- [ ] **Step 1: Cache key**

`products:count:v1` with TTL 120s.

- [ ] **Step 2: Implement cache around `total_count`**

```ts
async function getCachedProductCount(
  env: Env,
  stripe: Stripe,
): Promise<number> {
  const cached = await env.CONTENT_KV.get("products:count:v1");
  if (cached) return Number(cached);
  const all = await fetchAllActiveProducts(stripe);
  const n = all.length;
  await env.CONTENT_KV.put("products:count:v1", String(n), {
    expirationTtl: 120,
  });
  return n;
}
```

Wire into the handler — call only when filters are absent.

- [ ] **Step 3: For filtered paths, return `total_count: null`**

Change the response type to `total_count?: number | null` and document.

- [ ] **Step 4: Update tests**

Existing `total_count` assertions become "either the cached number or null".

- [ ] **Step 5: Commit**

```bash
git add services/src/stripe/product/get-products.ts services/test/stripe/products.spec.ts
git commit -m "perf(services): cache unfiltered product count (KV 120s); null total_count when filtered (review I4)"
```

---

## Task 22: Reject unknown `starting_after` in `paginateArray` (services I5)

**Files:**

- Modify: `services/src/utils/paginate.ts`
- Modify: `services/test/utils/paginate.spec.ts`

- [ ] **Step 1: Failing test**

```ts
it("returns empty data + hasMore: false when startingAfter is not found", () => {
  const r = paginateArray([{ id: "a" }, { id: "b" }], {
    startingAfter: "ghost",
    limit: 10,
  });
  expect(r).toEqual({ data: [], hasMore: false, lastId: null });
});
```

- [ ] **Step 2: Update implementation**

```ts
export function paginateArray<T extends { id: string }>(
  items: T[],
  { startingAfter, limit }: { startingAfter?: string; limit: number },
) {
  let startIdx = 0;
  if (startingAfter !== undefined) {
    const idx = items.findIndex((i) => i.id === startingAfter);
    if (idx === -1) {
      return { data: [], hasMore: false, lastId: null };
    }
    startIdx = idx + 1;
  }
  const data = items.slice(startIdx, startIdx + limit);
  const hasMore = startIdx + limit < items.length;
  const lastId = data.length > 0 ? data[data.length - 1].id : null;
  return { data, hasMore, lastId };
}
```

- [ ] **Step 3: Commit**

```bash
git add services/src/utils/paginate.ts services/test/utils/paginate.spec.ts
git commit -m "fix(services): paginateArray returns empty when cursor not found (review I5)"
```

---

## Task 23: Complete `escapeHtml` (services I6)

**Files:**

- Modify: `services/src/utils/escapeHtml.ts`
- Modify: `services/test/utils/escapeHtml.spec.ts`

- [ ] **Step 1: Failing test**

```ts
it("escapes single quotes", () => {
  expect(escapeHtml("o'reilly")).toBe("o&#39;reilly");
});
```

- [ ] **Step 2: Replace function**

```ts
export function escapeHtml(str: string = ""): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
```

- [ ] **Step 3: Commit**

```bash
git add services/src/utils/escapeHtml.ts services/test/utils/escapeHtml.spec.ts
git commit -m "fix(services): escapeHtml covers single-quote (review I6)"
```

---

## Task 24: Disable raw HTML in `marked` (services I7)

**Files:**

- Modify: `services/src/utils/buildEmailBody.ts`
- Modify: `services/test/utils/buildEmailBody.spec.ts`

- [ ] **Step 1: Failing test**

```ts
it("strips raw HTML from markdown input", () => {
  const html = buildEmailBody({
    format: "markdown",
    body: "Hi <script>alert(1)</script>",
  });
  expect(html).not.toMatch(/<script>/);
});
```

- [ ] **Step 2: Update marked config**

At module top:

```ts
import { marked } from "marked";
marked.setOptions({ async: false });
marked.use({
  renderer: {
    html: () => "", // drop raw HTML blocks
  },
});
```

(Or upgrade to a sanitizer pass — for the worker, the renderer override is sufficient.)

- [ ] **Step 3: Commit**

```bash
git add services/src/utils/buildEmailBody.ts services/test/utils/buildEmailBody.spec.ts
git commit -m "fix(services): marked drops raw HTML in email markdown (review I7)"
```

---

## Task 25: Reuse webhook session payload, assert `livemode` (services I8)

**Files:**

- Modify: `services/src/stripe/order/confirm-order.ts`
- Modify: `services/test/stripe/confirm-order.spec.ts`

- [ ] **Step 1: Change signature**

`confirmOrder(session: Stripe.Checkout.Session, stripe: Stripe, env: Env)` instead of `(sessionId, stripe, env)`. Drop the re-`retrieve`.

- [ ] **Step 2: Assert livemode parity**

```ts
if (session.livemode !== (env.ENVIRONMENT === "production")) {
  console.warn("livemode mismatch", {
    livemode: session.livemode,
    env: env.ENVIRONMENT,
  });
  // proceed; this is defensive logging, not enforcement
}
```

- [ ] **Step 3: Update webhook caller** to pass `event.data.object` directly.

- [ ] **Step 4: Commit**

```bash
git add services/src/stripe/order/confirm-order.ts services/src/stripe/webhook/webhook-handler.ts services/test/
git commit -m "perf(services): confirmOrder reuses webhook session payload; livemode warn (review I8)"
```

---

## Task 26: Memoize JWKS + cache staff list (services I9)

**Files:**

- Modify: `services/src/utils/resolveCaller.ts`

- [ ] **Step 1: Hoist JWKS instance**

```ts
let jwksCache: {
  domain: string;
  jwks: ReturnType<typeof createRemoteJWKSet>;
} | null = null;
function getJwks(domain: string) {
  if (!jwksCache || jwksCache.domain !== domain) {
    jwksCache = {
      domain,
      jwks: createRemoteJWKSet(
        new URL(`https://${domain}/cdn-cgi/access/certs`),
      ),
    };
  }
  return jwksCache.jwks;
}
```

Use `getJwks(env.CF_ACCESS_TEAM_DOMAIN)` instead of inline `createRemoteJWKSet`.

- [ ] **Step 2: Cache staff list with 30s TTL**

```ts
let staffCache: { at: number; list: IStaffList } | null = null;
const STAFF_TTL_MS = 30_000;

async function getStaffList(env: Env): Promise<IStaffList> {
  const now = Date.now();
  if (staffCache && now - staffCache.at < STAFF_TTL_MS) return staffCache.list;
  const raw = await env.CONTENT_KV.get("staff");
  const parsed = raw ? StaffListSchema.safeParse(JSON.parse(raw)) : null;
  const list = parsed?.success ? parsed.data : [];
  staffCache = { at: now, list };
  return list;
}
```

Note: each Worker isolate has its own cache — that's fine. Eventual consistency window: 30s.

- [ ] **Step 3: Add a test for staff cache**

```ts
it("caches staff list across calls within the TTL window", async () => {
  const get = vi.fn().mockResolvedValue(JSON.stringify([{ email: "o@t", role: "OWNER" }]));
  const env = { CONTENT_KV: { get } as never, /* ... */ } as Env;
  await resolveCaller(/* req w/ valid bearer */, env);
  await resolveCaller(/* req w/ valid bearer */, env);
  expect(get).toHaveBeenCalledTimes(1);
});
```

- [ ] **Step 4: Commit**

```bash
git add services/src/utils/resolveCaller.ts services/test/utils/resolveCaller.spec.ts
git commit -m "perf(services): memoize JWKS and cache staff list 30s in resolveCaller (review I9)"
```

---

## Task 27: Pin JWT `algorithms` + `issuer` (services I10)

**Files:**

- Modify: `services/src/utils/resolveCaller.ts`

- [ ] **Step 1: Add explicit options**

```ts
const { payload } = await jwtVerify(jwtAssertion, JWKS, {
  audience: env.CF_ACCESS_AUD,
  issuer: `https://${env.CF_ACCESS_TEAM_DOMAIN}`,
  algorithms: ["RS256"],
});
```

- [ ] **Step 2: Update tests**

Wherever a JWT mock is constructed, ensure the issuer matches `https://<CF_ACCESS_TEAM_DOMAIN>`.

- [ ] **Step 3: Add negative tests**: wrong issuer rejected; wrong alg rejected (if you can sign with HS256 in a test).

- [ ] **Step 4: Commit**

```bash
git add services/src/utils/resolveCaller.ts services/test/utils/resolveCaller.spec.ts
git commit -m "fix(services): pin JWT algorithms and issuer in jwtVerify (review I10)"
```

---

## Task 28: Delete dead `auth.ts` + reconcile docs (services I11)

**Files:**

- Delete: `services/src/utils/auth.ts`
- Delete: `services/test/utils/auth.spec.ts`
- Modify: `services/src/utils/index.ts` (remove `export * from "./auth"`)
- Modify: `services/AGENTS.md`

- [ ] **Step 1: Confirm zero usages**

```bash
grep -rn "checkAuth\|from.*utils/auth" services/src/ services/test/
```

- [ ] **Step 2: Delete files**

```bash
rm services/src/utils/auth.ts services/test/utils/auth.spec.ts
```

- [ ] **Step 3: Remove the barrel export.** Edit `services/src/utils/index.ts`.

- [ ] **Step 4: Update `services/AGENTS.md`** — remove any sentence that says `checkAuth` is still used.

- [ ] **Step 5: Build + test**

```bash
cd services && npm test && npm run lint
```

- [ ] **Step 6: Commit**

```bash
git add services/
git commit -m "chore(services): remove dead checkAuth; reconcile AGENTS.md (review I11)"
```

---

## Task 29: Refuse `ALLOWED_ORIGINS=*` outside dev (services I12)

**Files:**

- Modify: `services/src/utils/handleCORS.ts`

- [ ] **Step 1: Add a guard**

```ts
export function isAllowedOrigin(origin: string | null, env: Env): boolean {
  if (env.ALLOWED_ORIGINS === "*") {
    if ((env.ENVIRONMENT ?? "production") !== "development") {
      console.error("ALLOWED_ORIGINS=* is not permitted outside development");
      return false;
    }
    return true;
  }
  if (!origin) return false;
  const list = env.ALLOWED_ORIGINS.split(",").map((s) => s.trim());
  return list.includes(origin);
}
```

- [ ] **Step 2: Test both branches.**

- [ ] **Step 3: Commit**

```bash
git add services/src/utils/handleCORS.ts services/test/utils/handleCORS.spec.ts
git commit -m "fix(services): refuse ALLOWED_ORIGINS=* outside development (review I12)"
```

---

## Task 30: Notifications stream try/catch + envelope on DO failure (services I13)

**Files:**

- Modify: `services/src/stripe/notifications/notifications-stream.ts`

- [ ] **Step 1: Wrap the stub fetch**

```ts
try {
  return await stub.fetch(forwarded);
} catch (err) {
  console.error("NotificationHub DO unreachable", err);
  return jsonErr({ code: "INTERNAL" }, origin, env, 500);
}
```

- [ ] **Step 2: Test + commit**

```bash
git add services/src/stripe/notifications/notifications-stream.ts services/test/stripe/notifications-stream.spec.ts
git commit -m "fix(services): notifications-stream returns envelope on DO failure (review I13)"
```

---

## Task 31: Zod-validate product/order update bodies (services I14)

**Files:**

- Modify: `services/src/stripe/product/update-product.ts`
- Modify: `services/src/stripe/order/update-order.ts`
- Modify: `shared/src/product.ts` and `shared/src/order.ts` to export update schemas
- Build: `npm run shared:build`

- [ ] **Step 1: Define `ProductUpdateRequestSchema` in `shared/src/product.ts`**

```ts
export const ProductUpdateRequestSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).optional(),
  active: z.boolean().optional(),
  images: z.array(z.string().url()).max(8).optional(),
  metadata: z.record(z.string(), z.string()).optional(),
  default_price: z
    .string()
    .regex(/^price_/)
    .optional(),
});
export type IProductUpdateRequest = z.infer<typeof ProductUpdateRequestSchema>;
```

- [ ] **Step 2: Use in handler**

```ts
const body = await request.json();
const parsed = ProductUpdateRequestSchema.safeParse(body);
if (!parsed.success) {
  return jsonErr(
    { code: "VALIDATION_FAILED", fields: zodFlatten(parsed.error) },
    origin,
    env,
    400,
  );
}
const safe = parsed.data;
```

- [ ] **Step 3: Repeat for order update** with explicit fields (status, metadata, collected_information shape).

- [ ] **Step 4: Failing test asserting unknown fields are stripped**

```ts
it("rejects update payloads with disallowed fields", async () => {
  const req = new Request("https://api/products/prod_x", {
    method: "PUT",
    body: JSON.stringify({ default_price: "not_a_price_id" }),
  });
  const res = await updateProduct.fetch(req, env, {} as ExecutionContext);
  expect(res.status).toBe(400);
});
```

- [ ] **Step 5: Commit**

```bash
git add shared/src/ services/src/stripe/product/update-product.ts services/src/stripe/order/update-order.ts services/test/
git commit -m "fix(services): Zod-validate product/order update bodies (review I14)"
```

---

## Task 32: Whitelist `metadata.order_status` (services I15)

**Files:**

- Modify: `shared/src/order.ts`
- Modify: `services/src/stripe/order/update-order.ts`

- [ ] **Step 1: Add enum + schema in `shared/src/order.ts`**

```ts
export enum EOrderFulfillmentStatus {
  NEW = "new",
  PROCESSING = "processing",
  SHIPPED = "shipped",
  DELIVERED = "delivered",
  CANCELLED = "cancelled",
}
export const OrderFulfillmentStatusSchema = z.nativeEnum(
  EOrderFulfillmentStatus,
);
```

- [ ] **Step 2: Use in order-update body schema**

Replace any `order_status: z.string().optional()` with `order_status: OrderFulfillmentStatusSchema.optional()`.

- [ ] **Step 3: Failing test + commit**

```bash
git add shared/src/order.ts services/src/stripe/order/update-order.ts services/test/
git commit -m "fix(services): whitelist metadata.order_status against enum (review I15)"
```

---

End of Phase 4.
