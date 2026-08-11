# Bee Epic Apiary

Monorepo: `admin/` (React admin panel, PWA) + `services/` (Cloudflare Worker) + `web/` (public storefront PWA) + `shared/` (cross-project types + Zod schemas).

## Critical Conventions Agents Often Miss

### Shared Types (`shared/`)

- **Canonical types + Zod schemas** for everything that crosses a network boundary: `IProduct`, `IOrder`, `ISiteContent`, `IProcessStep`, `ITestimonial`, `ICategory`, `INotificationEvent`, `IApiError`, `IApiResponse<T>`, etc.
- Wired as an npm `file:` dependency — each consumer's `package.json` has `"@bee-epic/shared": "file:../shared"`.
- **Build it before each consumer**: `npm run shared:install && npm run shared:build` from the root. The root `preinstall`, `dev`, and `build` scripts already chain this. CI does the same per job.
- Edits to `shared/src/*.ts` require a rebuild (`npm run shared:build` or `npm run shared:dev` for watch mode) before consumers see the updated `.d.ts`.
- Type-only re-exports live in each subproject's local types folder (`services/src/types/index.ts`, `admin/src/types/*.ts`, `web/src/types/index.ts`) so existing imports keep working. Prefer importing from `@bee-epic/shared` directly in new code.
- `IEmailMessageBuilder` is intentionally NOT in `shared/` — it references the Cloudflare Workers runtime types (`EmailAddress`, `EmailAttachment`) that admin and web don't have. It lives in `services/src/types/index.ts`.

### TypeScript

- All interfaces **must** be exported and prefixed with `I` (e.g., `IProduct`, `ISpinnerProps`)
- Enums use `E` prefix (e.g., `EProductCategory`)

### React UI (admin & web)

- Every component needs `data-testid="component-name"` on root
- Interactive children get `data-testid="component-name_element"` (kebab-case)
- Form inputs require explicit `<label>` via `htmlFor`/`id` or `aria-label`
- Modals need `role="dialog"`, `aria-modal="true"`, `aria-labelledby` to title
- Status indicators: `role="status"` + `aria-live="polite"` + visually hidden text
- Error messages: `role="alert"` on banners
- Progress bars: `role="progressbar"` with `aria-valuenow/min/max`
- Icon-only buttons: `aria-label` describing action
- Images: descriptive `alt` text
- Off-screen content: `aria-hidden="true"`

### Environment Variables

- **web/admin**: Use `VITE_` prefix (Vite requirement)
- **services**: Use Wrangler secrets (`npx wrangler secret put`)
- Never mix conventions - web/admin won't see non-VITE\_ vars

### Web App Specifics

- Uses `BrowserRouter` - URLs like `/products`
- Base path: `"/"` in `vite.config.ts` (change for GitHub Pages subpath deploys)
- Data source: Backend API (`services/` Cloudflare Worker) fetched via `src/utils/api.ts`
  - `GET /settings/site` for site content
  - `GET /settings/process` for process steps
  - `GET /settings/testimonials` for testimonials
  - `GET /products?expand[]=data.default_price` for products (transformed via `src/utils/transform.ts`)
- Checkout: `POST /checkout` on the services worker (not client-only redirect)
- API base URL configured via `VITE_API_URL` env var (default `http://localhost:8787`)
- Stripe publishable key via `VITE_STRIPE_PUBLISHABLE_KEY`
- Legacy JSON files in `src/data/` are no longer imported

### Services Specifics (Cloudflare Worker)

- **Must** create KV namespace before deploy:
  ```bash
  npx wrangler kv namespace create "CONTENT_KV"
  ```
- After changing `wrangler.jsonc` bindings: `npm run cf-typegen`
- Env vars: Wrangler secrets only (no `dotenv` runtime loading)
- Stripe API version: `2026-05-27.dahlia` (in `withStripeHandler.ts`; update when upgrading SDK)

### Admin App Specifics

