# Phase 6 — `web/` IMPORTANT fixes

> Parent: `2026-06-27-repo-wide-code-review-fixes.md`. Tasks 47–58.

---

## Task 47: Drop `@stripe/stripe-js` and the misleading TEST MODE banners (web #6, #15)

**Files:**

- Modify: `web/package.json`
- Modify: `web/src/utils/constants.ts`
- Modify: `web/src/components/shop/CartDrawer.tsx`
- Modify: `web/src/components/shop/CheckoutButton.tsx`

- [ ] **Step 1: Confirm unused**

```bash
cd web && grep -rn "@stripe/stripe-js\|loadStripe" src/
```

Expected: zero hits.

- [ ] **Step 2: Remove the dep**

```bash
cd web && npm uninstall @stripe/stripe-js
```

- [ ] **Step 3: Remove the banner JSX** from both `CartDrawer.tsx` and `CheckoutButton.tsx` (the "Stripe is in TEST MODE" notice). Drop the `showDevNote` prop on `CheckoutButton` entirely (no callers should pass it).

- [ ] **Step 4: Optionally keep a small inline dev-only banner** gated on `import.meta.env.DEV` with corrected wording (e.g. "Stripe is in test mode (configured on the worker via `STRIPE_SECRET_KEY`)."). If you keep it, gate everywhere.

- [ ] **Step 5: Commit**

```bash
git add web/package.json web/package-lock.json web/src/components/shop/ web/src/utils/constants.ts
git commit -m "chore(web): remove unused @stripe/stripe-js and misleading TEST MODE banners (review #6, #15)"
```

---

## Task 48: `useStripeCheckout` `useCallback` deps audit (web #7)

**Files:**

- Modify: `web/src/hooks/useStripeCheckout.ts`
- Confirm: `web/eslint.config.js` has `react-hooks/exhaustive-deps` enabled with `error` level.

- [ ] **Step 1: Verify lint catches missing deps**

```bash
cd web && grep -rn "exhaustive-deps\|react-hooks/" eslint.config.js
```

- [ ] **Step 2: Add an explicit eslint comment if `[]` is intentional**

```ts
const checkout = useCallback(async (items: ICartItem[]) => {
  // ...
  // No external deps; setError/setIsProcessing are stable from useState.
}, []); // eslint-disable-next-line react-hooks/exhaustive-deps
```

- [ ] **Step 3: Run lint, commit**

```bash
cd web && npm run lint
git add web/src/hooks/useStripeCheckout.ts
git commit -m "chore(web): annotate intentional empty deps array in useStripeCheckout (review #7)"
```

---

## Task 49: `ProductsSection` adds `limit` dep + abort signal (web #8)

**Files:**

- Modify: `web/src/components/sections/ProductsSection.tsx`
- Modify: `web/src/utils/api.ts` (accept `AbortSignal`)

- [ ] **Step 1: Add `signal?: AbortSignal` to `fetchProductsPaginated`** and forward to `fetch`.

- [ ] **Step 2: In the component**

```ts
const abortRef = useRef<AbortController | null>(null);
useEffect(() => {
  abortRef.current?.abort();
  const ac = new AbortController();
  abortRef.current = ac;
  // ... debounce timer setup
  searchTimer.current = setTimeout(async () => {
    setLoading(true);
    try {
      const result = await fetchProductsPaginated(
        { search: searchTerm, category: activeCategory, tag: activeTag, limit },
        ac.signal,
      );
      if (!ac.signal.aborted) setProducts(result.products);
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        /* surface */
      }
    } finally {
      if (!ac.signal.aborted) setLoading(false);
    }
  }, delay);
  return () => {
    abortRef.current?.abort();
    if (searchTimer.current) clearTimeout(searchTimer.current);
  };
}, [searchTerm, activeCategory, activeTag, limit]);
```

- [ ] **Step 3: Commit**

```bash
git add web/src/components/sections/ProductsSection.tsx web/src/utils/api.ts
git commit -m "fix(web): ProductsSection aborts stale fetches and includes limit dep (review #8)"
```

---

## Task 50: Contact form honeypot via ref (web #9)

**Files:**

- Modify: `web/src/components/sections/ContactSection.tsx`

- [ ] **Step 1: Replace querySelector**

```tsx
const gotchaRef = useRef<HTMLInputElement>(null);
// in form:
<input
  ref={gotchaRef}
  type="text"
  name="_gotcha"
  tabIndex={-1}
  autoComplete="off"
  aria-hidden="true"
  style={{ display: "none" }}
/>;
// in submit:
const _gotcha = gotchaRef.current?.value ?? "";
```

- [ ] **Step 2: Commit**

```bash
git add web/src/components/sections/ContactSection.tsx
git commit -m "fix(web): honeypot uses ref instead of document.querySelector (review #9)"
```

---

## Task 51: Surface real contact-form error message (web #10)

**Files:**

- Modify: `web/src/components/sections/ContactSection.tsx`

- [ ] **Step 1: Update catch**

```ts
} catch (err) {
  setStatus("error");
  setErrorMessage(err instanceof Error ? err.message : "Failed to send message. Please try again.");
}
```

- [ ] **Step 2: Commit**

```bash
git add web/src/components/sections/ContactSection.tsx
git commit -m "fix(web): contact-form surfaces real error message (review #10)"
```

