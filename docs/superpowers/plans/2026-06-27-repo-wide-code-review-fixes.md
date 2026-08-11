# Repo-Wide Code Review Fixes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Address every Critical, Important, and Minor finding from the 2026-06-27 repo-wide code review across `shared/`, `services/`, `admin/`, `web/`.

**Architecture:** Fix in order of risk: revenue-path bugs first (web checkout), then auth/security (services), then admin correctness, then shared/ envelope hardening, then minors. Strict TDD throughout — failing test first, then fix.

**Tech Stack:** TypeScript, Cloudflare Workers, React 19, Redux Toolkit, Vite, Vitest, Zod, axios, Stripe, jose (JWT), `@bee-epic/shared` (file: dep).

**Conventions (binding):**

- All interfaces `I*` prefixed; enums `E*` prefixed.
- Every endpoint returns `IApiResponse<T>` envelope from `@bee-epic/shared`.
- `data-testid="component-name"` on root, `_element` on interactive children.
- Commit after each task. `git commit -m "<type>(<scope>): <subject>"` (conventional commits).
- After every code change, run `npm run test` and `npm run lint` for affected sub-projects.

**Branch:** Work on `master` (the only branch). Commits are small and frequent so reverts stay local.

---

## Severity & sequencing

| Phase | Theme                                             | Tasks |
| ----- | ------------------------------------------------- | ----- |
| 0     | Test harness for `web/` (no tests today)          | 1     |
| 1     | **CRITICAL** — `web/` checkout & cart correctness | 2–6   |
| 2     | **CRITICAL** — `services/` auth/security          | 7–13  |
| 3     | **CRITICAL** — `admin/` auth + state              | 14–17 |
| 4     | **IMPORTANT** — `services/` hardening             | 18–32 |
| 5     | **IMPORTANT** — `admin/` UX & correctness         | 33–46 |
| 6     | **IMPORTANT** — `web/` UX & correctness           | 47–58 |
| 7     | **IMPORTANT** — `shared/` envelope & schemas      | 59–64 |
| 8     | **MINOR** — `services/` cleanup                   | 65–72 |
| 9     | **MINOR** — `admin/` cleanup                      | 73–79 |
| 10    | **MINOR** — `web/` cleanup                        | 80–86 |
| 11    | **MINOR** — `shared/` cleanup                     | 87–92 |
| 12    | Final verification                                | 93    |

---

## Conventions for this plan

- Every task ends with `git add` + `git commit`.
- For TDD: write the failing test first, run it, observe the failure mode, then write the fix, run again, observe pass. Don't skip the failing-test run.
- After any change to `shared/src/*`, run `npm run shared:build` before testing consumers.
- After any change to `services/wrangler.jsonc` bindings, run `npm run services:cf-typegen`.
- Lint must pass: `npm run <project>:lint` with `--max-warnings 0`.

---

# Phase 0 — Bootstrap `web/` test harness

`web/` has no `vitest.config.ts` and no tests today (review finding #11). Phase 1 needs the harness to exist before we can TDD the checkout fix.

## Task 1: Add vitest config to `web/` and write a smoke test

**Files:**

- Create: `web/vitest.config.ts`
- Create: `web/src/__tests__/smoke.test.ts`
- Modify: `web/package.json` (devDependencies — add `@testing-library/react`, `@testing-library/jest-dom`, `jsdom`)
- Create: `web/src/test/setup.ts`

- [ ] **Step 1: Install test dependencies**

```bash
cd web && npm install --save-dev @testing-library/react @testing-library/jest-dom @testing-library/user-event jsdom @vitest/coverage-v8
```

- [ ] **Step 2: Create `web/src/test/setup.ts`**

```ts
import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

afterEach(() => {
  cleanup();
});
```

- [ ] **Step 3: Create `web/vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "lcov"],
      include: ["src/**/*.{ts,tsx}"],
      exclude: [
        "src/**/*.d.ts",
        "src/**/__tests__/**",
        "src/test/**",
        "src/main.tsx",
      ],
    },
  },
});
```

- [ ] **Step 4: Write the smoke test**

```ts
// web/src/__tests__/smoke.test.ts
import { describe, it, expect } from "vitest";

describe("web test harness", () => {
  it("runs", () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [ ] **Step 5: Run and verify**

```bash
cd web && npm test
```

Expected: 1 test passes.

- [ ] **Step 6: Commit**

```bash
git add web/vitest.config.ts web/src/test/setup.ts web/src/__tests__/smoke.test.ts web/package.json web/package-lock.json
git commit -m "test(web): bootstrap vitest harness with jsdom and RTL"
```

---

# Phase 1 — CRITICAL: `web/` checkout & cart

## Task 2: Fix `useStripeCheckout` envelope unwrap (review #1)

Worker returns `IApiResponse<{ sessions: string[]; message: string }>`. Hook reads `data.sessions` instead of `data.data.sessions`. Every checkout silently fails.

**Files:**

- Create: `web/src/hooks/__tests__/useStripeCheckout.test.tsx`
- Modify: `web/src/hooks/useStripeCheckout.ts`

- [ ] **Step 1: Write the failing test**

```tsx
// web/src/hooks/__tests__/useStripeCheckout.test.tsx
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useStripeCheckout } from "../useStripeCheckout";
import type { ICartItem } from "../../types";

