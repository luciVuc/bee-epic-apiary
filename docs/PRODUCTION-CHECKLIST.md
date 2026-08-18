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
- ☐ `ADMIN_BASE_URL` — the admin panel URL (e.g. `https://admin.beeepicapiary.com`).
  **Required** — if empty, invite emails and order notification links will have
  broken relative URLs. Set this _before_ deploying.
- ☐ `ENVIRONMENT` — `production` (this disables the dev auth bypass in
  `resolveCaller` and the `ALLOWED_ORIGINS=*` escape hatch)
- ☐ `RATE_LIMIT_MAX` / `RATE_LIMIT_WINDOW` — sane values (defaults: 100 / 60s)

Frontend build-time vars (Cloudflare Pages env for each project):

- ☐ web `VITE_API_URL` → the deployed worker origin
- ☐ admin `VITE_API_URL` → the deployed worker origin
- ☐ Cookie scope: the API host and each SPA host share an eTLD+1 (else the
  auth cookies won't ride along — the admin api client warns about this)

### Cookie & cross-origin gotchas

When the admin SPA and worker are on **different domains** (e.g. `pages.dev`
vs `workers.dev`), the following must hold:

- ☐ Auth cookies use `SameSite=None` (already in `cookies.ts`). `SameSite=Lax`
  silently blocks cookies on cross-origin XHR even with `withCredentials: true`.
- ☐ CSRF defence relies on CORS origin validation (`ALLOWED_ORIGINS`), not
  `SameSite`.
- ☐ If you use a custom domain where admin and worker share an eTLD+1 (e.g.
  `admin.example.com` + `api.example.com`), you can optionally revert to
  `SameSite=Lax` for tighter browser-level CSRF protection.

### PBKDF2 iteration limit

- ☐ The Workers runtime **hard-caps** PBKDF2 at 100,000 iterations. The
  `passwordHash.ts` `derive()` function clamps to this value. Do NOT increase
  `ITERATIONS` above 100,000 or login will 500 with:
  `Pbkdf2 failed: iteration counts above 100000 are not supported`.
- ☐ If you previously deployed with a higher iteration count, stale user
  records in KV will fail verification. Delete them and re-bootstrap (see
  `SETUP.md` Step 11, Gotcha 2).

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

### Notification & email pipeline (common failure mode)

If checkout succeeds but the admin gets no notification and no email:

1. ☐ **`STRIPE_WEBHOOK_SECRET` is set** — `wrangler secret list` must include
   it. Without it, the worker returns 500 on every webhook and events are
   silently dropped.
2. ☐ **Stripe webhook endpoint registered** — dashboard.stripe.com →
   Developers → Webhooks → endpoint must point to
   `https://<worker-domain>/stripe/webhook` and be subscribed to
   `checkout.session.completed`.
3. ☐ **Admin email configured** — Settings → Site Content → email field must
   be set (emails are skipped if empty; SSE notifications still work).
4. ☐ **Formspark or CF Email** — if `formsparkFormId` is set, Formspark
   delivers the email; otherwise Cloudflare Email Service is used and the
   `from` domain must be onboarded.
5. ☐ **SSE connection active** — admin panel must be open and logged in for
   real-time notifications. The `bea_at` cookie must be present (check
   cross-origin `SameSite=None` if admin and worker are on different domains).

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
- No client-side CSRF token — `SameSite=None` cookies + server CORS origin
  allow-list are the defense, which is sufficient for this app.
- Single `NotificationHub` Durable Object and full-catalogue Stripe walks — only
  a concern at higher volume.
- `transformStripeProduct` is duplicated (and diverged) between web and admin.
- ~6 intentional `console.*` error-path logs remain in web.

These are documented, not blocking.
