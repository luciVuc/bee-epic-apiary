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

This directory contains a Cloudflare Worker providing Stripe checkout session creation, product/order CRUD, settings KV storage, transactional email, and admin SSE notifications. Auth is cookie-session based (Phase 9): `bea_at` HttpOnly HS256 JWT signed with `JWT_SIGNING_SECRET`, with a bearer fallback for CI/scripts and an `X-Dev-Email` bypass in local development.

## Commands

| Command                 | Purpose                                                    |
| ----------------------- | ---------------------------------------------------------- |
| `npm run dev`           | Start the worker + Stripe webhook forwarder (concurrently) |
| `npm run dev:main`      | Start the worker alone (Wrangler, no forwarder)            |
| `npm run dev:webhooks`  | Forward Stripe webhooks to the local worker                |
| `npm run test`          | Run Vitest tests with Cloudflare Workers pool              |
| `npm run deploy`        | Deploy worker to Cloudflare                                |
| `npm run cf-typegen`    | Regenerate `Env` type definitions from `wrangler.jsonc`    |
| `npm run format`        | Format code with Prettier                                  |
| `npm run format:staged` | Format staged files with Prettier (via pretty-quick)       |

## Coverage

<!-- Placeholder: update with actual codecov URL when CI is configured -->

## Architecture

### Entry Point

- **`src/index.ts`**: Exports the `fetch` handler that routes all incoming requests.

### Routing

- **`src/router.ts`**: Manual route matching for `/checkout`, `/contact`, `/prices`, `/products`, `/products/count`, `/products/stats`, `/products/:id`, `/orders`, `/orders/:id`, `/settings/:type` (`site`/`process`/`testimonials`/`categories`), `/notifications/stream`, **`/whoami`** (returns the resolved caller identity or `null`), **`/auth/*`** (`POST /auth/login`, `/auth/logout`, `/auth/refresh`, `/auth/accept-invite`, `/auth/request-reset`, `/auth/complete-reset`, `/auth/change-password`, `/auth/bootstrap-owner`), and **`/users/*`** (`GET /users`, `POST /users/invite`, `PUT /users/{email}`, `DELETE /users/{email}`, `POST /users/{email}/reinvite`, `PUT /users/me`). Also exposes `GET /settings/auth-policy` (any authenticated) and `PUT /settings/auth-policy` (OWNER). Handles method validation, CORS preflight, and role-based authentication for protected routes.

### Authentication & Authorization (Phase 9)

- **`src/utils/resolveCaller.ts`** is the single source of caller identity. It implements a three-path trust chain evaluated in order (cookie → bearer → dev):
  1. **Cookie** — `bea_at` HttpOnly HS256 JWT signed with `JWT_SIGNING_SECRET` (1-hour TTL, `SameSite=None` for cross-origin, `Secure` in production). On successful verification the subject (caller email) is resolved to a user record from the user KV store.
  2. **Bearer** — `Authorization: Bearer <API_SECRET_KEY>` returns `{ email: 'ci@service', role: OWNER, via: 'bearer' }` for CI / service-to-service callers.
  3. **Dev** — `X-Dev-Email: <email>` header, honored only when `ENVIRONMENT=development`. If the email is in `OWNER_EMAILS` the caller resolves as OWNER; otherwise the user's role is read from user KV (must be ACTIVE). Never honored in production.
- **`roleSatisfies(actual, required)`** ranks roles `OWNER > MANAGER > EMPLOYEE > VENDOR` — higher rank satisfies lower.
- **`withStripeHandler`** accepts `{ requiredRole?: EStaffRole }`. On rejection it emits typed envelopes: `UNAUTHORIZED` (no caller resolved) or `FORBIDDEN.requiredRole` (caller present but rank too low). The resolved `caller` is forwarded to the handler as its 5th argument for audit / future use.
- **Per-route roles**:
  - `MANAGER`: `POST /products`, `PUT /products/:id`, `DELETE /products/:id`, `POST /prices`, and all `PUT /settings/{site,process,testimonials,categories}` (inline check in `settings-handler.ts`)
  - `EMPLOYEE`: `GET /products/stats`, `GET /orders`, `GET /orders/:id`, `PUT /orders/:id`, `GET /notifications/stream` (SSE)
  - `OWNER`: `GET /users`, `POST /users/invite`, `PUT /users/{email}`, `DELETE /users/{email}`, `POST /users/{email}/reinvite`, `PUT /settings/auth-policy`
  - `any authenticated`: `PUT /users/me`, `GET /settings/auth-policy`
  - `public` (no caller required): `GET /products`, `GET /products/count`, `GET /products/:id`, `POST /checkout`, `GET /settings/:type`, `GET /whoami`, `POST /contact`, and all `/auth/*` endpoints