const mockItem: ICartItem = {
  product: {
    id: "prod_1",
    slug: "honey",
    name: "Honey",
    description: "",
    price: 1000,
    currency: "usd",
    images: [],
    category: "HONEY" as never,
    tags: [],
    inStock: true,
    featured: false,
    stripeProductId: "prod_1",
    stripePriceId: "price_test_1",
  } as unknown as ICartItem["product"],
  quantity: 1,
};

describe("useStripeCheckout", () => {
  const originalLocation = window.location;
  const hrefSetter = vi.fn();

  beforeEach(() => {
    // @ts-expect-error override read-only location
    delete window.location;
    // @ts-expect-error stub
    window.location = {
      origin: "https://shop.test",
      get href() {
        return "";
      },
      set href(v: string) {
        hrefSetter(v);
      },
    };
    hrefSetter.mockClear();
  });

  afterEach(() => {
    // @ts-expect-error restore
    window.location = originalLocation;
    vi.restoreAllMocks();
  });

  it("redirects to sessions[0] when envelope is { ok: true, data: { sessions } }", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          ok: true,
          data: {
            sessions: ["https://stripe/cs_1"],
            message: "Single checkout session created",
          },
        }),
      }),
    );

    const { result } = renderHook(() => useStripeCheckout());
    await act(async () => {
      await result.current.checkout([mockItem]);
    });

    expect(hrefSetter).toHaveBeenCalledWith("https://stripe/cs_1");
    expect(result.current.error).toBeNull();
  });

  it("surfaces envelope error.message on { ok: false }", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        json: async () => ({
          ok: false,
          error: { code: "VALIDATION_FAILED", fields: { line_items: "bad" } },
        }),
      }),
    );

    const { result } = renderHook(() => useStripeCheckout());
    await act(async () => {
      await result.current.checkout([mockItem]);
    });

    expect(hrefSetter).not.toHaveBeenCalled();
    expect(result.current.error).toMatch(
      /bad|VALIDATION_FAILED|Payment failed/,
    );
    expect(result.current.isProcessing).toBe(false);
  });

  it("blocks empty cart with friendly error", async () => {
    const { result } = renderHook(() => useStripeCheckout());
    await act(async () => {
      await result.current.checkout([]);
    });
    expect(result.current.error).toBe("Your cart is empty");
  });
});
```

- [ ] **Step 2: Run the test and observe failure**

```bash
cd web && npx vitest run src/hooks/__tests__/useStripeCheckout.test.tsx
```

Expected: First test FAILs because `hrefSetter` never called — `data.sessions` is undefined.

- [ ] **Step 3: Implement the fix**

Replace lines 69–82 of `web/src/hooks/useStripeCheckout.ts` with:

```ts
const envelope = (await response.json()) as
  | { ok: true; data: { sessions: string[]; message: string } }
  | {
      ok: false;
      error: {
        code: string;
        message?: string;
        fields?: Record<string, string>;
      };
    };

if (!response.ok || !envelope.ok) {
  const message = !envelope.ok
    ? (envelope.error.message ??
      (envelope.error.fields
        ? Object.values(envelope.error.fields).join(", ")
        : null) ??
      `Payment failed (${envelope.error.code}). Please try again.`)
    : "Payment failed. Please try again.";
  setError(message);
  setIsProcessing(false);
  return;
}

