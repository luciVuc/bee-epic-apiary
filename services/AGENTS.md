# Bee Epic Apiary - Stripe Services Cloudflare Worker

> **DOCUMENTATION MAINTENANCE**: After making ANY changes to source code in this directory, you MUST update the following:
>
> - Source files: Update/add JSDoc comments on new/modified functions, interfaces, and exports
> - `SOURCE.md`: Keep in sync with function signatures, parameters, return values, and logic
> - `API.md`: Update endpoint descriptions, request/response shapes, status codes, and auth requirements
> - `README.md`: Keep commands, environment variables, and setup steps current
> - `AGENTS.md`: Keep architecture descriptions, gotchas, and testing info accurate
>
> Documentation must always be accurate, complete, and consistent with the actual implementation.

This directory contains a Cloudflare Worker providing Stripe checkout session creation and product CRUD (Create, Read, Update, Delete) operations, with CORS handling, rate limiting, and optional API key authentication.

## Commands

| Command                 | Purpose                                                 |
| ----------------------- | ------------------------------------------------------- |
| `npm run dev`           | Start local development server with Wrangler            |
| `npm run test`          | Run Vitest tests with Cloudflare Workers pool           |
| `npm run deploy`        | Deploy worker to Cloudflare                             |
| `npm run cf-typegen`    | Regenerate `Env` type definitions from `wrangler.jsonc` |
| `npm run format`        | Format code with Prettier                               |
| `npm run format:staged` | Format staged files with Prettier (via pretty-quick)    |

## Coverage

<!-- Placeholder: update with actual codecov URL when CI is configured -->

## Architecture

### Entry Point

- **`src/index.ts`**: Exports the `fetch` handler that routes all incoming requests.

### Routing

- **`src/router.ts`**: Manual route matching for `/checkout`, `/contact`, `/prices`, `/products`, `/products/count`, `/products/:id`, `/orders`, `/orders/:id`, `/orders/confirm`, `/settings/:type`, and `/notifications/stream` endpoints. Handles method validation, CORS preflight, and authentication for protected routes.

### Contact

- **`src/contact/contact-handler.ts`**: Handles `POST /contact` — receives contact form submissions and sends them as emails via Cloudflare Email Service (`env.EMAIL.send()`). Includes rate limiting, `_gotcha` honeypot spam protection, and reads the admin email from `CONTENT_KV`.

### Stripe Integration

- **`src/stripe/`**: Contains all Stripe-related handlers:
  - `checkout/`: Stripe Checkout session creation (handles one-time and subscription items)
  - `product/`: Product CRUD operations (create, read, update, delete)
  - `order/`: Order listing, detail, update, and confirmation (including admin email notification via Cloudflare Email Service)

### Utilities

- **`src/utils/`**: Shared utility modules:
  - `auth.ts`: Optional API key authentication middleware
  - `handleCORS.ts`: CORS preflight and header handling
  - `isAllowedOrigin.ts`: Validates request origins against `ALLOWED_ORIGINS` env var
  - `isValidUrl.ts`: URL validation utility
  - `jsonResponse.ts`: Standardized JSON response helper with CORS headers
  - `rateLimiter.ts`: KV-based rate limiting class
  - `withStripeHandler.ts`: Wrapper for Stripe handlers (centralizes CORS, rate limiting, origin validation, Stripe initialization)

### Bindings

- Defined in `wrangler.jsonc`. Regenerate TypeScript types after changing bindings:
  ```bash
  npm run cf-typegen
  ```
- **Email Service**: Uses `send_email` binding named `EMAIL` for transactional emails (contact form submissions + order notifications).
  - `from` domain must be onboarded: `npx wrangler email sending enable yourdomain.com`

## Testing

- Uses `@cloudflare/vitest-pool-workers` with `cloudflare:test` for Cloudflare-specific testing.
- Test files located in `test/` directory:
  - `index.spec.ts`: Integration tests for routing, checkout, and products endpoints
  - `stripe/`: Unit tests for Stripe handlers
  - `utils/`: Unit tests for utility functions
