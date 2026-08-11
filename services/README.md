# Bee Epic Apiary - Stripe Services Cloudflare Worker

> **Documentation**: See `AGENTS.md` for architecture, `API.md` for endpoints, and `SOURCE.md` for source code documentation. Keep these files in sync when making changes.

A lightweight Cloudflare Worker for integrating Stripe into your application, providing:

- Stripe Checkout session creation (one-time payments and subscriptions)
- Stripe Product CRUD (Create, Read, Update, Delete) operations
- Order management with admin SSE notifications (NotificationHub Durable Object)
- KV-backed site content + staff settings
- Transactional email (Cloudflare Email Service or Formspark)
- Cookie-session authentication: `bea_at` HttpOnly HS256 JWT with `OWNER`/`MANAGER`/`EMPLOYEE`/`VENDOR` roles, plus a bearer fallback for CI
- CORS handling and DO-backed rate limiting

<!-- Placeholder: update with actual codecov URL when CI is configured -->

## Prerequisites

- [Node.js](https://nodejs.org/) (v18+ recommended)
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/) (installed via npm)
- [Cloudflare Account](https://dash.cloudflare.com/sign-up/workers-and-pages) (free tier available)
- [Stripe Account](https://stripe.com/) (test mode for development)

## Quick Start

1. **Clone the repository**:

   ```bash
   git clone <repo-url>
   cd bee-epic-apiary/services
   ```

2. **Install dependencies**:

   ```bash
   npm install
   ```

3. **Set up environment variables**:

   Copy `.dev.vars.example` to `.dev.vars` and fill in your test Stripe keys and dev identity. The example file documents every variable. Required secrets are `JWT_SIGNING_SECRET` and `OWNER_EMAILS`. For local development, also set `ENVIRONMENT=development` in `.dev.vars` to enable the `X-Dev-Email` header gate in `resolveCaller`.

   ```bash
   cp .dev.vars.example .dev.vars
   # then edit .dev.vars with your real test keys
   ```

4. **Start local development server** (worker + Stripe webhook forwarder):

   ```bash
   npm run dev
   ```

   The worker will be available at `http://localhost:8787`. This runs the worker
   **and** the Stripe webhook forwarder together (see [Local webhook forwarding](#local-webhook-forwarding)).
   To run the worker alone without the forwarder, use `npm run dev:main`.

5. **Run tests**:
   ```bash
   npm run test
   ```

## Local webhook forwarding

Stripe cannot reach `localhost`, so in local development the `checkout.session.completed`
event never arrives at the worker on its own. Without it, `confirmOrder` never runs — orders
are not marked `order_status: "new"` and no admin notification is broadcast. The symptom is a
successful `POST /checkout` in the worker log with **no** following `POST /stripe/webhook`.

To bridge Stripe → your local worker, the dev server runs the Stripe CLI forwarder alongside
the worker. The npm scripts invoke it via `npx` (`@stripe/cli`), so **no dependency is added to
`npm install`** and the deployment server never downloads a CLI it doesn't need.

**One-time setup** (the CLI needs to authorize against your Stripe account — this cannot be
scripted away):

```bash
npx -y @stripe/cli login
```

**Run the worker + forwarder together** (the default dev server):

```bash
npm run dev
# runs `dev:main` (wrangler dev) and `dev:webhooks` (stripe listen) concurrently
```

Or run just the forwarder on its own (e.g. against a worker already started elsewhere):

```bash
npm run dev:webhooks
# → npx -y @stripe/cli listen --forward-to localhost:8787/stripe/webhook
```

`stripe listen` prints a signing secret (`whsec_...`). It **must match** `STRIPE_WEBHOOK_SECRET`
in your `.dev.vars`, or the worker rejects every delivery with 401. If they differ, update
`.dev.vars` and restart the worker.

**Verify:** with the dev server running, place a test order (or `npx -y @stripe/cli trigger
checkout.session.completed`). The worker log should show `POST /stripe/webhook 200 OK`, the
order flips to `new`, and the admin SSE notification fires.

> **Production does NOT use `stripe listen`.** The deployed worker has a public URL, so Stripe
> delivers directly to `https://<your-worker-domain>/stripe/webhook`. You register that endpoint
> once in the Stripe Dashboard (Developers → Webhooks) and set `STRIPE_WEBHOOK_SECRET` to that
> endpoint's signing secret. The CLI is a developer tool for local dev only — it is never run on
> the deployment server. See `SETUP.md` step 8.

## Available Commands

| Command                | Purpose                                                              |
| ---------------------- | -------------------------------------------------------------------- |
| `npm run dev`          | Start the worker **and** the Stripe webhook forwarder together       |
| `npm run dev:main`     | Start the worker alone (no webhook forwarder)                        |
| `npm run dev:webhooks` | Forward Stripe webhooks to the local worker (needs Stripe CLI login) |
| `npm run test`         | Run Vitest tests                                                     |
| `npm run deploy`       | Deploy to Cloudflare                                                 |
| `npm run cf-typegen`   | Regenerate TypeScript types for Cloudflare bindings                  |
| `npm run format`       | Format code with Prettier                                            |

## Environment Variables

See [AGENTS.md](./AGENTS.md#environment-variables) for full details.

Required secrets for deployment:

```bash
npx wrangler secret put STRIPE_SECRET_KEY
npx wrangler secret put STRIPE_WEBHOOK_SECRET
npx wrangler secret put ALLOWED_ORIGINS
# Phase 9 — cookie session JWT + user roles
npx wrangler secret put JWT_SIGNING_SECRET      # HS256 signing key for bea_at cookie JWTs
npx wrangler secret put OWNER_EMAILS            # comma-separated bootstrap owners + dev-header allowlist
# Optional bearer fallback for CI / scripts (maps to OWNER role)
npx wrangler secret put API_SECRET_KEY
```

## API Documentation

Full API endpoint documentation is available in [API.md](./API.md).

## Source Code Documentation

Detailed documentation for all source code is available in [SOURCE.md](./SOURCE.md).

## Testing

- Tests use Vitest with Cloudflare Workers pool for accurate runtime simulation.
- Stripe API functions are properly mocked to prevent actual API calls during testing.
- Run tests with `npm run test`.

## Deployment

1. **Create KV namespace for content storage**:

   ```bash
   npx wrangler kv namespace create "CONTENT_KV"
   ```

   Copy the namespace IDs and update `wrangler.jsonc`.

2. **Set secrets**:

   ```bash
   npx wrangler secret put STRIPE_SECRET_KEY
   npx wrangler secret put STRIPE_WEBHOOK_SECRET
   npx wrangler secret put ALLOWED_ORIGINS
   npx wrangler secret put JWT_SIGNING_SECRET
   npx wrangler secret put OWNER_EMAILS
   ```

   Optional: `npx wrangler secret put API_SECRET_KEY` (bearer fallback for CI / scripts)

3. **Deploy**:
   ```bash
   npm run deploy
   ```

This deploys the Worker. For the full platform (worker + web storefront + admin panel), run from the monorepo root:

```bash
npm run deploy
```

## Contributing

See [AGENTS.md](./AGENTS.md) for architecture details and contribution guidelines.

## License

ISC
