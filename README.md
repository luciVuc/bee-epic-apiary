# Bee Epic Apiary

Monorepo for the Bee Epic Apiary e-commerce platform. Includes a React admin panel, a public-facing web storefront, and a Cloudflare Worker for Stripe integration.

## Project Structure

| Directory   | Description                                          |
| ----------- | ---------------------------------------------------- |
| `admin/`    | React 18 + TypeScript admin panel (Vite)             |
| `services/` | Cloudflare Worker for Stripe checkout & product CRUD |
| `web/`      | Public-facing React storefront (in development)      |

## Quick Start

```bash
git clone <repo-url>
npm install
npx wrangler kv namespace create "RATE_LIMIT_KV"  # First-time setup
npm run dev
```

- Admin panel: `http://localhost:5174`
- Services API: `http://localhost:8787`
- Web storefront: `http://localhost:5173`

## Available Commands

| Command          | Purpose                                                 |
| ---------------- | ------------------------------------------------------- |
| `npm run dev`    | Start services + admin + web dev servers (concurrently) |
| `npm run build`  | Build all sub-projects                                  |
| `npm run deploy` | Deploy services + web + admin build                     |
| `npm run test`   | Run all tests (services then admin)                     |
| `npm run lint`   | Lint admin and web                                      |
| `npm run format` | Format all code with Prettier                           |

## Sub-projects

- **Admin**: React 18 + TypeScript + Vite + Redux Toolkit + Tailwind CSS. Manage products and site settings. See `admin/README.md`.
- **Services**: Cloudflare Worker (Wrangler) for Stripe checkout, product CRUD, content settings, and rate-limited API. See `services/README.md`.
- **Web**: (In development) Public-facing storefront with Hash Router for GitHub Pages.

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
