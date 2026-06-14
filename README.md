# Bee Epic Apiary

Monorepo for the Bee Epic Apiary e-commerce platform. Includes a React admin panel, a public-facing web storefront (PWA), and a Cloudflare Worker for Stripe integration.

## Project Structure

| Directory   | Description                                                 |
| ----------- | ----------------------------------------------------------- |
| `admin/`    | React 19 + TypeScript admin panel (Vite)                    |
| `services/` | Cloudflare Worker for Stripe checkout, product CRUD & email |
| `web/`      | Public-facing React 19 PWA storefront (BrowserRouter)       |

## Quick Start

```bash
git clone <repo-url>
npm install
npx wrangler kv namespace create "RATE_LIMIT_KV"  # First-time setup
npx wrangler kv namespace create "CONTENT_KV"     # First-time setup
npm run dev
```

- Admin panel: `http://localhost:5174`
- Services API: `http://localhost:8787`
- Web storefront: `http://localhost:5173`

## Available Commands

| Command                 | Purpose                                                       |
| ----------------------- | ------------------------------------------------------------- |
| `npm run dev`           | Start services + admin + web dev servers (concurrently)       |
| `npm run build`         | Deploy services + build web + admin                           |
| `npm run deploy`        | Deploy services + deploy web + build admin                    |
| `npm run test`          | Run all tests (services then admin)                           |
| `npm run services:test` | Run services tests only (Vitest + Cloudflare Workers pool)    |
| `npm run admin:test`    | Run admin tests only (Vitest + jsdom + React Testing Library) |
| `npm run lint`          | Lint web, admin, and services                                 |
| `npm run format`        | Format all code with Prettier                                 |

## Sub-projects

- **Admin**: React 19 + TypeScript + Vite + Redux Toolkit + Tailwind CSS 4. Manage products, orders, and site settings. See `admin/README.md`.
- **Services**: Cloudflare Worker (Wrangler) for Stripe checkout, product CRUD, order management, content settings, contact form email, and rate-limited API. See `services/README.md`.
- **Web**: Public-facing PWA storefront with BrowserRouter, Framer Motion animations, shopping cart, and Stripe checkout. See `web/README.md`.

## Documentation

Each sub-project contains its own documentation:

- `admin/README.md` — Admin panel setup, features, and API integration
- `services/README.md` — Worker setup, commands, and deployment
- `services/API.md` — Full API endpoint reference
- `services/SOURCE.md` — Source code documentation (functions, classes, types)
- `services/AGENTS.md` — Architecture, environment variables, and contribution guidelines
- `AGENTS.md` — Monorepo-wide conventions and gotchas

## Environment Variables

- **Admin** (`admin/.env`): Uses `VITE_` prefix (Vite convention)
- **Services**: Uses Wrangler secrets (`npx wrangler secret put`) or `.env` for local dev

## License

ISC
