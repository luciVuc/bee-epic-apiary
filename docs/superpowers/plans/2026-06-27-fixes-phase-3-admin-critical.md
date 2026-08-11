# Phase 3 — `admin/` CRITICAL fixes

> Parent: `2026-06-27-repo-wide-code-review-fixes.md`. Tasks 14–17.

---

## Task 14: Rewrite `admin/README.md` to match Plan 3 auth (admin C1)

README documents a `VITE_API_SECRET_KEY` flow that no longer exists. Future engineers will believe a long-lived bearer is in the bundle.

**Files:**

- Modify: `admin/README.md`

- [ ] **Step 1: Open the README, locate the "Settings — Admin Config" section and the "API Integration" endpoint table.**

- [ ] **Step 2: Replace the auth description with**

```md
## Auth (Plan 3 — Cloudflare Access)

The admin panel does NOT ship a bearer token. Production auth is enforced by Cloudflare Access in front of the Pages site:

1. Cloudflare Access challenges the user (SSO / one-time PIN / etc.).
2. Access issues a JWT in the `Cf-Access-Jwt-Assertion` request header on every call to the worker.
3. The worker verifies the JWT via the team JWKS in `services/src/utils/resolveCaller.ts`.
4. The admin's axios client uses `withCredentials: true` so the `CF_Authorization` cookie is forwarded automatically.

**Local development** uses `VITE_DEV_EMAIL` (sent as `X-Dev-Email`) — the worker honors it only when `ENVIRONMENT === 'development'`.

**CI / scripts** can still send `Authorization: Bearer <API_SECRET_KEY>` for service-to-service automation. This bearer is NEVER bundled with the admin client.

| Endpoint                         | Method  | Required role |
| -------------------------------- | ------- | ------------- |
| `GET /products`                  | GET     | FULFILLMENT   |
| `POST /products`                 | POST    | MANAGER       |
| `PUT /products/:id`              | PUT     | MANAGER       |
| `DELETE /products/:id`           | DELETE  | MANAGER       |
| `GET /orders`, `PUT /orders/:id` | GET/PUT | FULFILLMENT   |
| `GET /settings/:type`            | GET     | public        |
| `PUT /settings/site              | process | testimonials  | categories` | PUT | MANAGER |
| `PUT /settings/staff`            | PUT     | OWNER         |
| `GET /whoami`                    | GET     | public        |
| `GET /notifications/stream`      | GET     | FULFILLMENT   |
```

- [ ] **Step 3: Remove any references to `VITE_API_SECRET_KEY` in `admin/README.md` and `admin/.env.example` (if present).**

```bash
grep -rn "VITE_API_SECRET_KEY\|API_SECRET_KEY" admin/ --include="*.md" --include=".env*"
```

Replace each match with appropriate Plan 3 wording or remove.

- [ ] **Step 4: Confirm no source code references**

```bash
grep -rn "VITE_API_SECRET_KEY" admin/src/
```

Expected: zero matches.

- [ ] **Step 5: Commit**

```bash
git add admin/README.md
git commit -m "docs(admin): rewrite README for Plan 3 CF Access auth (review C1)"
```

---

## Task 15: Fix `useCaller()` lifecycle (admin C2)

`useCaller` re-fires forever on unauthenticated state and is terminal on error. Introduce a `succeeded` state.

**Files:**

- Modify: `admin/src/store/authSlice.ts`
- Modify: `admin/src/hooks/useCaller.ts`
- Modify: `admin/src/store/__tests__/authSlice.test.ts`
- Modify: `admin/src/hooks/__tests__/useCaller.test.tsx` (create if missing)

- [ ] **Step 1: Read the current slice and hook.**

```bash
sed -n '1,80p' admin/src/store/authSlice.ts admin/src/hooks/useCaller.ts
```

- [ ] **Step 2: Write failing tests**

Add to `admin/src/store/__tests__/authSlice.test.ts`:

```ts
describe("authSlice status transitions", () => {
  it("transitions to 'succeeded' when caller is null (unauth) and stays there", () => {
    const initial = authReducer(undefined, { type: "@@INIT" });
    const loading = authReducer(initial, fetchCaller.pending("", undefined));
    const fulfilledNull = authReducer(
      loading,
      fetchCaller.fulfilled(null, "", undefined),
    );
    expect(fulfilledNull.status).toBe("succeeded");
    expect(fulfilledNull.caller).toBeNull();
  });

  it("transitions to 'error' on reject and exposes error message", () => {
    const initial = authReducer(undefined, { type: "@@INIT" });
    const loading = authReducer(initial, fetchCaller.pending("", undefined));
    const rejected = authReducer(
      loading,
      fetchCaller.rejected(new Error("boom"), "", undefined),
    );
    expect(rejected.status).toBe("error");
  });
});
```