const { sessions } = envelope.data;
if (sessions && sessions.length > 0) {
  window.location.href = sessions[0];
} else {
  setError("No checkout session returned. Please try again.");
  setIsProcessing(false);
}
```

- [ ] **Step 4: Run the test and verify pass**

```bash
cd web && npx vitest run src/hooks/__tests__/useStripeCheckout.test.tsx
```

Expected: 3 tests PASS.

- [ ] **Step 5: Lint**

```bash
cd web && npm run lint
```

- [ ] **Step 6: Commit**

```bash
git add web/src/hooks/useStripeCheckout.ts web/src/hooks/__tests__/useStripeCheckout.test.tsx
git commit -m "fix(web): unwrap IApiResponse envelope in useStripeCheckout (review #1)"
```

---

## Task 3: Block mixed carts client-side (review #2)

Worker can return two sessions (recurring + one-time); client only uses `sessions[0]`. Easiest correct fix: refuse mixed carts client-side until subscription products exist; document the constraint.

**Files:**

- Modify: `web/src/hooks/useStripeCheckout.ts`
- Modify: `web/src/hooks/__tests__/useStripeCheckout.test.tsx`

- [ ] **Step 1: Add a failing test that asserts `sessions.length > 1` is rejected**

Append to the test file:

```tsx
it("rejects multi-session responses (mixed cart) with a clear error", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        ok: true,
        data: {
          sessions: ["https://stripe/cs_a", "https://stripe/cs_b"],
          message: "Multiple checkout sessions created",
        },
      }),
    }),
  );
  const { result } = renderHook(() => useStripeCheckout());
  await act(async () => {
    await result.current.checkout([mockItem]);
  });
  expect(hrefSetter).not.toHaveBeenCalled();
  expect(result.current.error).toMatch(/one type|mixed cart|separately/i);
});
```

- [ ] **Step 2: Run, observe failure** (`window.location.href` was set to first session)

```bash
cd web && npx vitest run src/hooks/__tests__/useStripeCheckout.test.tsx
```

- [ ] **Step 3: Update the success branch to detect multi-session**

In `useStripeCheckout.ts`, replace the `if (sessions && sessions.length > 0)` block with:

```ts
if (!sessions || sessions.length === 0) {
  setError("No checkout session returned. Please try again.");
  setIsProcessing(false);
  return;
}
if (sessions.length > 1) {
  // Mixed carts (subscription + one-time) produce two sessions. We don't
  // support that flow yet — see plan task 3 / review finding #2.
  setError(
    "Your cart mixes subscription and one-time items. Please check out each type separately.",
  );
  setIsProcessing(false);
  return;
}
window.location.href = sessions[0];
```

- [ ] **Step 4: Run tests — verify all 4 pass**

```bash
cd web && npx vitest run src/hooks/__tests__/useStripeCheckout.test.tsx
```

- [ ] **Step 5: Commit**

```bash
git add web/src/hooks/useStripeCheckout.ts web/src/hooks/__tests__/useStripeCheckout.test.tsx
git commit -m "fix(web): refuse mixed (subscription + one-time) carts in checkout (review #2)"
```

---

## Task 4: Validate cart localStorage shape with Zod (review #3)

`loadCartFromStorage` parses `JSON.parse(stored)` and trusts the result. Any drift crashes the app on `items.reduce`.

**Files:**

- Modify: `web/src/store/cartSlice.ts`
- Create: `web/src/store/__tests__/cartSlice.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
// web/src/store/__tests__/cartSlice.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import cartReducer, {
  addToCart,
  removeFromCart,
  updateQuantity,
  clearCart,
} from "../cartSlice";
import type { IProduct } from "../../types";

const product = (id: string): IProduct =>
  ({
    id,
    slug: id,
    name: `P-${id}`,
    description: "",
    price: 1000,
    currency: "usd",
    images: [],
    category: "HONEY" as never,
    tags: [],
    inStock: true,
    featured: false,
    stripeProductId: id,
    stripePriceId: `price_${id}`,
  }) as unknown as IProduct;

