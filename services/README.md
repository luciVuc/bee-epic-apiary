# Bee Epic Apiary - Stripe Services Cloudflare Worker

> **Documentation**: See `AGENTS.md` for architecture, `API.md` for endpoints, and `SOURCE.md` for source code documentation. Keep these files in sync when making changes.

A lightweight Cloudflare Worker for integrating Stripe into your application, providing:

- Stripe Checkout session creation (one-time payments and subscriptions)
- Stripe Product CRUD (Create, Read, Update, Delete) operations
- CORS handling, rate limiting, and optional API key authentication

[![codecov](https://codecov.io/gh/user/repo/branch/main/graph/badge.svg)](https://codecov.io/gh/user/repo)

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
   Create a `.env` file in the `services/` directory:

   ```env
   STRIPE_SECRET_KEY=sk_test_your_stripe_test_key
   ALLOWED_ORIGINS=http://localhost:8787,http://localhost:3000
   # Optional: API_SECRET_KEY=your-secret-key
   ```

4. **Start local development server**:

   ```bash
   npm run dev
   ```

   The worker will be available at `http://localhost:8787`.

5. **Run tests**:
   ```bash
   npm run test
   ```

## Available Commands

| Command              | Purpose                                             |
| -------------------- | --------------------------------------------------- |
| `npm run dev`        | Start local development server                      |
| `npm run test`       | Run Vitest tests                                    |
| `npm run deploy`     | Deploy to Cloudflare                                |
| `npm run cf-typegen` | Regenerate TypeScript types for Cloudflare bindings |
| `npm run format`     | Format code with Prettier                           |

## Environment Variables

See [AGENTS.md](./AGENTS.md#environment-variables) for full details.

Required secrets for deployment:

```bash
npx wrangler secret put STRIPE_SECRET_KEY
npx wrangler secret put ALLOWED_ORIGINS
# Optional:
npx wrangler secret put API_SECRET_KEY
```

## API Documentation

Full API endpoint documentation is available in [API.md](./API.md).

## Source Code Documentation

Detailed documentation for all source code is available in [SOURCE.md](./SOURCE.md).

## Testing

- All 65 tests are currently passing.
- Run tests with `npm run test`.
- Tests use Vitest with Cloudflare Workers pool for accurate runtime simulation.
- Stripe API functions are properly mocked to prevent actual API calls during testing.

## Deployment

1. **Create KV namespace for rate limiting**:

   ```bash
   npx wrangler kv namespace create "RATE_LIMIT_KV"
   ```

   Copy the namespace ID and update `wrangler.jsonc`.

2. **Set secrets**:

   ```bash
   npx wrangler secret put STRIPE_SECRET_KEY
   npx wrangler secret put ALLOWED_ORIGINS
   ```

3. **Deploy**:
   ```bash
   npm run deploy
   ```

## Contributing

See [AGENTS.md](./AGENTS.md) for architecture details and contribution guidelines.

## License

MIT