- **Users** are stored in user KV and have lifecycle states: `INVITED | ACTIVE | DISABLED`.

### Admin SSE Notifications

- **`src/stripe/notifications/notifications-stream.ts`** is the public entry for `/notifications/stream`. Auth is enforced **inside the worker**: `isAllowedOrigin` → `resolveCaller` → role check. Rejections use the `IApiResponse` envelope (`UNAUTHORIZED` / `FORBIDDEN`).
- Browsers' native `EventSource` API cannot set an `Authorization` header, so production auth rides on the **`bea_at` cookie** — the worker reads the cookie directly and verifies the HS256 JWT. The admin client must construct `new EventSource(url, { withCredentials: true })` so the cookie is sent on cross-origin SSE connections.
- The stream itself (framing, replay, heartbeats) lives in the `NotificationHub` Durable Object. The handler delegates to the singleton `default` instance, forwarding `Last-Event-ID` so reconnects can resume.

### Contact

- **`src/contact/contact-handler.ts`**: Handles `POST /contact` — receives contact form submissions and delivers them as emails. If `formsparkFormId` is set in site content KV, forwards to Formspark; otherwise sends via Cloudflare Email Service (`env.EMAIL.send()`). Includes rate limiting, `_gotcha` honeypot spam protection, and reads site content from `CONTENT_KV`.

### Stripe Integration

- **`src/stripe/`**: Contains all Stripe-related handlers:
  - `checkout/`: Stripe Checkout session creation (handles one-time and subscription items)
  - `product/`: Product CRUD operations (create, read, update, delete)
  - `order/`: Order listing, detail, update, and confirmation (including admin email notification via Formspark or Cloudflare Email Service)

### Utilities

- **`src/utils/`**: Shared utility modules:
  - `resolveCaller.ts`: Cookie-session identity resolution (cookie → bearer → dev) — see "Authentication & Authorization" above. `timingSafeEqual.ts` is the constant-time string compare used inside it.
  - `handleCORS.ts`: CORS preflight and header handling
  - `isAllowedOrigin.ts`: Validates request origins against `ALLOWED_ORIGINS` env var
  - `isValidUrl.ts`: URL validation utility
  - `jsonResponse.ts`: `jsonOk<T>` / `jsonErr(IApiError)` / `httpStatusFor` — produces the `IApiResponse<T>` envelope
  - `rateLimiter.ts`: Durable Object-based rate limiting class
  - `rate-limiter-do.ts`: Atomic rate limiting Durable Object
  - `withStripeHandler.ts`: Wrapper for Stripe handlers (centralizes CORS, role check, rate limiting, origin validation, Stripe initialization)

### Bindings

- Defined in `wrangler.jsonc`. Regenerate TypeScript types after changing bindings:
  ```bash
  npm run cf-typegen
  ```
- **Email Routing**: All transactional emails route through Formspark if `formsparkFormId` is set in site content KV, otherwise through Cloudflare Email Service (`env.EMAIL.send()`).
  - When using Cloudflare Email Service, the `from` domain must be onboarded: `npx wrangler email sending enable yourdomain.com`
  - `formsparkFormId` is configured in the admin panel and stored in `CONTENT_KV` as part of site content

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

| Variable                | Description                                                                                                                                              | Source                                                            |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| `STRIPE_SECRET_KEY`     | Stripe secret key for API authentication                                                                                                                 | Wrangler Secret (`npx wrangler secret put STRIPE_SECRET_KEY`)     |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook signing secret — **critical for notifications**: without it, the worker returns 500 on every webhook and orders never transition to "new" | Wrangler Secret (`npx wrangler secret put STRIPE_WEBHOOK_SECRET`) |
| `ALLOWED_ORIGINS`       | Comma-separated list of allowed CORS origins, or `*` for all                                                                                             | Wrangler Secret or `.dev.vars`                                    |
| `JWT_SIGNING_SECRET`    | HS256 signing secret for `bea_at` cookie JWTs (required)                                                                                                 | Wrangler Secret (`npx wrangler secret put JWT_SIGNING_SECRET`)    |
| `OWNER_EMAILS`          | Comma-separated owner email allowlist — bootstrap + dev-header gate                                                                                      | Wrangler Secret (`npx wrangler secret put OWNER_EMAILS`)          |

### Optional