describe("cartSlice load-from-storage shape validation", () => {
  beforeEach(() => localStorage.clear());

  it("falls back to [] when storage holds non-array JSON", async () => {
    localStorage.setItem("beeEpicCart", JSON.stringify({ items: "nope" }));
    const mod = await import("../cartSlice");
    const state = mod.default(undefined, { type: "@@INIT" });
    expect(state.items).toEqual([]);
  });

  it("falls back to [] when stored items miss required fields", async () => {
    localStorage.setItem("beeEpicCart", JSON.stringify([{ quantity: 1 }]));
    const mod = await import("../cartSlice");
    const state = mod.default(undefined, { type: "@@INIT" });
    expect(state.items).toEqual([]);
  });

  it("falls back to [] on invalid JSON", async () => {
    localStorage.setItem("beeEpicCart", "not-json");
    const mod = await import("../cartSlice");
    const state = mod.default(undefined, { type: "@@INIT" });
    expect(state.items).toEqual([]);
  });
});
```

- [ ] **Step 2: Run, observe failures** — the first two pass through silently and the reducer doesn't fall back.

Note: `cartSlice` is imported at module load, so `localStorage` must be set before the import. The dynamic `await import()` + module cache means each test must run with a fresh module — use `vi.resetModules()`:

Update each test in step 1 to add `vi.resetModules()` before the dynamic import. Replace the body of each test with:

```ts
vi.resetModules();
localStorage.setItem("beeEpicCart" /* per case */);
const mod = await import("../cartSlice");
const state = mod.default(undefined, { type: "@@INIT" });
expect(state.items).toEqual([]);
```

- [ ] **Step 3: Implement the fix in `cartSlice.ts`**

Replace `loadCartFromStorage` with:

```ts
import { z } from "zod";
// ... existing imports

const CartItemSchema = z.object({
  product: z
    .object({
      id: z.string(),
      slug: z.string(),
      name: z.string(),
      stripePriceId: z.string().optional(),
    })
    .passthrough(),
  quantity: z.number().int().positive(),
});
const CartItemsSchema = z.array(CartItemSchema);

const loadCartFromStorage = (): ICartItem[] => {
  try {
    const stored = localStorage.getItem("beeEpicCart");
    if (!stored) return [];
    const parsed = JSON.parse(stored) as unknown;
    const result = CartItemsSchema.safeParse(parsed);
    if (!result.success) {
      // Stale or corrupt cart shape — drop it instead of crashing later.
      localStorage.removeItem("beeEpicCart");
      return [];
    }
    return result.data as ICartItem[];
  } catch {
    return [];
  }
};
```

- [ ] **Step 4: Run tests**

```bash
cd web && npx vitest run src/store/__tests__/cartSlice.test.ts
```

Expected: 3 PASS.

- [ ] **Step 5: Commit**

```bash
git add web/src/store/cartSlice.ts web/src/store/__tests__/cartSlice.test.ts
git commit -m "fix(web): validate cart localStorage shape with Zod, drop corrupt entries (review #3)"
```

---

## Task 5: Split `addToCart` semantics — add vs setQuantity (review #4)

`addToCart` currently replaces quantity. `ProductCard` expects increment; `ProductDetailPage` expects set. Fix: `addToCart` increments; `ProductDetailPage` switches to `updateQuantity` for explicit sets.

**Files:**

- Modify: `web/src/store/cartSlice.ts`
- Modify: `web/src/store/__tests__/cartSlice.test.ts`
- Audit + modify callers under `web/src/`

- [ ] **Step 1: Audit callers**

```bash
cd web && grep -rn "addToCart\|dispatch(add" src/ | grep -v __tests__
```

Note every call site. Expected: `useCart.ts`, `ProductCard`, `ProductDetailPage` (or wherever they live).

- [ ] **Step 2: Write failing tests**

Append to `cartSlice.test.ts`:

```ts
describe("cartSlice addToCart semantics", () => {
  it("increments quantity for existing item instead of replacing", () => {
    const initial = cartReducer(undefined, { type: "@@INIT" });
    const after1 = cartReducer(
      initial,
      addToCart({ product: product("a"), quantity: 2 }),
    );
    const after2 = cartReducer(
      after1,
      addToCart({ product: product("a"), quantity: 3 }),
    );
    expect(after2.items).toHaveLength(1);
    expect(after2.items[0].quantity).toBe(5);
  });

  it("adds new item with given quantity when not in cart", () => {
    const initial = cartReducer(undefined, { type: "@@INIT" });
    const after = cartReducer(
      initial,
      addToCart({ product: product("a"), quantity: 4 }),
    );
    expect(after.items[0].quantity).toBe(4);
  });

  it("updateQuantity sets explicit value (used for explicit-set flows)", () => {
    const initial = cartReducer(undefined, { type: "@@INIT" });
    const after1 = cartReducer(
      initial,
      addToCart({ product: product("a"), quantity: 2 }),
    );
    const after2 = cartReducer(
      after1,
      updateQuantity({ id: "a", quantity: 7 }),
    );
    expect(after2.items[0].quantity).toBe(7);
  });
});
```

- [ ] **Step 3: Run, observe failure** (current reducer replaces).

- [ ] **Step 4: Update reducer**

In `cartSlice.ts`:

```ts
    addToCart: (
      state,
      action: PayloadAction<{ product: IProduct; quantity: number }>,
    ) => {
      const { product, quantity } = action.payload;
      if (quantity <= 0) return;
      const existingItem = state.items.find(
        (item) => item.product.id === product.id,
      );
      if (existingItem) {
        existingItem.quantity += quantity; // INCREMENT (was: replace)
      } else {
        state.items.push({ product, quantity });
      }
    },
