# Phase 5 — `admin/` IMPORTANT fixes

> Parent: `2026-06-27-repo-wide-code-review-fixes.md`. Tasks 33–46.

---

## Task 33: `VITE_API_URL` cookie-scope check (admin I1)

**Files:**

- Modify: `admin/src/utils/api.ts`
- Modify: `admin/README.md`

- [ ] **Step 1: At the top of `api.ts` (after `API_BASE_URL` is computed), add a soft check:**

```ts
if (
  typeof window !== "undefined" &&
  API_BASE_URL &&
  !API_BASE_URL.startsWith("/")
) {
  try {
    const apiHost = new URL(API_BASE_URL).hostname;
    const pageHost = window.location.hostname;
    const sameETldPlusOne = pageHost.endsWith(
      apiHost.split(".").slice(-2).join("."),
    );
    if (!sameETldPlusOne) {
      console.warn(
        "[bee-epic admin] VITE_API_URL hostname does not share the page's eTLD+1; CF Access cookies may not be forwarded.",
        { apiHost, pageHost },
      );
    }
  } catch {
    // ignore — bad URL handled elsewhere
  }
}
```

- [ ] **Step 2: Document the cookie-scope assumption in `admin/README.md` (Auth section)**.

- [ ] **Step 3: Commit**

```bash
git add admin/src/utils/api.ts admin/README.md
git commit -m "fix(admin): warn when VITE_API_URL host is outside the page eTLD+1 (review I1)"
```

---

## Task 34: Client-side auth gate (admin I2)

**Files:**

- Create: `admin/src/components/auth/RequireCaller.tsx`
- Modify: `admin/src/App.tsx`

- [ ] **Step 1: Component**

```tsx
// admin/src/components/auth/RequireCaller.tsx
import type { ReactNode } from "react";
import { useCaller } from "../../hooks/useCaller";

export function RequireCaller({ children }: { children: ReactNode }) {
  const { caller, status, refetch } = useCaller();
  if (status === "idle" || status === "loading") {
    return (
      <div
        data-testid="require-caller_loading"
        role="status"
        aria-live="polite"
      >
        <span className="sr-only">Verifying access…</span>
      </div>
    );
  }
  if (status === "error") {
    return (
      <div data-testid="require-caller_error" role="alert">
        <p>
          Could not verify your access. <button onClick={refetch}>Retry</button>
        </p>
      </div>
    );
  }
  if (!caller) {
    return (
      <div data-testid="require-caller_unauth" role="alert">
        <p>Access required. Sign in via Cloudflare Access to continue.</p>
      </div>
    );
  }
  return <>{children}</>;
}
```

- [ ] **Step 2: Wrap layout in `App.tsx`** with `<RequireCaller>...</RequireCaller>`.

- [ ] **Step 3: Test**

```tsx
it("renders unauth message when caller is null after fetch", () => {
  // mount with mocked store: status=succeeded, caller=null
  // expect the unauth element present
});
```

- [ ] **Step 4: Commit**

```bash
git add admin/src/components/auth/RequireCaller.tsx admin/src/App.tsx admin/src/components/auth/__tests__/
git commit -m "feat(admin): client-side RequireCaller gate (review I2)"
```

---

## Task 35: OrderEditDialog data-consistency (admin I3)

**Files:**

- Modify: `admin/src/pages/OrderDetailPage.tsx`

- [ ] **Step 1: When `addressLine1` is empty in the save payload, also send `collected_information.shipping_details = null` (or omit `customer_name` from metadata). Pair the form with `IOrderUpdate` from `@bee-epic/shared`.**

```ts
const shippingFilled = !!addressLine1 && !!addressCountry;
if (shippingFilled) {
  payload.collected_information = {
    shipping_details: {/* ... */},
  };
}
const parsed = OrderUpdateSchema.safeParse(payload);
if (!parsed.success) {
  // show field-level errors
  return;
}
await updateOrder(parsed.data);
```

- [ ] **Step 2: Test + commit**

```bash
git add admin/src/pages/OrderDetailPage.tsx
git commit -m "fix(admin): OrderEditDialog validates with Zod and clears shipping when blank (review I3)"
```

---

## Task 36: Stabilize ProductFormDialog seeding (admin I4)

**Files:**

- Modify: `admin/src/components/products/ProductFormDialog.tsx`

- [ ] **Step 1: Seed once per productId**

```ts
const seededFor = useRef<string | null>(null);
useEffect(() => {
  if (!isEditMode || !selectedProduct || selectedProduct.id !== productId)
    return;
  if (seededFor.current === productId) return;
  seededFor.current = productId;
  setFormData({/* seed from selectedProduct */});
}, [isEditMode, selectedProduct, productId]);
```

