# Bee Epic Apiary

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

## Gotchas

- **Env var conventions differ**: Web uses `VITE_` prefix (Vite), services uses Wrangler secrets
- **Hash Router**: Web uses `HashRouter` for GitHub Pages compatibility (URLs like `/#/products`)
- **Services KV namespace**: Must create via `npx wrangler kv namespace create "RATE_LIMIT_KV"` before deploying
- **No root tests**: Run `npm test` exits with error; use `npm run services:test` for service tests
