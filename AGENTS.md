# Bee Epic Apiary

> **EXTREMLEY IMPORTANT INSTRUCTION**: Whenever you make a change, fix, update, upgrade, or any modification to this project, you MUST also read this file and update it as necessary to keep it in sync with the project's current structure, conventions, requirements, commands, and gotchas. This is your single source of truth — keep it accurate.

Monorepo: `web/` (React frontend) + `services/` (Cloudflare Worker).

## Commands

| Command                | Purpose                                                |
| ---------------------- | ------------------------------------------------------ |
| `npm run dev`          | Start both services and web dev servers (concurrently) |
| `npm run build`        | Build services (deploy) then web                       |
| `npm run deploy`       | Deploy services to Cloudflare + web to GitHub Pages    |
| `npm run web:dev`      | Web dev server only (Vite, port 5173)                  |
| `npm run services:dev` | Services dev server only (Wrangler)                    |

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

## Admin App (`admin/`)

- **Framework**: React 18 + TypeScript + Vite with React Router
- **State**: Redux Toolkit (`productsSlice`)
- **API**: Communicates with the Cloudflare Worker for CRUD operations
- **Tests**: Vitest with React Testing Library; run `npm test` in `admin/`

## Gotchas

- **Env var conventions differ**: Web uses `VITE_` prefix (Vite), services uses Wrangler secrets
- **Hash Router**: Web uses `HashRouter` for GitHub Pages compatibility (URLs like `/#/products`)
- **Services KV namespace**: Must create via `npx wrangler kv namespace create "RATE_LIMIT_KV"` before deploying
- **Root tests**: `npm test` runs `services:test` then `admin:test` sequentially