```

- [ ] **Step 5: Update ProductDetailPage to use updateQuantity for explicit set**

Find the file:

```bash
cd web && grep -rln "addToCart\b" src/ | xargs grep -l "ProductDetail"
```

Open the relevant page (likely `web/src/components/pages/ProductDetailPage.tsx`). The "set qty then add" flow should now be:

1. If product not in cart → `dispatch(addToCart({ product, quantity }))`
2. If product already in cart → `dispatch(updateQuantity({ id: product.id, quantity }))`

Wrap into a helper inside the component:

```ts
const handleAddToCart = useCallback(() => {
  const existing = items.find((i) => i.product.id === product.id);
  if (existing) {
    dispatch(updateQuantity({ id: product.id, quantity }));
  } else {
    dispatch(addToCart({ product, quantity }));
  }
}, [items, product, quantity, dispatch]);
```

(`items` comes from `useAppSelector((s) => s.cart.items)`; add the import.)

- [ ] **Step 6: Re-run tests**

```bash
cd web && npx vitest run src/store/__tests__/cartSlice.test.ts
```

Expected: all PASS.

- [ ] **Step 7: Manual smoke**

```bash
cd web && npm run dev
```

Open the storefront, click "Add to Cart" twice on the same product, confirm cart shows quantity 2 (not 1). Increase quantity on Product Detail page, click Add — confirm cart now shows that quantity, not a sum. Stop the dev server.

- [ ] **Step 8: Commit**

```bash
git add web/src/store/cartSlice.ts web/src/store/__tests__/cartSlice.test.ts web/src/components/pages/ProductDetailPage.tsx
git commit -m "fix(web): addToCart increments; ProductDetail uses updateQuantity for explicit set (review #4)"
```

---

## Task 6: PWA `start_url` / `scope` absolute (review #5)

**Files:**

- Modify: `web/vite.config.ts`

- [ ] **Step 1: Open `web/vite.config.ts` and locate the manifest block.**

- [ ] **Step 2: Replace**

```ts
      start_url: ".",
      scope: ".",
```

with

```ts
      start_url: "/",
      scope: "/",
