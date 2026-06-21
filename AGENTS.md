# Bee Epic Apiary

Monorepo: `admin/` (React admin panel, PWA) + `services/` (Cloudflare Worker) + `web/` (public storefront PWA).

## Critical Conventions Agents Often Miss

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

- **Must** create KV namespaces before deploy:
  ```bash
  npx wrangler kv namespace create "RATE_LIMIT_KV"
  npx wrangler kv namespace create "CONTENT_KV"
  ```
- After changing `wrangler.jsonc` bindings: `npm run cf-typegen`
- Env vars: Wrangler secrets only (no `dotenv` runtime loading)
- Stripe API version: `2026-05-27.dahlia` (in `withStripeHandler.ts`; update when upgrading SDK)

### Admin App Specifics

- Dev server proxies `/api` → `http://localhost:8787` (strips `/api` prefix)
- API Auth: Bearer token from localStorage settings or `VITE_API_SECRET_KEY` fallback
- Settings storage:
  - Admin config (API URL, keys) → localStorage
  - Site content (business info, etc.) → worker KV
- **Dynamic navbar title**: `AdminNavbar` fetches `businessName` from `GET /settings/site`
  - Displays `"{businessName} Admin"` (falls back to `"Admin"`)
  - **Never** hardcode site-specific display values from `ISiteContent`
- Products use Redux Toolkit `productsSlice` (async thunks for CRUD + cursor-based pagination)
- Orders use Redux Toolkit `ordersSlice` (async thunks for CRUD + cursor-based pagination)

### Commands

| Command                 | Purpose                                                                 |
| ----------------------- | ----------------------------------------------------------------------- |
| `npm run dev`           | Start all 3 dev servers (admin:5174, services:8787, web:5173)           |
| `npm run dev:all`       | Same as `npm run dev` (alias)                                           |
| `npm run test`          | services tests → admin tests (Vitest)                                   |
| `npm run services:test` | Worker tests (Vitest + `@cloudflare/vitest-pool-workers`)               |
| `npm run admin:test`    | Admin tests (Vitest + jsdom + React Testing Library)                    |
| `npm run lint`          | ESLint on web, admin, and services                                      |
| `npm run format`        | Prettier on entire repo                                                 |
| `npm run build`         | Deploy services worker + build web + build admin                        |
| `npm run deploy`        | Deploy all 3 to Cloudflare (worker via Wrangler, web + admin via Pages) |
| `npm run preview`       | Preview web production build                                            |

### Testing Thresholds

- **services**: 90% lines/branches/functions/statements (istanbul, `@cloudflare/vitest-pool-workers`)
- **admin**: 88% lines, 85% branches, 45% functions, 88% statements (v8, jsdom)

### Services Architecture

- **`src/router.ts`**: Manual route matching (no framework)
- All handlers follow `{ fetch(request, env): Promise<Response> }` interface via `withStripeHandler` wrapper
- Stripe API version: `2026-05-27.dahlia` (in `withStripeHandler.ts`)
- Rate limiting: KV-based, 100 req/min per IP
- API key auth for mutating product endpoints if `API_SECRET_KEY` set
- **Routes**: `POST /checkout`, `POST /contact`, `POST /prices`, `GET|POST /products`, `GET /products/count`, `GET|PUT|DELETE /products/:id`, `GET|POST /orders/confirm`, `GET|PUT /orders/:id`, `GET /orders`, `GET /notifications/stream`, `GET|PUT /settings/:type` (site\|process\|testimonials\|categories)
- After changing `wrangler.jsonc` bindings: `npm run services:cf-typegen`
- KV namespaces: `CONTENT_KV` (settings storage), `RATE_LIMIT_KV`
- Env vars: `STRIPE_SECRET_KEY`, `ALLOWED_ORIGINS`, `API_SECRET_KEY` (Wrangler secrets); `RATE_LIMIT_MAX`, `RATE_LIMIT_WINDOW`, `ADMIN_BASE_URL` (wrangler.jsonc vars)
- **Email Routing**: All transactional emails (contact form + order notifications) route through Formspark if `formsparkFormId` is configured in site content, otherwise through Cloudflare Email Service (`env.EMAIL.send()`). The `send_email` binding `from` domain must be onboarded via `npx wrangler email sending enable yourdomain.com`.

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
- Local dev requires KV namespaces created (`npx wrangler kv namespace create "RATE_LIMIT_KV"` etc.)
- services has observability + source maps enabled in wrangler config
- `npm run build` includes `services:deploy` (= actual Cloudflare Worker deploy, not just build)
- `npm run deploy` deploys all 3: Worker via Wrangler, web + admin via Cloudflare Pages
- GitHub Actions: `.github/workflows/deploy.yml` runs tests then deploys all 3 on push to `main`/`release`
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
3. Update unit test coverage to meet thresholds (services: 90% lines/branches/functions/statements, admin: 88% lines, 85% branches, 45% functions, 88% statements)
4. Update all relevant documentation to keep it in sync with code changes:
   - Source files: Add/modify JSDoc comments on functions, interfaces, exports
   - README.md files: Keep structure, commands, and feature lists current
   - API.md/SOURCE.md (in services): Keep endpoint descriptions and function signatures accurate
   - This AGENTS.md file: Update conventions, gotchas, and architecture as needed
   - E2E test plans: Update or create relevant test plans for UI/UX changes using the e2e-test-plan skill format
