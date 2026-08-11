# Phase 8 — Minor cleanups (all projects)

> Parent: `2026-06-27-repo-wide-code-review-fixes.md`. Tasks 65–92.

Minor fixes batched by project. Each task is small enough that a single commit covers it. Run lint + tests for the affected sub-project after each commit.

---

## `services/` Minors — Tasks 65–72

### Task 65: Remove unnecessary `Stripe.Response<T>` casts (services M1)

- Files: `services/src/stripe/product/get-products.ts`, `services/src/stripe/product/shared.ts`
- Remove `as Stripe.Response<Stripe.Product>` casts; rely on SDK return types.
- Commit: `refactor(services): drop unnecessary Stripe.Response casts (review M1)`

### Task 66: Drop unused `lastId` from `paginateArray` (services M2)

- File: `services/src/utils/paginate.ts`
- If no caller uses `lastId`, remove from the return type. Otherwise keep and add a JSDoc note.
- Commit: `chore(services): drop unused lastId from paginateArray return (review M2)`

### Task 67: Centralize CORS preflight (services M3)

- Files: `services/src/router.ts`, `services/src/utils/handleCORS.ts`, `services/src/utils/withStripeHandler.ts`
- Have one canonical preflight builder that all handlers/routers call. Document allowed methods per route in one place.
- Commit: `refactor(services): single CORS preflight builder (review M3)`

### Task 68: Tighten `IEmailMessageBuilder.from` type (services M4)

- File: `services/src/types/index.ts`
- Change `from: string` to `from: EmailAddress` (the actually-passed type).
- Commit: `chore(services): IEmailMessageBuilder.from accepts EmailAddress only (review M4)`

### Task 69: Webhook logs unhandled event types (services M5)

- File: `services/src/stripe/webhook/webhook-handler.ts`
- Add a `default:` branch that `console.info("unhandled webhook event", { type: event.type, id: event.id })`.
- Commit: `chore(services): webhook logs unhandled event types (review M5)`

### Task 70: SSE id rollover documentation (services M10)

- File: `services/src/notifications/notification-hub.ts`
- Add JSDoc comment on the zero-padding scheme explaining the year-2286 rollover boundary. Add a unit test asserting the padding produces lex-sortable IDs for a 1000-event sample.
- Commit: `docs(services): document SSE id rollover boundary; add lex-sort test (review M10)`

### Task 71: Empty Origin handling in notifications-stream (services M11)

- File: `services/src/stripe/notifications/notifications-stream.ts`
- Replace empty-string `Access-Control-Allow-Origin: ''` with proper handling (return 403 or omit the header). Tests included.
- Commit: `fix(services): notifications-stream omits ACAO header instead of emitting empty (review M11)`

### Task 72: `/whoami` envelope policy (services M13)

- File: `services/src/router.ts`
- Document the intentional `ok:true, data:{caller:null}` for unauthenticated. Add JSDoc explaining the admin bootstrap rationale.
- Commit: `docs(services): clarify /whoami envelope policy for unauth callers (review M13)`

---

## `admin/` Minors — Tasks 73–79

### Task 73: Hoist `buildFetchParams` into `useCallback` (admin M1)

- Files: `admin/src/pages/OrdersPage.tsx`, `admin/src/pages/ProductsPage.tsx`
- Wrap `buildFetchParams` in `useCallback` with explicit deps; include in effect/callback deps lists.
- Commit: `chore(admin): stabilize buildFetchParams via useCallback (review M1)`

### Task 74: Consolidate React imports in DashboardPage (admin M2)

- File: `admin/src/pages/DashboardPage.tsx`
- Merge the two `import { ... } from "react"` lines into one.
- Commit: `style(admin): consolidate React imports in DashboardPage (review M2)`

### Task 75: Unique `data-testid`s in AdminNavbar (admin M3)

- File: `admin/src/components/layout/AdminNavbar.tsx`
- Lines 171/183 and 190/201 share testids. Make inner `<h1>` use `_title-mobile-text` / `_title-desktop-text`.
- Commit: `fix(admin): unique data-testid on AdminNavbar title elements (review M3)`

### Task 76: Validate Stripe sessions via Zod in transform (admin M4)

- File: `admin/src/utils/transform.ts`
- Replace `as Record<string, unknown>` chains with the relevant `OrderSchema.parse` from `@bee-epic/shared`.
- Commit: `refactor(admin): transform uses Zod parse instead of unsafe casts (review M4)`

### Task 77: Tooltip on truncated order IDs in list view (admin M5)

- Files: `admin/src/pages/OrdersPage.tsx` (or whichever table renders the truncated IDs)
- Add `title={order.id}` and `aria-label={order.id}` on the truncated link.
- Commit: `fix(admin): tooltip on truncated order IDs in list view (review M5)`

