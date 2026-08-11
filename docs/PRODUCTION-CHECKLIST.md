# Production Launch Checklist

The code is production-ready (typecheck clean; services/shared/admin/web suites
green; web prod build succeeds; key security items hardened). What remains is
**deployment configuration and one end-to-end smoke** — things a passing test
suite cannot verify. Work through this before a public launch.

> Legend: ☐ = to verify. Tick as you confirm each in the **production**
> environment (not local, not test).

---

## 1. Secrets & environment (Cloudflare)

Set as Wrangler **secrets** (`wrangler secret put <NAME> --env production`) for
the services worker — never commit these:

- ☐ `STRIPE_SECRET_KEY` — **live** key (`sk_live_…`), not a test key
- ☐ `STRIPE_WEBHOOK_SECRET` — the signing secret of the **production** webhook
  endpoint (see §2), not the local Stripe CLI secret
- ☐ `JWT_SIGNING_SECRET` — a strong, unique value (rotate off any dev/sample value)
- ☐ `API_SECRET_KEY` — the CI/service bearer secret (strong, unique)
- ☐ `OWNER_EMAILS` — the intended owner address(es) for the bootstrap gate

Set as environment **vars** (in `wrangler.jsonc` `env.production`, or the
dashboard):

- ☐ `ALLOWED_ORIGINS` — the real storefront + admin domains, comma-separated.
  **Must NOT be `*`** — the worker rejects `*` outside `development`, but confirm
  the real domains are listed (e.g. `https://beeepic.example,https://admin.beeepic.example`)
- ☐ `ENVIRONMENT` — `production` (this disables the dev auth bypass in
  `resolveCaller` and the `ALLOWED_ORIGINS=*` escape hatch)
- ☐ `RATE_LIMIT_MAX` / `RATE_LIMIT_WINDOW` — sane values (defaults: 100 / 60s)

Frontend build-time vars (Cloudflare Pages env for each project):

- ☐ web `VITE_API_URL` → the deployed worker origin
- ☐ admin `VITE_API_URL` → the deployed worker origin
- ☐ Cookie scope: the API host and each SPA host share an eTLD+1 (else the
  auth cookies won't ride along — the admin api client warns about this)

---

## 2. Stripe wiring

- ☐ Register the **production** webhook endpoint in the Stripe dashboard →
  `https://<worker-domain>/stripe/webhook`, subscribed to the checkout/session
  events the worker handles. Copy its signing secret into
  `STRIPE_WEBHOOK_SECRET` (§1).
  > Locally, orders only go "new"/notify when `npm run dev:webhooks` forwards
  > events. In production the registered endpoint is the equivalent — if it's
  > missing, orders silently never transition.
- ☐ Confirm the Stripe API version in `withStripeHandler.ts`
  (`2026-05-27.dahlia`) matches the account's expectations.
- ☐ Products in Stripe have a `default_price` (the storefront transform drops
  products without one).

---

## 3. First-run bootstrap

- ☐ Deploy the worker, then run the owner bootstrap once against production:
  `POST /auth/bootstrap-owner` for the address in `OWNER_EMAILS`.
- ☐ Verify `GET /whoami` (from an allowed Origin) now returns
  `bootstrapAvailable: false` and the owner can log into the admin panel.

---

## 4. End-to-end smoke (in test mode first, then live)

- ☐ Storefront loads, products list renders, a product detail page opens at top.
- ☐ Add to cart → checkout → redirected to Stripe → complete a test payment.
- ☐ Webhook fires → the order appears in the admin panel and notifies.
- ☐ Admin: log in, view orders, edit a product, log out.
- ☐ Spot-check the deployed apps' console for errors (0 expected).

---

## 5. Deploy commands

```sh
# from repo root — builds shared, deploys worker, deploys both Pages projects
npm run deploy
# or individually:
npm run services:deploy   # wrangler deploy
npm run web:deploy        # wrangler pages deploy → bee-epic-apiary
npm run admin:deploy      # wrangler pages deploy → bee-epic-apiary-admin
```

---

## Accepted debt (safe to defer post-launch)

- Storefront test coverage is ~47% (revenue path covered; marketing pages/layout
  not). A regression floor is enforced in `web/vitest.config.ts`.
- No client-side CSRF token — `SameSite=Lax` cookies + server Origin allow-list
  are the defense, which is sufficient for this app.
- Single `NotificationHub` Durable Object and full-catalogue Stripe walks — only
  a concern at higher volume.
- `transformStripeProduct` is duplicated (and diverged) between web and admin.
- ~6 intentional `console.*` error-path logs remain in web.

These are documented, not blocking.
