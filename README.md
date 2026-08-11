# Bee Epic Apiary

Monorepo for the Bee Epic Apiary e-commerce platform. Includes a React admin panel, a public-facing web storefront (PWA), and a Cloudflare Worker for Stripe integration.

## Project Structure

| Directory   | Description                                                       |
| ----------- | ----------------------------------------------------------------- |
| `shared/`   | Cross-project TypeScript types + Zod schemas (`@bee-epic/shared`) |
| `admin/`    | React 19 + TypeScript admin panel (Vite)                          |
| `services/` | Cloudflare Worker for Stripe checkout, product CRUD & email       |
| `web/`      | Public-facing React 19 PWA storefront (BrowserRouter)             |

## Quick Start

```bash
git clone <repo-url>
npm install
npx wrangler kv namespace create "CONTENT_KV"     # First-time setup
# Note: rate limiting uses a Durable Object (RATE_LIMITER binding) — no separate KV setup needed.
npm run dev
```

- Admin panel: `http://localhost:5174`
- Services API: `http://localhost:8787`
- Web storefront: `http://localhost:5173`

## Available Commands

| Command                 | Purpose                                                                                          |
| ----------------------- | ------------------------------------------------------------------------------------------------ |
| `npm run dev`           | Start services + admin + web dev servers (concurrently)                                          |
| `npm run build`         | Build static output only (shared + web + admin); deploy the Worker via `npm run services:deploy` |
| `npm run deploy`        | Deploy all 3 projects to Cloudflare (worker + 2 Pages sites)                                     |
| `npm run test`          | Run all tests (services then admin)                                                              |
| `npm run services:test` | Run services tests only (Vitest + Cloudflare Workers pool)                                       |
| `npm run admin:test`    | Run admin tests only (Vitest + jsdom + React Testing Library)                                    |
| `npm run lint`          | Lint web, admin, and services                                                                    |
| `npm run format`        | Format all code with Prettier                                                                    |
| `npm run web:deploy`    | Deploy web storefront to Cloudflare Pages                                                        |
| `npm run admin:deploy`  | Deploy admin panel to Cloudflare Pages                                                           |

## CI/CD

A GitHub Actions workflow (`.github/workflows/deploy.yml`) runs tests on pushes to `main` or `release` branches, then deploys all 3 projects to Cloudflare:

1. **services** — Worker deployed via `wrangler deploy`
2. **web** — Storefront built and deployed to Cloudflare Pages (`bee-epic-apiary`)
3. **admin** — Admin panel built and deployed to Cloudflare Pages (`bee-epic-apiary-admin`)

### Required GitHub Secrets

| Secret                        | Used by     | Description                                                                              |
| ----------------------------- | ----------- | ---------------------------------------------------------------------------------------- |
| `CF_API_TOKEN`                | All         | Cloudflare API token with Workers + Pages perm                                           |
| `STRIPE_SECRET_KEY`           | services    | Stripe secret key (live or test)                                                         |
| `STRIPE_WEBHOOK_SECRET`       | services    | Stripe webhook signing secret                                                            |
| `ALLOWED_ORIGINS`             | services    | Comma-separated CORS origins                                                             |
| `JWT_SIGNING_SECRET`          | services    | **Required.** HS256 key for cookie session signing. Generate: `openssl rand -base64 32`. |
| `API_SECRET_KEY`              | services    | Optional CI bearer bypass — `Authorization: Bearer` maps to OWNER role at runtime.       |
| `OWNER_EMAILS`                | services    | Comma-separated bootstrap owner emails (never-lockout safety net)                        |
| `VITE_STRIPE_PUBLISHABLE_KEY` | web + admin | Stripe publishable key                                                                   |

> The admin panel uses a cookie-based login page (no credentials in the bundle). On first deploy, `GET /whoami` returns `bootstrapAvailable: true` and the SPA redirects to `/bootstrap` to create the first OWNER account. See `SETUP.md` Step 10 for the full bootstrap flow.

### Required GitHub Variables

| Variable        | Used by | Default                                            |
| --------------- | ------- | -------------------------------------------------- |
| `VITE_API_URL`  | web     | `https://bee-epic-apiary.babu-frik-jr.workers.dev` |
| `VITE_SITE_URL` | web     | `https://bee-epic-apiary.pages.dev`                |

## Sub-projects

- **Admin**: React 19 + TypeScript + Vite + Redux Toolkit + Tailwind CSS 4. Manage products, orders, and site settings. See `admin/README.md`.
- **Services**: Cloudflare Worker (Wrangler) for Stripe checkout, product CRUD, order management, content settings, contact form email, and rate-limited API. See `services/README.md`.
- **Web**: Public-facing PWA storefront with BrowserRouter, Framer Motion animations, shopping cart, and Stripe checkout. See `web/README.md`.

## Documentation

- **`SETUP.md`** — Step-by-step guide for business owners to get the store online (accounts, deployment, domain, email)
- `admin/README.md` — Admin panel setup, features, and API integration
- `services/README.md` — Worker setup, commands, and deployment
- `services/API.md` — Full API endpoint reference
- `services/SOURCE.md` — Source code documentation (functions, classes, types)
- `services/AGENTS.md` — Architecture, environment variables, and contribution guidelines
- `AGENTS.md` — Monorepo-wide conventions and gotchas
- `docs/index.json` — Machine-readable project index: every source file with its exported symbols (kind, name, line). Generated for coding-assistant navigation.
- `docs/knowledge-graph.json` — Machine-readable knowledge graph: nodes (packages, modules, routes, Durable Objects, data flows) + edges (dependencies, calls, data flow, role gating) + key invariants.

## Environment Variables

- **Admin** (`admin/.env`): Uses `VITE_` prefix (Vite convention)
- **Services**: Uses Wrangler secrets (`npx wrangler secret put`) or `.env` for local dev

## License

ISC