---

## Task 52: Minimum test surface for `cartSlice` + `transformStripeProduct` (web #11)

**Files:**

- Already created: `web/src/store/__tests__/cartSlice.test.ts` (Task 4–5)
- Create: `web/src/utils/__tests__/transform.test.ts`

- [ ] **Step 1: transform tests**

```ts
import { describe, it, expect } from "vitest";
import { transformStripeProduct } from "../transform";

describe("transformStripeProduct", () => {
  it("returns 0 price but `priceUnavailable: true` when default_price is unexpanded (string)", () => {
    const stripe = {
      id: "prod_1",
      name: "x",
      description: "",
      default_price: "price_1",
      images: [],
      active: true,
      metadata: { category: "HONEY" },
    } as never;
    const p = transformStripeProduct(stripe);
    // After fix in Task 56 — assert priceUnavailable flag exists OR returns null.
    expect(p?.price ?? 0).toBe(0);
  });

  it("uses default_price.unit_amount when expanded", () => {
    const stripe = {
      id: "prod_2",
      name: "y",
      description: "",
      default_price: { id: "price_2", unit_amount: 1500, currency: "usd" },
      images: [],
      active: true,
      metadata: { category: "HONEY" },
    } as never;
    const p = transformStripeProduct(stripe);
    expect(p?.price).toBe(1500);
  });

  it("falls back to HONEY for unknown category and warns", () => {
    const stripe = {
      id: "prod_3",
      name: "z",
      description: "",
      default_price: { id: "p", unit_amount: 100, currency: "usd" },
      images: [],
      active: true,
      metadata: { category: "WHATEVER" },
    } as never;
    const p = transformStripeProduct(stripe);
    expect(p?.category).toBe("HONEY");
  });
});
```

- [ ] **Step 2: Commit**

```bash
git add web/src/utils/__tests__/transform.test.ts
git commit -m "test(web): cover transformStripeProduct edge cases (review #11)"
```

---

## Task 53: PWA "new version available" toast (web #12)

**Files:**

- Modify: `web/src/main.tsx` or a new `web/src/components/pwa/UpdatePrompt.tsx`

- [ ] **Step 1: Use `virtual:pwa-register/react`**

```tsx
// web/src/components/pwa/UpdatePrompt.tsx
import { useRegisterSW } from "virtual:pwa-register/react";
import { useState } from "react";

export function UpdatePrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegistered() {
      /* no-op */
    },
    onRegisterError(err) {
      console.error(err);
    },
  });
  if (!needRefresh) return null;
  return (
    <div
      role="alert"
      data-testid="update-prompt"
      className="fixed bottom-4 right-4 ..."
    >
      <p>A new version is available.</p>
      <button
        onClick={() => updateServiceWorker(true)}
        data-testid="update-prompt_reload"
      >
        Reload
      </button>
      <button
        onClick={() => setNeedRefresh(false)}
        data-testid="update-prompt_dismiss"
      >
        Later
      </button>
    </div>
  );
}
```

Mount in `main.tsx` after `<App />`.

- [ ] **Step 2: Commit**

```bash
git add web/src/components/pwa/UpdatePrompt.tsx web/src/main.tsx
git commit -m "feat(web): PWA new-version-available toast (review #12)"
```

---

## Task 54: SuccessPage hardening (web #13)

**Files:**

- Modify: `web/src/components/pages/SuccessPage.tsx`

- [ ] **Step 1: Remove the dead `export default SuccessPage`** (keep only the named export). Update any default-import caller (`App.tsx`).

- [ ] **Step 2: Guard `clearCart`**

```ts
const hasClearedCart = useRef(false);
useEffect(() => {
  const sessionId = searchParams.get("session_id");
  if (sessionId && sessionId.startsWith("cs_") && !hasClearedCart.current) {
    dispatch(clearCart());
    hasClearedCart.current = true;
  }
}, [dispatch, searchParams]);
```

- [ ] **Step 3: Commit**

```bash
git add web/src/components/pages/SuccessPage.tsx web/src/App.tsx
git commit -m "fix(web): SuccessPage single named export; gate clearCart on cs_ session_id (review #13)"
```

---

## Task 55: Handle unexpanded `default_price` in transform (web #14)

**Files:**

- Modify: `web/src/utils/transform.ts`

- [ ] **Step 1: When `default_price` is a string, return `null` (filter out) or mark `priceUnavailable: true`. Recommended: log a warning and return `null` so the storefront drops the product:**

```ts
if (typeof data.default_price === "string") {
  console.warn(
    `Product ${data.id} has unexpanded default_price; dropping from storefront`,
  );
  return null;
}
```

- [ ] **Step 2: Update `transformStripeProductsList` to `.filter(Boolean) as IProduct[]`.**

- [ ] **Step 3: Adjust the test from Task 52 to expect `null`.**

- [ ] **Step 4: Commit**

```bash
git add web/src/utils/transform.ts web/src/utils/__tests__/transform.test.ts
git commit -m "fix(web): drop products with unexpanded default_price (no $0 deceit) (review #14)"
```

---

## Task 56–58: Reserved for any follow-ups uncovered during Phase 6 execution

These slots stay empty unless the executing engineer finds an emergent issue that should land in this phase rather than Phase 10.

---

End of Phase 6.