- Dev server proxies `/api` → `http://localhost:8787` (strips `/api` prefix)
- **Auth (Phase 9)**: Cookie-based session, no credentials baked into the bundle.
  - **Cookie session**: `bea_at` HttpOnly HS256 JWT signed with `JWT_SIGNING_SECRET`,
    1-hour TTL, `SameSite=Lax`. Subject is the caller's email.
  - **Server-side trust chain** (evaluated in order by `resolveCaller`):
    1. Cookie (`bea_at`) — standard login path.
    2. Bearer (`Authorization: Bearer <API_SECRET_KEY>`) — CI/scripts, resolves as `OWNER` (`ci@service`).
    3. Dev header (`X-Dev-Email`) — server-side only, honored **only when `ENVIRONMENT=development`**. The SPA does **not** send this header; it is a test/script escape hatch.
  - **Client-side auth components** live under `admin/src/components/auth/` and `admin/src/pages/`:
    - `LoginPage` — email + password form, sets the `bea_at` cookie on success.
    - `AcceptInvitePage` / `CompleteResetPage` — token-gated password-set flows.
    - `BootstrapOwnerPage` — first-deploy flow; only reachable when `bootstrapAvailable: true`.
    - `RequireCaller` — redirects unauthenticated users to `/login`.
    - `BootstrapGuard` — redirects to `/bootstrap` when `bootstrapAvailable: true`.
    - `UserMenu` — navbar dropdown with Change Password and Sign Out actions.
  - `useCaller()` hook (`admin/src/hooks/useCaller.ts`) caches `/whoami` in the Redux `auth` slice and exposes `{ email, role, via }`.
  - Axios client uses `withCredentials: true` so the session cookie is forwarded automatically.
- Settings storage:
  - Admin config (API URL) → Vite build-time env var (`VITE_API_URL`).
  - Site content (business info, settings) → worker KV via `GET|PUT /settings/:type`.
  - **Users list** → worker KV via `/users/*` handlers (OWNER-only write). UI tab is visible only when `caller.role === EStaffRole.OWNER`.
  - **Password policy** → worker KV via `GET|PUT /settings/auth-policy` (OWNER-only write). UI tab visible only to OWNER.
  - Dark/light theme preference → localStorage (`"theme"` key) — the only localStorage usage.
- **Dynamic navbar title**: `AdminNavbar` fetches `businessName` from `GET /settings/site`
  - Displays `"{businessName} Admin"` (falls back to `"Admin"`)
  - Also displays `caller.email` + role badge from `useCaller()`
  - **Never** hardcode site-specific display values from `ISiteContent`
- Products use Redux Toolkit `productsSlice` (async thunks for CRUD + cursor-based pagination)
- Orders use Redux Toolkit `ordersSlice` (async thunks for CRUD + cursor-based pagination)
- Auth state uses Redux Toolkit `authSlice` with `fetchCaller` async thunk

### Commands

| Command                 | Purpose                                                                                        |
| ----------------------- | ---------------------------------------------------------------------------------------------- |
| `npm run dev`           | Start all 3 dev servers (admin:5174, services:8787, web:5173)                                  |
| `npm run dev:all`       | Same as `npm run dev` (alias)                                                                  |
| `npm run test`          | services tests → admin tests (Vitest)                                                          |
| `npm run services:test` | Worker tests (Vitest + `@cloudflare/vitest-pool-workers`)                                      |
| `npm run admin:test`    | Admin tests (Vitest + jsdom + React Testing Library)                                           |
| `npm run lint`          | ESLint on web, admin, and services                                                             |
| `npm run format`        | Prettier on entire repo                                                                        |
| `npm run build`         | Build static output only (shared + web + admin) — Worker deploys via `npm run services:deploy` |
| `npm run deploy`        | Deploy all 3 to Cloudflare (worker via Wrangler, web + admin via Pages)                        |
| `npm run preview`       | Preview web production build                                                                   |

### Testing Thresholds

- **services**: 90% lines/branches/functions/statements (istanbul, `@cloudflare/vitest-pool-workers`)
- **admin**: 80% lines, 67% branches, 75% functions, 78% statements (v8, jsdom)
- **web**: 45% lines, 38% branches, 30% functions, 45% statements (v8, jsdom) — a first regression floor over the critical (revenue) path; ratchets up as coverage grows