In `admin/src/hooks/__tests__/useCaller.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { Provider } from "react-redux";
import { configureStore } from "@reduxjs/toolkit";
import authReducer, { fetchCaller } from "../../store/authSlice";
import { useCaller } from "../useCaller";

describe("useCaller", () => {
  it("dispatches fetchCaller exactly once across multiple mounts when status leaves 'idle'", () => {
    const store = configureStore({ reducer: { auth: authReducer } });
    const dispatchSpy = vi.spyOn(store, "dispatch");
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <Provider store={store}>{children}</Provider>
    );
    renderHook(() => useCaller(), { wrapper });
    renderHook(() => useCaller(), { wrapper });
    renderHook(() => useCaller(), { wrapper });
    const callerFetches = dispatchSpy.mock.calls.filter(
      ([action]) =>
        typeof action === "function" ||
        (action as { type?: string })?.type?.startsWith?.("auth/fetchCaller"),
    );
    expect(callerFetches.length).toBeLessThanOrEqual(1);
  });
});
```

- [ ] **Step 3: Run, observe failure.**

```bash
cd admin && npx vitest run src/store/__tests__/authSlice.test.ts src/hooks/__tests__/useCaller.test.tsx
```

- [ ] **Step 4: Implement the slice changes**

In `admin/src/store/authSlice.ts`, change the status type:

```ts
status: "idle" | "loading" | "succeeded" | "error";
```

In the `extraReducers`:

```ts
builder
  .addCase(fetchCaller.pending, (state) => {
    state.status = "loading";
  })
  .addCase(fetchCaller.fulfilled, (state, action) => {
    state.status = "succeeded";
    state.caller = action.payload;
  })
  .addCase(fetchCaller.rejected, (state, action) => {
    state.status = "error";
    state.error = action.error.message ?? "Failed to fetch caller";
  });
```

Also add a `resetAuth` reducer (used by 401 interceptor — see Task 38 in Phase 5):

```ts
reducers: {
  resetAuth: (state) => {
    state.status = "idle";
    state.caller = null;
    state.error = null;
  },
},
```

Export `resetAuth`.

- [ ] **Step 5: Update `useCaller`**

```ts
export function useCaller() {
  const dispatch = useAppDispatch();
  const { caller, status, error } = useAppSelector((s) => s.auth);
  useEffect(() => {
    if (status === "idle") {
      dispatch(fetchCaller());
    }
  }, [dispatch, status]);
  const refetch = useCallback(() => {
    dispatch(resetAuth());
    dispatch(fetchCaller());
  }, [dispatch]);
  return { caller, status, error, refetch };
}
```

- [ ] **Step 6: Re-run tests**

```bash
cd admin && npx vitest run src/store/__tests__/authSlice.test.ts src/hooks/__tests__/useCaller.test.tsx
```

- [ ] **Step 7: Commit**

```bash
git add admin/src/store/authSlice.ts admin/src/hooks/useCaller.ts admin/src/store/__tests__/authSlice.test.ts admin/src/hooks/__tests__/useCaller.test.tsx
git commit -m "fix(admin): useCaller stable lifecycle with succeeded state and refetch (review C2)"
```

---

## Task 16: Stop `OrdersPage` initial-load duplicate dispatches (admin C3)

Effect dispatches `fetchOrders` whenever the key is unchanged across rerenders — StrictMode doubles initial mount; filter-panel toggles trigger spurious re-fetches.

**Files:**

- Modify: `admin/src/pages/OrdersPage.tsx`
- Modify: `admin/src/pages/__tests__/OrdersPage.test.tsx` (create if needed; otherwise extend)

- [ ] **Step 1: Find the effect**

```bash
grep -n "prevParamsKey\|buildFetchParams" admin/src/pages/OrdersPage.tsx
```

- [ ] **Step 2: Write a failing test**