| Variable         | Description                                                                                                        | Default                 |
| ---------------- | ------------------------------------------------------------------------------------------------------------------ | ----------------------- |
| `API_SECRET_KEY` | Bearer token for CI / service-to-service calls (maps to OWNER role). Removed from the admin bundle as of Plan 3.   | None                    |
| `ADMIN_BASE_URL` | Base URL of the admin dashboard (e.g., `https://admin.beeepicapiary.com`). Used in order notification email links. | `""` (no link included) |
| `ENVIRONMENT`    | `"development"` enables the `X-Dev-Email` bypass in `resolveCaller`; anything else disables it. Set in `vars`.     | `"production"`          |

### Local Development

Secrets and dev-only env vars go in `services/.dev.vars` (gitignored):

```env
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
ALLOWED_ORIGINS=http://localhost:5173,http://localhost:5174

# HS256 signing secret for bea_at cookie JWTs
JWT_SIGNING_SECRET=dev-jwt-signing-secret-change-me

# Bearer fallback for CI/scripts (also maps to OWNER role at runtime)
API_SECRET_KEY=dev-api-key-change-me

# Bootstrap owner — the X-Dev-Email header below must resolve to a user role
# OR be present in this list to get OWNER access.
OWNER_EMAILS=owner@example.com
```

The dev-mode `X-Dev-Email` header is a server-side escape hatch for scripted API calls (curl, Playwright drivers that hit the worker directly). The admin SPA does NOT send it — since Phase 10 the SPA always authenticates through `/auth/login` and the `bea_at` cookie, in dev as in production. The worker honors `X-Dev-Email` only when `ENVIRONMENT=development` (set in `wrangler.jsonc` `env.development.vars`).

## Gotchas

- **No `dotenv` runtime loading**: This worker uses Cloudflare Workers' native env bindings, not `dotenv`. Env vars are set via Wrangler secrets or `.env` for local development.
- **KV Namespaces**: You must create one KV namespace before deploying:
  ```bash
  npx wrangler kv namespace create "CONTENT_KV"
  ```
  Copy the namespace IDs and replace the placeholders in `wrangler.jsonc` (both production and development environments).
- **Stripe API Version**: The worker uses Stripe API version `2026-05-27.dahlia` (configured in `withStripeHandler.ts`). Update this when upgrading the Stripe SDK.
- **Compatibility Date**: Set to `2026-03-10` to match the installed Cloudflare Workers Runtime. Update after upgrading Wrangler.
- **Email Service Domain**: The `send_email` binding requires the `from` domain to be onboarded. Run `npx wrangler email sending enable yourdomain.com` before sending emails in production. Local dev uses `--env development` with `"remote": false` (local simulator, no real emails sent). The contact handler uses `contact@<domain>` and order notification uses `noreply@<domain>` where `<domain>` is extracted from the admin email in site settings.
- **CORS Headers**: All responses include CORS headers if the request origin is allowed. Preflight requests are handled automatically.
- **Webhook secret required for notifications**: If `STRIPE_WEBHOOK_SECRET` is not set, the worker returns 500 on every incoming webhook event. Stripe events are silently dropped — no order confirmation, no admin SSE notification, no email. Verify with `wrangler secret list` before debugging notification issues.

## Security

- **Origin Validation**: All requests are validated against `ALLOWED_ORIGINS` to prevent unauthorized cross-origin requests.
- **Rate Limiting**: Uses Cloudflare KV to limit requests to 100 per minute per IP (configurable in `withStripeHandler.ts`). Uses trusted `cf.connectingIp` field to prevent IP spoofing.
- **Role-Based Authorization**: All mutating admin endpoints declare a minimum role via `{ requiredRole: EStaffRole.X }` on `withStripeHandler`. The middleware resolves the caller through `resolveCaller` (cookie → bearer → dev) and returns typed `UNAUTHORIZED` / `FORBIDDEN.requiredRole` envelopes on rejection. `OWNER_EMAILS` is a never-lockout bootstrap fallback that runs even before the user KV is populated.
- **Cookie Session**: Production auth relies solely on the `bea_at` HttpOnly `SameSite=None` cookie (HS256 JWT, 1-hour TTL). CSRF defence is handled by CORS origin validation. No external identity provider is required.
- **PBKDF2 Cap**: The Workers runtime hard-caps PBKDF2 at 100,000 iterations. The `derive()` function in `passwordHash.ts` clamps to this value. Do not set `ITERATIONS` above 100,000.
- **Input Validation**: All endpoints validate input (e.g., required fields, URL formats, quantity limits). Settings PUTs are validated against Zod schemas from `@bee-epic/shared`.

## Contributing

Follow the guidelines in this document and the [Source Code Documentation](./SOURCE.md) when making changes. Run tests and linting before submitting changes.
