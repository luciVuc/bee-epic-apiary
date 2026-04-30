# stripe-checkout (Cloudflare Worker)

## Commands

| Command                 | Purpose                                           |
| ----------------------- | ------------------------------------------------- |
| `npm run dev`           | Local development server                          |
| `npm run test`          | Run Vitest with Workers pool                      |
| `npm run test:coverage` | Run tests with coverage report                    |
| `npm run deploy`        | Deploy to Cloudflare                              |
| `npm run cf-typegen`    | Regenerate Env types after wrangler.jsonc changes |

## Coverage

[![codecov](https://codecov.io/gh/user/repo/branch/main/graph/badge.svg)](https://codecov.io/gh/user/repo)

## Architecture

- **Entry**: `src/index.ts` — exports `fetch` handler
- **Env loading**: `src/env.ts` uses `dotenv.config()` at runtime (unusual for Workers — env vars also come from Wrangler bindings)
- **Bindings**: defined in `wrangler.jsonc` — regenerate types after changes: `npm run cf-typegen`

## Testing

Uses `@cloudflare/vitest-pool-workers` with `cloudflare:test`. Test file at `test/index.spec.ts` needs updating — currently expects "Hello World!" but worker handles Stripe checkout.

## Env Vars

Required in `.env`:

- `STRIPE_SECRET_KEY`
- `ALLOWED_ORIGINS`

## Gotchas

- dotenv loads at runtime in `src/env.ts` — values also available via Wrangler env bindings
- Test snapshot expects "Hello World!" but worker behavior differs — verify or update tests