```tsx
// Use a mocked dispatch + ensure exactly one fetchOrders dispatch on mount under StrictMode.
import { render } from "@testing-library/react";
import { StrictMode } from "react";

it("dispatches fetchOrders exactly once on initial mount (no duplicate under StrictMode)", () => {
  const dispatchSpy = vi.fn();
  // ... mock useAppDispatch to return dispatchSpy
  render(
    <StrictMode>
      <Provider store={store}>
        <OrdersPage />
      </Provider>
    </StrictMode>,
  );
  const orderFetches = dispatchSpy.mock.calls.filter(
    ([a]) =>
      typeof a === "function" || a?.type?.startsWith?.("orders/fetchOrders"),
  );
  expect(orderFetches.length).toBe(1);
});
```

- [ ] **Step 3: Replace the effect with a `didMount` ref**

```ts
const didMount = useRef(false);
useEffect(() => {
  const currentKey = `${searchTerm}|${selectedStatus}|${selectedPaymentStatus}|${selectedOrderStatus}`;
  if (!didMount.current) {
    didMount.current = true;
    prevParamsKey.current = currentKey;
    dispatch(fetchOrders(buildFetchParams(true)));
    return;
  }
  if (prevParamsKey.current === currentKey) return;
  prevParamsKey.current = currentKey;
  if (searchTimer.current) clearTimeout(searchTimer.current);
  searchTimer.current = setTimeout(() => {
    dispatch(fetchOrders(buildFetchParams()));
  }, 300);
  return () => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
  };
}, [
  searchTerm,
  selectedStatus,
  selectedPaymentStatus,
  selectedOrderStatus,
  dispatch,
]);
```

- [ ] **Step 4: Run tests**

```bash
cd admin && npx vitest run src/pages/__tests__/OrdersPage.test.tsx
```

- [ ] **Step 5: Commit**

```bash
git add admin/src/pages/OrdersPage.tsx admin/src/pages/__tests__/OrdersPage.test.tsx
git commit -m "fix(admin): OrdersPage initial-load fires exactly once (review C3)"
```

---

## Task 17: Strip pagination params from `lastFetchParams` (admin C4)

`fetchOrders.fulfilled` and `fetchProducts.fulfilled` write `starting_after` and `limit` into `lastFetchParams`, poisoning subsequent count refreshes.

**Files:**

- Modify: `admin/src/store/ordersSlice.ts`
- Modify: `admin/src/store/productsSlice.ts`
- Modify: matching `__tests__` files

- [ ] **Step 1: Add helper at top of each slice**

```ts
const FILTER_KEYS = [
  "search",
  "category",
  "status",
  "payment_status",
  "order_status",
] as const;
function pickFilterParams(
  params: Record<string, unknown> | null | undefined,
): Record<string, unknown> {
  if (!params) return {};
  return Object.fromEntries(
    FILTER_KEYS.filter((k) => k in params).map((k) => [k, params[k]]),
  );
}
```

(Drop the keys that don't apply per slice — products doesn't have `payment_status`/`order_status`; orders doesn't have `category`.)

- [ ] **Step 2: Failing test**

```ts
it("lastFetchParams excludes starting_after and limit after Load More", () => {
  let state = ordersReducer(undefined, { type: "@@INIT" });
  state = ordersReducer(
    state,
    fetchOrders.fulfilled(
      {
        data: [],
        hasMore: false,
        total: 0,
        params: { search: "foo", limit: 10 },
      } as never,
      "",
      { search: "foo", limit: 10 } as never,
    ),
  );
  state = ordersReducer(
    state,
    fetchOrders.fulfilled(
      {
        data: [],
        hasMore: false,
        total: 0,
        params: { search: "foo", starting_after: "cs_x", limit: 10 },
      } as never,
      "",
      { search: "foo", starting_after: "cs_x", limit: 10 } as never,
    ),
  );
  expect(state.lastFetchParams).toEqual({ search: "foo" });
});
```

- [ ] **Step 3: Implement**

In each slice's `fulfilled` case, replace `lastFetchParams = params` with `lastFetchParams = pickFilterParams(params)`.

- [ ] **Step 4: Run tests**

```bash
cd admin && npx vitest run src/store/__tests__/ordersSlice.test.ts src/store/__tests__/productsSlice.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add admin/src/store/ordersSlice.ts admin/src/store/productsSlice.ts admin/src/store/__tests__/
git commit -m "fix(admin): strip pagination keys from lastFetchParams (review C4)"
```

---

End of Phase 3. CRITICAL items complete. Resume with Phase 4 (services Important).
