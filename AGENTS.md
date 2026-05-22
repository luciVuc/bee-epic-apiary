# Bee Epic Apiary

> **EXTREMELY IMPORTANT INSTRUCTION**: Whenever you make a change, fix, update, upgrade, or any modification to this project, you MUST also read this file and update it as necessary to keep it in sync with the project's current structure, conventions, requirements, commands, and gotchas. This is your single source of truth — keep it accurate.
>
> **DOCUMENTATION MAINTENANCE**: After making ANY changes to source code — including adding new files, modifying existing code, renaming, refactoring, or changing interfaces — you MUST update the relevant documentation:
>
> - `admin/` source files: Update/add JSDoc comments on functions, interfaces, and exports
> - `services/` source files: Update/add JSDoc comments on functions, interfaces, and exports
> - `services/SOURCE.md`: Keep in sync with actual function signatures, parameters, and logic
> - `services/API.md`: Update endpoint descriptions, request/response shapes, and status codes
> - `README.md` files: Keep structure, commands, and feature lists current
> - `AGENTS.md` files: Keep conventions, gotchas, and architecture accurate
>
> Code documentation must always be accurate, complete, and consistent with the actual implementation.

Monorepo: `admin/` (React admin panel) + `services/` (Cloudflare Worker) + `web/` (public storefront, in development).

## Commands

| Command                 | Purpose                                              |
| ----------------------- | ---------------------------------------------------- |
| `npm run dev`           | Start all dev servers concurrently                   |
| `npm run dev:all`       | Start all dev servers (same as above)                |
| `npm run build`         | Build services + web + admin                         |
| `npm run deploy`        | Deploy services to Cloudflare + web to GitHub Pages  |
| `npm run admin:dev`     | Admin dev server only (Vite, port 5174)              |
| `npm run admin:build`   | Build admin for production                           |
| `npm run admin:test`    | Run admin tests (Vitest + React Testing Library)     |
| `npm run services:dev`  | Services dev server only (Wrangler, port 8787)       |
| `npm run services:test` | Services tests (Vitest with Cloudflare Workers pool) |
| `npm run web:dev`       | Web dev server only (Vite, port 5173)                |
| `npm run test`          | Run all tests (services then admin)                  |

Root scripts use `npm run <script> --prefix <dir>` to delegate to sub-packages.

## Naming Convention (all packages)

All TypeScript interface definitions must be exported and prefixed with `I` (e.g., `ISpinnerProps`, `IProductFormDialogProps`, `IStripeProductResponse`, `IProduct`). This applies to `admin/`, `web/`, and `services/`.

## Data Attributes & Accessibility (all React UI projects)

Every React component must include `data-testid` attributes on its root element and all interactive/important child elements, using kebab-case hierarchical naming. The root gets `data-testid="component-name"` and children get `data-testid="component-name_element"`. This applies to `admin/` and `web/`.

Additionally, every component must comply with these accessibility requirements:

- **Form labels**: All `<input>`, `<select>`, and `<textarea>` elements must have an associated `<label>` via `htmlFor`/`id` or `aria-label`. Use the `TextField`/`TextAreaField` components (which auto-generate label associations) where possible.
- **Modals**: Dialog overlays require `role="dialog"`, `aria-modal="true"`, and `aria-labelledby` pointing to the dialog title.
- **Status/loading indicators**: Use `role="status"` with `aria-live="polite"` and visually hidden text (`sr-only`) for screen readers.
- **Error messages**: Use `role="alert"` on error banners so screen readers announce them immediately.
- **Progress bars**: Use `role="progressbar"` with `aria-valuenow`, `aria-valuemin`, `aria-valuemax`.
- **Icon-only buttons**: Must have `aria-label` describing the action.
- **Images**: Must have descriptive `alt` text.
- **Hidden content**: Elements off-screen (e.g. mobile sidebar closed state) must use `aria-hidden="true"` to hide from screen readers.

## Web App (`web/`)

> **Status**: In development. Documentation may be incomplete.

- **Framework**: React 18 + TypeScript + Vite with Hash Router (for GitHub Pages)
- **Data source**: Local JSON files in `src/data/` (products.json, site.json, testimonials.json, process.json)
- **Stripe**: Client-only checkout via `VITE_STRIPE_PUBLISHABLE_KEY` (must use `VITE_` prefix for Vite)
- **Base path**: Configured as `/golden-hive-apiary/` in `vite.config.ts` for GitHub Pages deployment
- **State**: Redux Toolkit (`cartSlice`, `uiSlice`)
- **No tests**: Web package has no test framework configured

## Services (`services/`)

Cloudflare Worker for Stripe checkout and product CRUD. See `services/AGENTS.md` for full details.

Key points:

- Uses Wrangler for dev/deploy
- Env vars set via Wrangler secrets (not `dotenv`)
- Run `npm run cf-typegen` after changing `wrangler.jsonc` bindings
- Tests: `npm run services:test` (Vitest with Cloudflare Workers pool)
- 65+ tests covering all endpoints, utils, and auth
- Coverage thresholds: 90% lines, branches, functions, statements

## Admin App (`admin/`)

- **Framework**: React 18 + TypeScript + Vite with React Router
- **Styling**: Tailwind CSS with custom `primary` and `dark` color palettes
- **State**: Redux Toolkit (`productsSlice` for product CRUD + pagination)
- **API**: Axios client communicating with the Cloudflare Worker for Stripe CRUD + content settings
- **Pages**: Dashboard, Products (list/detail), Settings (5 sub-tabs)
- **Tests**: Vitest with React Testing Library (jsdom); run `npm test` in `admin/`
- **Coverage thresholds**: 88% lines, 85% branches, 45% functions, 88% statements
- **Dev server**: Port 5174 (Vite proxy `/api` -> `http://localhost:8787`)

Key features:

- **Dashboard**: Stat cards, category breakdown bars, quick actions, recent products
- **Products**: CRUD with Stripe integration (product + price creation), search, category filter, pagination, desktop table / mobile card views
- **Product Form**: Modal dialog for add/edit with name, slug, description, price (cents), category, stock, featured, images, tags, subscription support
- **Settings**: Tabbed interface (Admin Config, Site Content, Process, Testimonials, Categories) — content saved to worker KV, admin config saved to localStorage
- **Accessibility**: data-testid attributes, aria labels, role attributes on all components
- **API Auth**: Bearer token from `VITE_API_SECRET_KEY` or localStorage settings

## Gotchas

- **Env var conventions differ**: Web uses `VITE_` prefix (Vite), services uses Wrangler secrets; admin uses `VITE_` prefix
- **Hash Router**: Web uses `HashRouter` for GitHub Pages compatibility (URLs like `/#/products`)
- **Services KV namespace**: Must create via `npx wrangler kv namespace create "RATE_LIMIT_KV"` before deploying; also need `CONTENT_KV` for settings
- **Root tests**: `npm test` runs `services:test` then `admin:test` sequentially
- **Stripe API version**: Services uses `2026-04-22.dahlia` — update when upgrading Stripe SDK
- **Admin API proxy**: Vite dev server proxies `/api` to `http://localhost:8787` (rewrites `/api` prefix)
- **Settings storage**: Admin config (API URL, keys) stored in localStorage; site content (business info, etc.) stored in worker KV