### Task 78: Move `arraysEqual` to module scope (admin M6)

- File: `admin/src/components/products/ProductFormDialog.tsx`
- Hoist `arraysEqual` to the top of the module (above all hooks) or to `admin/src/utils/arrays.ts`.
- Commit: `style(admin): hoist arraysEqual helper above hooks (review M6)`

### Task 79: Update admin slice error extractors to `IApiError` shape (admin M8)

- Files: `admin/src/store/productsSlice.ts`, `admin/src/store/ordersSlice.ts`, `admin/src/pages/SettingsPage.tsx`
- Replace `err?.response?.data?.error` reads with `err instanceof ApiError ? err.apiError.message : err.message`.
- Commit: `fix(admin): slice error extractors read IApiError envelope (review M8)`

---

## `web/` Minors — Tasks 80–86

### Task 80: Delete unused `useScrollSpy` (web #16)

- File: `web/src/hooks/useScrollSpy.ts`
- Confirm no imports, delete.
- Commit: `chore(web): remove unused useScrollSpy hook (review #16)`

### Task 81: Simplify `BrandIcon` type (web #17)

- File: `web/src/components/icons/BrandIcons.tsx`
- Replace `export type BrandIcon = {} & SimpleIcon` with `export type BrandIcon = SimpleIcon` (or remove if unused).
- Commit: `style(web): simplify BrandIcon type alias (review #17)`

### Task 82: Remove legacy `src/data/*.json` (web #18)

- Files: `web/src/data/products.json`, `web/src/data/site.json`, `web/src/data/process.json`, `web/src/data/testimonials.json`
- Confirm zero imports, delete.
- Commit: `chore(web): remove legacy src/data/*.json (review #18)`

### Task 83: Remove dead placeholder div in Navbar (web #19)

- File: `web/src/components/layout/Navbar.tsx`
- Drop the `navbar_mobile-menu-closed` placeholder.
- Commit: `chore(web): remove dead navbar placeholder div (review #19)`

### Task 84: Unique testid on SuccessPage icons (web #20)

- File: `web/src/components/pages/SuccessPage.tsx`
- Rename inner `success-page_icon` to `success-page_glyph` or similar.
- Commit: `fix(web): unique data-testid on SuccessPage icons (review #20)`

### Task 85: Clarify Button testid spread order (web #21)

- File: `web/src/components/ui/Button.tsx`
- Drop the `as const` literal; rely on spread order alone.
- Commit: `style(web): clarify Button data-testid spread order (review #21)`

### Task 86: Deduplicate categories list (web #22)

- File: `web/src/utils/constants.ts`
- Pick one source (likely `DEFAULT_SITE.categories`) and re-export `CATEGORIES` from it. Or delete `CATEGORIES` if unused.
- Commit: `refactor(web): single categories source of truth (review #22)`

(Item #23 — placeholder phone — should be addressed by the business when real data is configured in KV; leave a TODO comment in `constants.ts`.)

---

## `shared/` Minors — Tasks 87–92

### Task 87: `ProductCategory` keyof comment (shared M7)

- File: `shared/src/product.ts`
- Add JSDoc explaining the keyof-enum union is internal.
- Commit: `docs(shared): annotate ProductCategory keyof escape hatch (review M7)`

### Task 88: `SettingsType` keyof comment (shared M8)

- File: `shared/src/settings.ts`
- Same treatment as `ProductCategory`.
- Commit: `docs(shared): annotate SettingsType keyof escape hatch (review M8)`

### Task 89: Tighten `email` validators (shared M9)

- File: `shared/src/settings.ts`
- Replace `email: z.string()` with `email: z.string().email().optional()`. Same for any other email field.
- Commit: `fix(shared): site content email uses z.string().email() (review M9)`

### Task 90: JSDoc on `OrderUpdateSchema` snake_case fields (shared M10)

- File: `shared/src/order.ts`
- Add JSDoc explaining the snake_case is intentional (Stripe passthrough).
- Commit: `docs(shared): explain snake_case in OrderUpdateSchema (review M10)`

### Task 91: Drop redundant `verbatimModuleSyntax: false`; add `clean` to build (shared M12, M16)

- Files: `shared/tsconfig.json`, `shared/package.json`
- Remove the `verbatimModuleSyntax: false` line. Change `build` script to `"build": "npm run clean && tsc -p tsconfig.build.json"`.
- Commit: `chore(shared): drop redundant tsconfig flag; clean before build (review M12, M16)`

### Task 92: JSDoc on small interfaces (shared M15)

- File: `shared/src/*.ts`
- Add one-line `/** */` on `IShippingAddress`, `IOrderLineItem`, `INavLink`, `ISocialLinks`, the `IStripe*` interfaces.
- Commit: `docs(shared): JSDoc small interfaces (review M15)`

---

End of Phase 8.
