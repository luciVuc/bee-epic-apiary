# Bee Epic Apiary

Monorepo: `admin/` (React admin panel) + `services/` (Cloudflare Worker) + `web/` (public storefront).

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

- Uses `HashRouter` - URLs like `/#/products`
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
- Stripe API version: `2026-04-22.dahlia` (update when upgrading SDK)

### Admin App Specifics

- Dev server proxies `/api` → `http://localhost:8787` (Vite config)
- API Auth: Bearer token from `VITE_API_SECRET_KEY` or localStorage
- Settings storage:
  - Admin config (API URL, keys) → localStorage
  - Site content (business info, etc.) → worker KV
- **Dynamic navbar title**: `AdminNavbar` fetches `businessName` from `GET /settings/site`
  - Displays `"{businessName} Admin"` (falls back to `"Admin"`)
  - **Never** hardcode site-specific display values from `ISiteContent`

### Commands

| Command                 | Purpose                                                     |
| ----------------------- | ----------------------------------------------------------- |
| `npm run dev`           | Start all dev servers (admin:5174, services:8787, web:5173) |
| `npm run services:test` | Worker tests (Vitest + Cloudflare Workers pool)             |
| `npm run admin:test`    | Admin tests (Vitest + React Testing Library)                |
| `npm run test`          | Run services then admin tests                               |
| `npm run lint`          | Lint admin + web (ESLint)                                   |
| `npm run format`        | Format all code (Prettier)                                  |
| `npm run build`         | Build all sub-projects                                      |
| `npm run deploy`        | Deploy services to Cloudflare + web to GitHub Pages         |

### Testing Thresholds

- **services**: 90% lines/branches/functions/statements
- **admin**: 88% lines, 85% branches, 45% functions, 88% statements

### Gotchas

- Stripe integration in all three parts (admin CRUD, services backend, web frontend)
- Root scripts use `npm run <script> --prefix <dir>` delegation
- Web has no test framework configured
- Admin uses Redux Toolkit (`productsSlice` for CRUD + pagination)
- Services uses manual route matching in `src/router.ts`
- Product CRUD in services requires API key auth if `API_SECRET_KEY` set

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