### Services Architecture

- **`src/router.ts`**: Manual route matching (no framework)
- All handlers follow `{ fetch(request, env): Promise<Response> }` interface via `withStripeHandler` wrapper
- Stripe API version: `2026-05-27.dahlia` (in `withStripeHandler.ts`)
- Rate limiting: Durable Object-based, 100 req/min per IP (atomic counting)
- **Auth (Phase 9)**: role-based via `resolveCaller(request, env)` in `src/utils/resolveCaller.ts`.
  - Three-path trust chain (evaluated in order): cookie (`bea_at` HttpOnly HS256 JWT signed with `JWT_SIGNING_SECRET`, verified and subject extracted) → bearer fallback (`Authorization: Bearer <API_SECRET_KEY>` → maps to OWNER, `ci@service`) → dev bypass (`X-Dev-Email` header, only when `ENVIRONMENT=development`).
  - `withStripeHandler` accepts `{ requiredRole?: EStaffRole }`. The wrapper resolves the caller, checks `roleSatisfies(caller.role, required)`, and returns typed `UNAUTHORIZED` / `FORBIDDEN.requiredRole` envelopes on rejection. Caller is forwarded to the handler as the 5th arg for audit logging.
  - Role rank: `OWNER > MANAGER > EMPLOYEE > VENDOR`. Products/prices require MANAGER; orders require EMPLOYEE; `/users/*` write requires OWNER.
  - User list lookup: `CONTENT_KV.get('users')` parsed with `UserListSchema`; `OWNER_EMAILS` env var is a comma-separated bootstrap fallback (never lockout).