Reset `seededFor.current = null` when the dialog closes.

- [ ] **Step 2: Commit**

```bash
git add admin/src/components/products/ProductFormDialog.tsx
git commit -m "fix(admin): ProductFormDialog seeds form once per product id (review I4)"
```

---

## Task 37: Normalize staff emails to lowercase on load (admin I5)

**Files:**

- Modify: `admin/src/pages/settings/StaffTab.tsx`

- [ ] **Step 1: On load**

```ts
setStaff(list.map((m) => ({ ...m, email: m.email.toLowerCase() })));
```

- [ ] **Step 2: Commit**

```bash
git add admin/src/pages/settings/StaffTab.tsx
git commit -m "fix(admin): normalize staff emails to lowercase on load (review I5)"
```

---

## Task 38: ProductsPage merge initial-load + debounced refetch (admin I6)

**Files:**

- Modify: `admin/src/pages/ProductsPage.tsx`

Apply the same `didMount` + key-comparison pattern as Task 16. Single effect handles both initial fetch and filter changes.

- [ ] **Step 1: Implement, test, commit**

```bash
git add admin/src/pages/ProductsPage.tsx admin/src/pages/__tests__/ProductsPage.test.tsx
git commit -m "fix(admin): ProductsPage single effect for initial + debounced refetch (review I6)"
```

---

## Task 39: Safe `useTheme` (admin I7)

**Files:**

- Modify: `admin/src/hooks/useTheme.tsx`

- [ ] **Step 1: Wrap reads/writes**

```ts
const safeGet = (k: string) => {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
};
const safeSet = (k: string, v: string) => {
  try {
    localStorage.setItem(k, v);
  } catch {
    /* ignore */
  }
};
```

- [ ] **Step 2: Optional — wrap `<App />` in an ErrorBoundary in `main.tsx`.**

- [ ] **Step 3: Commit**

```bash
git add admin/src/hooks/useTheme.tsx admin/src/main.tsx
git commit -m "fix(admin): useTheme tolerates localStorage failures (review I7)"
```

---

## Task 40: Raise admin `functions` coverage threshold (admin I8)

**Files:**

- Modify: `admin/vitest.config.ts`

- [ ] **Step 1: Run coverage and inspect**

```bash
cd admin && npm run test:coverage
```

- [ ] **Step 2: Raise `functions` to 75 (interim) then to 85 once additional tests land.** Document the bump in `admin/README.md`.

- [ ] **Step 3: Add targeted tests** for any function that drops below the new threshold — prioritize `OrderEditDialog.handleSave`, `StaffTab.handleSave`, slices' rollback paths.

- [ ] **Step 4: Commit**

```bash
git add admin/vitest.config.ts admin/README.md admin/src/
git commit -m "test(admin): raise functions coverage to 75, fill role-gated test gaps (review I8)"
```

---

## Task 41: SSE `EventSource` with credentials + reconnect indicator (admin I9)

**Files:**

- Modify: `admin/src/components/layout/AdminNavbar.tsx`

- [ ] **Step 1: Pass `{ withCredentials: true }`**

```ts
const es = new EventSource(`${API_BASE_URL}/notifications/stream`, {
  withCredentials: true,
});
```

- [ ] **Step 2: Reconnect indicator**

```ts
const [sseHealth, setSseHealth] = useState<
  "connected" | "reconnecting" | "down"
>("connected");
let consecutiveErrors = 0;
es.onerror = () => {
  consecutiveErrors++;
  setSseHealth(consecutiveErrors > 3 ? "down" : "reconnecting");
};
es.onopen = () => {
  consecutiveErrors = 0;
  setSseHealth("connected");
};
```

Show a small badge near the notifications icon when not "connected".

- [ ] **Step 3: Commit**

```bash
git add admin/src/components/layout/AdminNavbar.tsx
git commit -m "fix(admin): EventSource withCredentials + reconnect health indicator (review I9)"
```

---

## Task 42: `formatPrice` is currency-aware (admin I10)

**Files:**

- Modify: `admin/src/utils/badgeClasses.ts` (or wherever `formatPrice` lives)

- [ ] **Step 1: New signature**

```ts
export function formatPrice(cents: number, currency: string = "usd"): string {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: currency.toUpperCase(),
  }).format(cents / 100);
}
```

- [ ] **Step 2: Update callers — pass `order.currency` / `product.currency`.**

```bash
grep -rn "formatPrice(" admin/src/
```