- Tests cover routing, Stripe handlers, settings, and utility functions.
- Stripe API functions are properly mocked to prevent actual API calls during testing.
- Run tests:
  ```bash
  npm run test
  ```

## Environment Variables

### Required

| Variable            | Description                                                  | Source                                                        |
| ------------------- | ------------------------------------------------------------ | ------------------------------------------------------------- |
| `STRIPE_SECRET_KEY` | Stripe secret key for API authentication                     | Wrangler Secret (`npx wrangler secret put STRIPE_SECRET_KEY`) |
| `ALLOWED_ORIGINS`   | Comma-separated list of allowed CORS origins, or `*` for all | Wrangler Secret or `.env`                                     |

### Optional

| Variable         | Description                                                                                                        | Default                 |
| ---------------- | ------------------------------------------------------------------------------------------------------------------ | ----------------------- |
| `API_SECRET_KEY` | API key for authenticating product CRUD operations. If not set, authentication is disabled.                        | None (dev mode)         |
| `ADMIN_BASE_URL` | Base URL of the admin dashboard (e.g., `https://admin.beeepicapiary.com`). Used in order notification email links. | `""` (no link included) |

### Local Development

Create a `.env` file in the `services/` directory with:

```env
ALLOWED_ORIGINS=http://localhost:5173,http://localhost:5174
# Optional:
# API_SECRET_KEY=your-secret-key
```

Secrets (not checked into git) go in `.dev.vars`:

```env
STRIPE_SECRET_KEY=sk_test_...
ALLOWED_ORIGINS=http://localhost:5173,http://localhost:5174
API_SECRET_KEY=dev-api-key-change-me
```

## Gotchas

- **No `dotenv` runtime loading**: This worker uses Cloudflare Workers' native env bindings, not `dotenv`. Env vars are set via Wrangler secrets or `.env` for local development.
- **KV Namespaces**: You must create two KV namespaces before deploying:
  ```bash
  npx wrangler kv namespace create "RATE_LIMIT_KV"
  npx wrangler kv namespace create "CONTENT_KV"
  ```
  Copy the namespace IDs and replace the placeholders in `wrangler.jsonc` (both production and development environments).
- **Stripe API Version**: The worker uses Stripe API version `2026-05-27.dahlia` (configured in `withStripeHandler.ts`). Update this when upgrading the Stripe SDK.
- **Compatibility Date**: Set to `2026-03-10` to match the installed Cloudflare Workers Runtime. Update after upgrading Wrangler.
- **Email Service Domain**: The `send_email` binding requires the `from` domain to be onboarded. Run `npx wrangler email sending enable yourdomain.com` before sending emails in production. Local dev uses `--env development` with `"remote": false` (local simulator, no real emails sent). The contact handler uses `contact@<domain>` and order notification uses `noreply@<domain>` where `<domain>` is extracted from the admin email in site settings.
- **CORS Headers**: All responses include CORS headers if the request origin is allowed. Preflight requests are handled automatically.

## Security

- **Origin Validation**: All requests are validated against `ALLOWED_ORIGINS` to prevent unauthorized cross-origin requests.
- **Rate Limiting**: Uses Cloudflare KV to limit requests to 100 per minute per IP (configurable in `withStripeHandler.ts`). Uses trusted `cf.connectingIp` field to prevent IP spoofing.
- **Optional Authentication**: Product CRUD endpoints (`POST /products`, `PUT /products/:id`, `DELETE /products/:id`) require API key authentication if `API_SECRET_KEY` is set.
- **Input Validation**: All endpoints validate input (e.g., required fields, URL formats, quantity limits).

## Contributing

Follow the guidelines in this document and the [Source Code Documentation](./SOURCE.md) when making changes. Run tests and linting before submitting changes.