- **Routes**: `POST /stripe/webhook`, `POST /checkout`, `POST /contact`, `POST /prices` (MANAGER), `GET|POST /products` (POST MANAGER), `GET /products/count`, `GET /products/stats` (EMPLOYEE), `POST /products/cleanup` (MANAGER), `GET|PUT|DELETE /products/:id` (PUT/DELETE MANAGER), `GET /orders` (EMPLOYEE), `GET|PUT /orders/:id` (PUT EMPLOYEE), `GET /notifications/stream` (EMPLOYEE), `GET|PUT /settings/:type` (site\|process\|testimonials\|categories; PUT MANAGER), `GET|PUT /settings/auth-policy` (GET any authenticated, PUT OWNER), `GET /users` (OWNER), `POST /users/invite` (OWNER), `PUT /users/me` (self), `POST /users/:email/reinvite` (OWNER), `PUT|DELETE /users/:email` (OWNER), `POST /auth/login`, `POST /auth/logout`, `POST /auth/refresh`, `POST /auth/request-reset`, `POST /auth/complete-reset`, `POST /auth/accept-invite`, `POST /auth/change-password`, `POST /auth/bootstrap-owner`, **`GET /whoami`** (returns `{ caller: ICaller | null, bootstrapAvailable: boolean }`, always public — admin uses it to bootstrap UI state)
- After changing `wrangler.jsonc` bindings: `npm run services:cf-typegen`
- KV namespaces: `CONTENT_KV` (settings + staff list storage)
- Env vars (Wrangler secrets unless noted):
  - `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `ALLOWED_ORIGINS`, `JWT_SIGNING_SECRET` (required — HS256 cookie signing key), `API_SECRET_KEY` (optional CI/scripts bearer fallback), `OWNER_EMAILS` (comma-separated bootstrap owners)
  - `RATE_LIMIT_MAX`, `RATE_LIMIT_WINDOW`, `ADMIN_BASE_URL`, **`ENVIRONMENT`** (`production` or `development` — gates the `X-Dev-Email` bypass) in `wrangler.jsonc` vars
- **Email Routing**: All transactional emails (contact form + order notifications) route through Formspark if `formsparkFormId` is configured in site content, otherwise through Cloudflare Email Service (`env.EMAIL.send()`). The `send_email` binding `from` domain must be onboarded via `npx wrangler email sending enable yourdomain.com`.
- **Admin notifications (SSE)**: `GET /notifications/stream` is fanout from a single `NotificationHub` Durable Object instance (name `default`). Events are persisted in DO SQLite storage and replayed on reconnect via SSE `Last-Event-ID`. The replay window is owner-configurable via `ISiteContent.notificationReplayHours` (1–24 hours, default 1); eviction is two-axis (age + count, max 500). Event types: `new-order`, `order-status-changed`, `product-updated`, `product-deleted`. Typed via `src/notifications/types.ts` (`INotificationEvent` discriminated union).

### Web Specifics

- Uses **BrowserRouter** (not HashRouter despite outdated README)
- Data fetched from services API at mount: `GET /settings/site`, `/settings/process`, `/settings/testimonials`, `/products?expand[]=data.default_price`
- Checkout: `POST /checkout` on services worker (not client-side Stripe redirect)
- Contact form & order notifications: `POST /contact` on services worker; routes through Formspark if `formsparkFormId` is set in site content, otherwise through Cloudflare Email Service (`env.EMAIL.send()`)
- Cart persisted to localStorage under key `beeEpicCart`
- Legacy JSON in `src/data/` no longer imported
- Has `vitest` in devDependencies but **no vitest config or test files** — treat as untested
- PWA via `vite-plugin-pwa` (auto-update service worker, manifest for "Bee Epic Apiary")
- Cloudflare Pages deploy via `npm run web:deploy` (`wrangler pages deploy`) or Git integration

## Gotchas

- root `package.json` delegates to sub-packages via `npm run <script> --prefix <dir>`
- Stripe touches all 3 packages (admin CRUD, services backend, web checkout)
- `admin/src/utils/api.ts` uses axios; `web/src/utils/api.ts` uses native fetch
- Local dev requires KV namespace created (`npx wrangler kv namespace create "CONTENT_KV"`)
- services has observability + source maps enabled in wrangler config
- `npm run build` builds static output only (shared + web + admin). The Worker is deployed separately via `npm run services:deploy` (Wrangler) in CI or locally — never from a Pages build.
- `npm run deploy` deploys all 3: Worker via Wrangler, web + admin via Cloudflare Pages
- GitHub Actions: `.github/workflows/deploy.yml` runs tests then deploys the Worker (`deploy-services`) and both Pages sites separately on push to `master`
- **`SETUP.md`** at root is the business-owner guide (accounts, deployment setup, domain, email). Keep it in sync with actual config values.
- web and admin both use `tsc && vite build` (type-check before bundling)
- `services/AGENTS.md`, `services/API.md`, `services/SOURCE.md` are maintained separately

### UI Development Guidelines

When working on UI features or changes:

- Always test in the browser both before and after making changes using Playwright
- Before changes: Understand current behavior and context by manually testing in browser
- After changes: Verify the feature works as expected through browser testing
- For any UI/UX changes, update or create relevant E2E test plans in the e2e-test-plan skill format
- When fixing bugs, reproduce them in browser first, then fix, then verify fix works
- Use Playwright for all browser automation tasks as specified in the agent-browser skill

### Post-Update Responsibilities

After every code change, agents MUST:

1. Run `npm run test` to ensure tests pass
2. Run `npm run lint` to maintain code quality
3. Update unit test coverage to meet thresholds (services: 90% lines/branches/functions/statements, admin: 80% lines, 67% branches, 75% functions, 78% statements, web: 45% lines, 38% branches, 30% functions, 45% statements)
4. Update all relevant documentation to keep it in sync with code changes:
   - Source files: Add/modify JSDoc comments on functions, interfaces, exports
   - README.md files: Keep structure, commands, and feature lists current
   - API.md/SOURCE.md (in services): Keep endpoint descriptions and function signatures accurate
   - This AGENTS.md file: Update conventions, gotchas, and architecture as needed
   - E2E test plans: Update or create relevant test plans for UI/UX changes using the e2e-test-plan skill format
   - `docs/index.json` + `docs/knowledge-graph.json`: Regenerate/patch when files, exports, routes, role gating, Durable Objects, or cross-package data flows change. `index.json` is the flat file→symbol map; `knowledge-graph.json` is the nodes+edges model (routes carry their verified `requiredRole`).
