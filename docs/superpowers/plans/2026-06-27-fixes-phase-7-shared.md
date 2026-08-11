# Phase 7 — `shared/` IMPORTANT fixes

> Parent: `2026-06-27-repo-wide-code-review-fixes.md`. Tasks 59–64.

Every change in this phase requires `npm run shared:build` and reinstall (or rebuild) of consumers.

---

## Task 59: Document or remove shipped `src/` in `shared/package.json` (shared Important #1)

**Files:**

- Modify: `shared/package.json`

**Decision:** Keep `"src"` in `files` because `declarationMap: true` enables IDE go-to-definition. Document it.

- [ ] **Step 1: Add a comment header in `package.json`** — JSON doesn't support comments, so document in `shared/README.md` instead:

```md
## Build artifacts

This package ships both `dist/` (compiled) and `src/` (TS sources) so consumers
get IDE go-to-definition via `.d.ts.map` files. Keep `declarationMap: true` in
`tsconfig.build.json` if you want to keep this behavior. If you remove `src/`
from `files`, also disable `declarationMap`.
```

- [ ] **Step 2: Commit**

```bash
git add shared/README.md
git commit -m "docs(shared): document declarationMap+src/ go-to-definition intent (review Important #1)"
```

---

## Task 60: Rename `IAPIResponseError` and document scope (shared Important #2)

**Files:**

- Modify: `shared/src/api.ts`
- Build + propagate to consumers

- [ ] **Step 1: Rename to `IApiUpstreamError` and add explicit JSDoc**

```ts
/** Upstream / third-party error shape — Stripe, fetch failures, network errors
 *  thrown by external services. NOT the worker's IApiError envelope. */
export interface IApiUpstreamError {
  status?: number;
  statusCode?: number;
  code?: string;
  message?: string;
  stack?: string;
  type?: string;
}

/** @deprecated use IApiUpstreamError */
export type IAPIResponseError = IApiUpstreamError;
```

- [ ] **Step 2: `npm run shared:build` and audit consumers**

```bash
cd shared && npm run build
cd .. && grep -rn "IAPIResponseError" admin/ web/ services/
```

Migrate references to `IApiUpstreamError`.

- [ ] **Step 3: Commit**

```bash
git add shared/ admin/ web/ services/
git commit -m "refactor(shared): rename IAPIResponseError -> IApiUpstreamError; deprecate alias (review Important #2)"
```

---

## Task 61: Add `ApiResponseSchema` runtime parser (shared Important #3)

**Files:**

- Modify: `shared/src/api.ts`
- Modify: `shared/src/__tests__/api.spec.ts` (create if missing)

- [ ] **Step 1: Test first**

```ts
import { z } from "zod";
import { ApiResponseSchema, ApiErrorSchema } from "../api";
const ProductLike = z.object({ id: z.string(), name: z.string() });

describe("ApiResponseSchema", () => {
  const schema = ApiResponseSchema(ProductLike);
  it("accepts { ok: true, data: ... }", () => {
    const r = schema.parse({ ok: true, data: { id: "x", name: "y" } });
    expect(r.ok).toBe(true);
  });
  it("accepts { ok: false, error: ... }", () => {
    const r = schema.parse({ ok: false, error: { code: "UNAUTHORIZED" } });
    expect(r.ok).toBe(false);
  });
  it("rejects mixed shapes", () => {
    expect(() => schema.parse({ ok: true })).toThrow();
    expect(() => schema.parse({ ok: false, data: {} })).toThrow();
  });
});
```

- [ ] **Step 2: Implement in `shared/src/api.ts`**

```ts
export const ApiResponseSchema = <T extends z.ZodTypeAny>(data: T) =>
  z.discriminatedUnion("ok", [
    z.object({ ok: z.literal(true), data }),
    z.object({ ok: z.literal(false), error: ApiErrorSchema }),
  ]);
```

- [ ] **Step 3: Build, test, commit**

```bash
cd shared && npm run build && npm test
git add shared/
git commit -m "feat(shared): ApiResponseSchema runtime envelope parser (review Important #3)"
```

---

## Task 62: Add `NotificationEventInputSchema` (shared Important #4)

**Files:**

- Modify: `shared/src/notifications.ts`
- Modify: `services/src/notifications/notification-hub.ts`

- [ ] **Step 1: Schema**

```ts
export const NotificationEventInputSchema = z.discriminatedUnion("type", [
  NewOrderEventSchema.omit({ id: true, ts: true }),
  OrderStatusChangedEventSchema.omit({ id: true, ts: true }),
  ProductUpdatedEventSchema.omit({ id: true, ts: true }),
  ProductDeletedEventSchema.omit({ id: true, ts: true }),
]);
export type INotificationEventInput = z.infer<
  typeof NotificationEventInputSchema
>;
```

- [ ] **Step 2: In `NotificationHub.notify`, parse before dispatch**

```ts
const parsed = NotificationEventInputSchema.safeParse(input);
if (!parsed.success) {
  console.error("Invalid notification input", parsed.error);
  return;
}
```

- [ ] **Step 3: Build, test, commit**

```bash
cd shared && npm run build
git add shared/ services/
git commit -m "feat(shared,services): runtime validation for notification inputs (review Important #4)"
```

---

## Task 63: Promote `ENotificationType` to a real enum (shared Important #5)

**Files:**

- Modify: `shared/src/notifications.ts`

- [ ] **Step 1: Replace literal-union with enum**

```ts
export enum ENotificationType {
  NEW_ORDER = "new-order",
  ORDER_STATUS_CHANGED = "order-status-changed",
  PRODUCT_UPDATED = "product-updated",
  PRODUCT_DELETED = "product-deleted",
}
```

Update each `XxxEventSchema` to use `z.literal(ENotificationType.NEW_ORDER)` etc.

- [ ] **Step 2: Migrate string literals in `services/src/notifications/` and admin SSE handling.**

- [ ] **Step 3: Build, test, commit**

```bash
git add shared/ services/ admin/
git commit -m "refactor(shared): ENotificationType is a real enum (review Important #5)"
```

---

## Task 64: Canonical `EmailFormat` (shared Important #6)

**Files:**

- Modify: `shared/src/email.ts`
- Modify: `shared/src/settings.ts`

- [ ] **Step 1: In `email.ts`**

```ts
export const EmailFormatSchema = z.enum(["text", "markdown", "html"]);
export type EmailFormat = z.infer<typeof EmailFormatSchema>;
```

- [ ] **Step 2: In `settings.ts`** replace inline `z.enum([...])` with `EmailFormatSchema.optional()`.

- [ ] **Step 3: Build, commit**

```bash
git add shared/
git commit -m "refactor(shared): single canonical EmailFormatSchema reused from settings (review Important #6)"
```

---

End of Phase 7.