Update every call site to pass currency.

- [ ] **Step 3: Commit**

```bash
git add admin/src/
git commit -m "fix(admin): formatPrice is currency-aware via Intl.NumberFormat (review I10)"
```

---

## Task 43: Validate category against enum in `transformStripeProduct` (admin I11)

**Files:**

- Modify: `admin/src/utils/transform.ts`

- [ ] **Step 1: Replace the unsafe cast**

```ts
const validCategories = Object.values(EProductCategory);
const rawCategory = metadata.category;
const category = validCategories.includes(rawCategory as EProductCategory)
  ? (rawCategory as EProductCategory)
  : EProductCategory.HONEY;
if (rawCategory && rawCategory !== category) {
  console.warn(
    `Unknown product category "${rawCategory}", defaulting to HONEY`,
    { productId: data.id },
  );
}
```

- [ ] **Step 2: Test + commit**

```bash
git add admin/src/utils/transform.ts admin/src/utils/__tests__/
git commit -m "fix(admin): validate product category enum and warn on unknown (review I11)"
```

---

## Task 44: DashboardPage stats from server (admin I12)

**Files:**

- Modify: `admin/src/pages/DashboardPage.tsx`
- Modify: `services/src/router.ts` + new handler `services/src/stripe/product/get-products-stats.ts`
- Modify: `services/AGENTS.md` (document new endpoint)

- [ ] **Step 1: Worker endpoint `GET /products/stats`**

Returns `IApiResponse<{ totalProducts: number; inStock: number; featured: number; byCategory: Record<string, number> }>`. Computes from `fetchAllActiveProducts` and caches in KV with 120s TTL (key `products:stats:v1`).

- [ ] **Step 2: Admin calls new endpoint** instead of `fetchProducts({ limit: 100 })`.

- [ ] **Step 3: Test + commit**

```bash
git add services/src/ admin/src/pages/DashboardPage.tsx
git commit -m "feat(services,admin): server-side product stats endpoint; dashboard uses it (review I12)"
```

---

## Task 45: Abort stale fetches on filter change (admin I13)

**Files:**

- Modify: `admin/src/store/productsSlice.ts`
- Modify: `admin/src/store/ordersSlice.ts`
- Modify: `admin/src/utils/api.ts`

- [ ] **Step 1: Thread `AbortSignal` into axios calls**

```ts
export const fetchProducts = createAsyncThunk(
  "products/fetchProducts",
  async (params: IFetchProductsParams, { signal }) => {
    const res = await api.get("/products", { params, signal });
    return { ...res.data.data, params };
  },
);
```

(`createAsyncThunk` automatically aborts the underlying signal when `dispatch().abort()` is called.)

- [ ] **Step 2: In the page, cancel the previous promise when filters change**

```ts
const promiseRef = useRef<ReturnType<typeof dispatch> | null>(null);
useEffect(() => {
  promiseRef.current?.abort?.();
  promiseRef.current = dispatch(fetchProducts(buildFetchParams()));
}, [searchTerm, selectedCategory]);
```

- [ ] **Step 3: Slice ignores aborted results** — `createAsyncThunk` rejects with `name === "AbortError"`, which the slice already handles in the rejected case if you guard:

```ts
.addCase(fetchProducts.rejected, (state, action) => {
  if (action.meta.aborted) return;
  // ... existing error handling
});
```

- [ ] **Step 4: Commit**

```bash
git add admin/src/store/ admin/src/pages/ admin/src/utils/api.ts
git commit -m "fix(admin): abort in-flight fetches on filter change to avoid stale appends (review I13)"
```

---

## Task 46: ProductFormDialog integer-only price input (admin I14)

**Files:**

- Modify: `admin/src/components/products/ProductFormDialog.tsx`

- [ ] **Step 1: Replace numeric parsing**

```tsx
<input
  type="text"
  inputMode="numeric"
  pattern="\d+"
  value={formData.price}
  onChange={(e) => {
    const v = e.target.value.replace(/[^\d]/g, "");
    setFormData((f) => ({ ...f, price: v === "" ? 0 : Number(v) }));
  }}
  aria-describedby="price-hint"
/>
<small id="price-hint">Enter the price in cents (e.g. 1499 = $14.99).</small>
```

- [ ] **Step 2: Reject non-integer paste explicitly** with `onPaste` clearing non-digit chars.

- [ ] **Step 3: Commit**

```bash
git add admin/src/components/products/ProductFormDialog.tsx
git commit -m "fix(admin): integer-only price input with cents hint (review I14)"
```

---

End of Phase 5.