```

- [ ] **Step 3: Build, verify manifest**

```bash
cd web && npm run build && cat dist/manifest.webmanifest | grep -E '"(start_url|scope)"'
```

Expected: `"start_url": "/"` and `"scope": "/"`.

- [ ] **Step 4: Commit**

```bash
git add web/vite.config.ts
git commit -m "fix(web): use absolute start_url and scope in PWA manifest (review #5)"
```

---

# Phase 2 — CRITICAL: `services/` auth & security

The remaining tasks in this plan are split into separate task files to keep this document navigable. Continue with:

- `2026-06-27-fixes-phase-2-services-critical.md` — Tasks 7–13 (SSE auth, env default, constant-time compare, webhook idempotency, setStripeInstance gate)
- `2026-06-27-fixes-phase-3-admin-critical.md` — Tasks 14–17 (README rewrite, useCaller, OrdersPage effect, lastFetchParams)
- `2026-06-27-fixes-phase-4-services-important.md` — Tasks 18–32
- `2026-06-27-fixes-phase-5-admin-important.md` — Tasks 33–46
- `2026-06-27-fixes-phase-6-web-important.md` — Tasks 47–58
- `2026-06-27-fixes-phase-7-shared.md` — Tasks 59–64
- `2026-06-27-fixes-phase-8-minors.md` — Tasks 65–92
- `2026-06-27-fixes-phase-12-verification.md` — Task 93

Each phase file follows the same TDD + commit pattern. The master plan author will populate them in sequence; execute Phase 0 + Phase 1 first.

---

## Cross-references — review findings → task mapping

| Review finding                     | Task  | Phase |
| ---------------------------------- | ----- | ----- |
| web #1 checkout envelope           | 2     | 1     |
| web #2 mixed cart                  | 3     | 1     |
| web #3 cart shape                  | 4     | 1     |
| web #4 addToCart                   | 5     | 1     |
| web #5 PWA manifest                | 6     | 1     |
| services C1 SSE auth               | 7     | 2     |
| services C2 ENVIRONMENT default    | 8     | 2     |
| services C3 timing-safe compare    | 9     | 2     |
| services C4 webhook idempotency    | 10–12 | 2     |
| services C5 setStripeInstance gate | 13    | 2     |
| admin C1 README rewrite            | 14    | 3     |
| admin C2 useCaller                 | 15    | 3     |
| admin C3 OrdersPage effect         | 16    | 3     |
| admin C4 lastFetchParams           | 17    | 3     |
| services I1–I15                    | 18–32 | 4     |
| admin I1–I14                       | 33–46 | 5     |
| web #6–#15                         | 47–58 | 6     |
| shared Important                   | 59–64 | 7     |
| Minor across all                   | 65–92 | 8–11  |
| Final cross-project verification   | 93    | 12    |

---

## Completion status

- [x] **Phase 0** — `web/` test harness bootstrap (Task 1)
- [x] **Phase 1** — `web/` Critical checkout & cart (Tasks 2–6) — 5/5
- [x] **Phase 2** — `services/` Critical auth/security (Tasks 7–13) — 7/7
- [x] **Phase 3** — `admin/` Critical auth + state (Tasks 14–17) — 4/4
- [x] **Phase 4** — `services/` Important hardening (Tasks 18–32) — 15/15
- [x] **Phase 5** — `admin/` Important UX & correctness (Tasks 33–46) — 14/14
- [x] **Phase 6** — `web/` Important UX & correctness (Tasks 47–58) — 9/9 (3 tasks descoped: see phase 6 doc)
- [x] **Phase 7** — `shared/` Important envelope & schemas (Tasks 59–64) — 6/6
- [x] **Phase 8** — Minors across all sub-projects (Tasks 65–92) — 28/28
- [x] **Phase 12** — Final verification (Task 93) — completed 2026-06-28 (commit `3185a21`)

### Phase 12 — findings worth carrying forward (not regressed by this sweep)

These pre-existed the sweep, surfaced during the verification gate, and are recommended as the **next** maintenance pass:

1. **Services coverage drift.** `services/vitest.config.mts` enforces 90/90/90/90 (lines/branches/functions/statements). Actual: 83/80/90/83. Largest gaps:
   - `src/contact/contact-handler.ts` — 0% (no tests under `services/test/contact/`).
   - `src/stripe/order/confirm-order.ts` — 34% statements.
   - `src/notifications/notification-hub.ts` — 67% statements (DO internals under-tested).
2. **Pre-existing TypeScript errors (17 total):**
   - `services/src/contact/contact-handler.ts:97` — calls `env.EMAIL.send({ body })` but Cloudflare's `SendEmail.send` overload expects `text` / `html`, not a `body` field.
   - `services/src/settings/settings-handler.ts:98–107` — `switch` on `SettingsType` ("SITE"/"PROCESS"/…) using lowercase literals.
   - `services/src/stripe/{order,product}/update-*.ts` — `Record<string, unknown>` → `Record<string, string>` metadata typing mismatch.
   - `services/src/utils/rateLimiter.ts:17` — `RateLimiterDO` namespace branding doesn't include the RPC method shape.
   - `admin/src/utils/api.ts:190,342,356,357` — `unknown[]` → `IStripeProductResponse[]` casts at the transform boundary.
   - `admin/src/store/{orders,products}Slice.ts` — `string | undefined` → `string | null` at the slice's nextCursor field.
   - `admin/src/{components/auth,store,pages}/__tests__/*` — test fixtures using `"OWNER"` as a string literal where `EStaffRole` is expected; one implicit `any` on a test getter.
3. **Admin build failure path.** `admin/package.json`'s `build` script is `tsc && vite build`; the 9 admin TS errors above prevent `npm run build` from succeeding. CI presumably uses a different path or has been skipping admin builds.
4. **`shared/` lacks an eslint config.** `npm run lint --workspace=shared` errors with "no eslint config found." Either add a flat config or remove the lint script.

Recommended stretch tasks (already listed in the Phase 12 plan):

1. Add `web/` to the root `test` and `lint` scripts.
2. Enable `noUncheckedIndexedAccess: true` in `admin/tsconfig.json` and `web/tsconfig.json`.
3. Replace `axios` error extraction in admin with a typed `parseEnvelope` helper modeled on `web/src/utils/api.ts`.
4. Add `EOrderFulfillmentStatus` enum to admin form options.
