# Setup Guide — Bee Epic Apiary

This guide walks you through everything needed to get your online store up and
running. You don't need to be a developer — if you can follow a checklist and
copy-paste values between browser tabs, you can do this.

---

## Quick-Start Checklist

Before you begin, make sure you have access to these accounts:

| #   | Account / Service             | What it's for                                               | Cost                 |
| --- | ----------------------------- | ----------------------------------------------------------- | -------------------- |
| 1   | **GitHub** (free)             | Stores your project code and triggers automatic deployments | Free                 |
| 2   | **Cloudflare** (free)         | Hosts your website, runs the backend, handles email         | Free tier works      |
| 3   | **Stripe** (free)             | Processes customer payments                                 | Per-transaction fees |
| 4   | **A domain name** (optional)  | Custom web address like `beeepicapiary.com`                 | ~$10–15/year         |
| 5   | **An email account / domain** | For receiving contact form messages and order notifications | Free with Cloudflare |

> You probably already have a GitHub account. If not, sign up at
> github.com. For Cloudflare, go to cloudflare.com. For Stripe,
> go to stripe.com. Each takes about 5 minutes.

---

## Step 1 — Get your Stripe keys

Stripe handles all payment processing. You need three things from Stripe:

- A **publishable key** (for the website)
- A **secret key** (for the backend)
- A **webhook signing secret** (so the backend can verify events from Stripe)

Stripe gives you test keys to start with — your store won't charge real money
until you switch to live keys.

### 1.1 — API keys

1. Log in to [dashboard.stripe.com](https://dashboard.stripe.com)
2. If prompted, activate your account (no real-money charges yet)
3. In the left menu, go to **Developers → API keys**
4. You'll see:
   - **Publishable key** — starts with `pk_test_` — copy this
   - **Secret key** — starts with `sk_test_` — copy this (click "Reveal")
5. Keep both keys handy. You'll paste them in Step 4.

### 1.2 — Webhook signing secret

1. In Stripe, go to **Developers → Webhooks**
2. Click **Add endpoint**
3. **Endpoint URL**: For now, put `https://api.yourdomain.com/stripe/webhook`
   (replace with your actual worker URL from Step 7)
4. **Events to send**: Select `checkout.session.completed`
5. Click **Add endpoint**
6. Under **Signing secret**, click **Reveal** — copy the `whsec_...` value

> For local development, you'll use the Stripe CLI instead of this endpoint URL.
> You still need the signing secret from Stripe's dashboard for your live
> endpoint. The CLI generates its own signing secret automatically.

> When you're ready to accept real money, flip the "Viewing test data" toggle
> in Stripe to **Live**, generate live keys, and repeat these steps with the
> live values.

---

## Step 2 — Fork the project on GitHub

1. Go to the project's GitHub repository page (you'll get the URL from your
   developer)
2. Click the **Fork** button in the top-right corner
3. This creates your own copy of the code under your GitHub account

> A "fork" is just your personal copy. Any changes you make stay in your copy.

---

## Step 3 — Set up Cloudflare

Cloudflare runs two things for you:

- **The backend API** (a "Worker") — handles payments, contact form, products
- **The websites** ("Pages") — your storefront + admin panel

### 3.1 — Get a Cloudflare API token

The GitHub workflow needs a token so it can deploy your sites automatically.

1. Log in to [dash.cloudflare.com](https://dash.cloudflare.com)
2. Go to **My Profile** (top-right) → **API Tokens**
3. Click **Create Token**
4. Find the **Edit Cloudflare Workers** template and click **Use template**
5. Under **Permissions**, make sure it includes:
   - `Account — Workers Scripts — Edit`
   - `Account — Workers Routes — Edit`
   - `Account — Pages — Edit`
   - `Account — KV — Edit`
6. Under **Account Resources**, pick your account
7. Click **Continue to Summary** → **Create Token**
8. **Copy the token now** — you won't see it again

### 3.2 — Create a KV namespace (for content storage)

The backend uses Cloudflare's "KV" storage (like a filing cabinet in the cloud)
to store site content (business name, email, process steps, testimonials).

1. In the Cloudflare dashboard, go to **Workers & Pages** → **KV**
2. Click **Create namespace**, name it `CONTENT_KV`, click **Add**

Write down the **Namespace ID** (a long string of characters — looks like
`a1b2c3d4...`). You'll need it later.

> There is no separate KV namespace for rate limiting — that now runs on a
> Durable Object, which is created automatically when you deploy.

### 3.3 — Onboard your email domain (if using Cloudflare Email)

If you plan to use Cloudflare's email service for contact form and order
notification emails:

1. In the Cloudflare dashboard, go to **Email** → **Email Routing** → **Domains**
2. Add your domain and follow the setup instructions
3. Enable the email sending feature:

   ```bash
   npx wrangler email sending enable yourdomain.com
   ```

> For local development, emails are simulated (not actually sent). Real emails
> only fire when the Worker is deployed to Cloudflare.

---

## Step 4 — Configure the project for local development

### 4.1 — Environment files

You need two types of files for local development:

- **`.env`** — non-secret configuration values (committed to git)
- **`.dev.vars`** — secrets like API keys (never committed to git)

**`services/.env`** (backend non-secrets):

```env
ALLOWED_ORIGINS=*
```

**`services/.dev.vars`** (backend secrets — **never commit this**):

```env
STRIPE_SECRET_KEY=sk_test_your_secret_key_here
STRIPE_WEBHOOK_SECRET=whsec_your_webhook_secret_here

# JWT signing key — required. Generate with: openssl rand -base64 32
JWT_SIGNING_SECRET=your-jwt-signing-secret-here

# Bearer fallback used by CI / scripts (also accepted at runtime as OWNER role)
API_SECRET_KEY=your-api-password-change-me

# Bootstrap owner list — never-lockout safety net.
OWNER_EMAILS=owner@example.com

# Dev-only identity gate — gate is ONLY active when ENVIRONMENT=development.
# Leave blank for production; the login page handles auth there.
ENVIRONMENT=development
```

> `ALLOWED_ORIGINS=*` in `.env` allows all origins in local dev. If you want
> to restrict it, put specific origins in `.dev.vars` (it overrides `.env`).

**Auth model (Phase 9).** The admin panel uses a cookie-based login page — no
credentials are baked into the bundle. Identity is resolved in this order on
every request:

1. **Cookie session** — `bea_at` HttpOnly JWT signed with `JWT_SIGNING_SECRET`
   (1-hour TTL, `SameSite=None` for cross-origin, `Secure` in production).
   Set after a successful login.
2. **CI / scripts** — `Authorization: Bearer <API_SECRET_KEY>` is accepted and
   maps to `OWNER` role (`ci@service`).
3. **Local dev only** — `X-Dev-Email` header honored only when
   `ENVIRONMENT=development`. The SPA no longer sends this header; it is a
   server-side escape hatch for scripts and automated tests.

> **Cross-origin cookies**: When the admin SPA and worker run on different
> domains (e.g. `pages.dev` vs `workers.dev`), the cookies must use
> `SameSite=None` so the browser sends them on cross-origin XHR/fetch.
> `SameSite=Lax` silently blocks cookies on cross-origin requests even with
> `withCredentials: true`. CSRF defence is handled by CORS origin validation.

Roles are `OWNER > MANAGER > EMPLOYEE > VENDOR`. Manage users (and their roles)
from **Settings → Users** in the admin panel — visible only when the signed-in
user is an OWNER. Password policy is managed from **Settings → Security** (OWNER
only).

**`admin/.env`** (admin panel — all values are **build-time environment
variables**, set before you run or build):

```env
VITE_API_URL=http://localhost:8787
VITE_STRIPE_PUBLISHABLE_KEY=pk_test_your_publishable_key_here
```

> **Important**: All `VITE_*` values are baked into the JavaScript bundle at
> build time. Anyone with browser dev tools can see them. This is normal for
> Stripe publishable keys. No secret is baked into the admin bundle — production
> auth is handled by the cookie login page (Step 10), not by a baked-in
> credential.

**`web/.env`** (storefront):

```env
VITE_STRIPE_PUBLISHABLE_KEY=pk_test_your_publishable_key_here
VITE_API_URL=http://localhost:8787
VITE_SITE_URL=http://localhost:5173
```

### 4.2 — Update KV namespace ID in `services/wrangler.jsonc`

Open `services/wrangler.jsonc` and find the `kv_namespaces` section.
Replace the placeholder with the actual namespace ID you copied in Step 3.2:

```jsonc
"kv_namespaces": [
    {
        "binding": "CONTENT_KV",
        "id": "your_actual_content_kv_id_here",
        "preview_id": "your_actual_content_kv_id_here"
    }
],
```

Repeat for the `development` environment section at the bottom of the file.

---

## Step 5 — Install and test locally

These commands install everything and start the project on your computer so you
can see it working before going live.

```bash
# 1. Install all dependencies (or just `npm install` from root)
npm install

# 2. Start the backend API, admin panel, and storefront all at once
npm run dev
```

This starts three servers:

- **Storefront** — open `http://localhost:5173` in your browser
- **Admin panel** — open `http://localhost:5174`
- **Backend API** — runs on `http://localhost:8787` (you don't need to visit this)

### 5.1 — Set up Stripe webhook forwarding (local development)

For the backend to receive Stripe events locally (like completed checkouts),
Stripe's webhooks must be forwarded to your local server. The dev server does
this for you — `npm run dev` starts the worker **and** the forwarder together —
but you still need a one-time login and to match the signing secret.

1. **Log in to the Stripe CLI** (one-time — opens a browser to authorize):

   ```bash
   npx -y @stripe/cli login
   ```

2. **Get the signing secret.** Start the dev server (`npm run dev` from the
   repo root, or `npm run dev` in `services/`). The forwarder prints:

   ```
   Your webhook signing secret is whsec_abc123... (^C to quit)
   ```

   Copy this `whsec_...` value and paste it as `STRIPE_WEBHOOK_SECRET` in
   `services/.dev.vars`.

   > You no longer run `stripe listen` in a separate terminal — the dev server
   > runs it for you. To start the worker without the forwarder, use
   > `npm run dev:main` in `services/`.

3. **Restart the dev server** so it picks up the new secret. Press `Ctrl+C`
   where `npm run dev` is running, then run `npm run dev` again.

4. **Test it** by triggering a test event:

   ```bash
   npx -y @stripe/cli trigger checkout.session.completed
   ```

   You should see `POST /stripe/webhook 200 OK` in the backend logs.

### 5.2 — Configure your admin content

Open the admin panel at `http://localhost:5174`. The first time, go to:

**Settings → Admin Config** — this page shows you the current configuration.
These values come from your `admin/.env` file and can only be changed there:

- **API URL** — `http://localhost:8787` (read-only, from `VITE_API_URL`)
- **Auth status** — shows your resolved identity (email + role) and
  which path authenticated you (`cookie` / `bearer` / `dev`). In local dev
  this is populated after you log in through the login page (or via
  `X-Dev-Email` if running the server with `ENVIRONMENT=development` and
  a script header).
- **Stripe Publishable Key** — set this in `admin/.env` and restart the dev server

To configure your site content, go to **Settings → Site Content**:

1. Fill in your business name, tagline, hero text, and email address
2. Add your process steps, testimonials, and product categories
3. Click **Save** — everything is stored in the backend KV and served to your
   storefront immediately

If you signed in as an OWNER, you'll also see **Settings → Users** — use it to
add team members and assign them `OWNER`, `MANAGER`, `EMPLOYEE`, or `VENDOR`
roles. Roles control which endpoints they can call (orders → EMPLOYEE, products
→ MANAGER, users list → OWNER).

> In local dev the admin uses the standard login page like production. Sign in
> with an email in `OWNER_EMAILS` after completing the bootstrap flow (Step 10).

---

## Step 6 — Set up GitHub Actions (automatic deployment)

The project includes a GitHub Actions workflow that automatically deploys
everything whenever you push changes to your `main` or `release` branch.

### 6.1 — Add secrets to GitHub

Go to your forked repository on GitHub. Click **Settings → Secrets and
variables → Actions**. Add the following **secrets** (click "New repository
secret" for each):

| Secret name                   | Value                                                                                                                       |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `CF_API_TOKEN`                | The Cloudflare API token from Step 3.1                                                                                      |
| `STRIPE_SECRET_KEY`           | Your Stripe secret key (`sk_live_...` for production)                                                                       |
| `STRIPE_WEBHOOK_SECRET`       | Your Stripe webhook signing secret (`whsec_...`)                                                                            |
| `ALLOWED_ORIGINS`             | Your live site URLs, comma-separated (e.g., `https://beeepicapiary.com,https://admin.beeepicapiary.com`)                    |
| `JWT_SIGNING_SECRET`          | HS256 signing key for session cookies — **required**. Generate: `openssl rand -base64 32`.                                  |
| `API_SECRET_KEY`              | A long random string. Used as the bearer fallback for CI / scripts (maps to OWNER role). Never shipped to the admin bundle. |
| `OWNER_EMAILS`                | Comma-separated bootstrap owner emails. These addresses always get OWNER role even before the user list is populated.       |
| `VITE_STRIPE_PUBLISHABLE_KEY` | Your Stripe publishable key (`pk_live_...` for production)                                                                  |

> Note: `VITE_API_SECRET_KEY` is **no longer needed** — remove it if it exists as a GitHub secret. The admin bundle contains no credentials.

Then add these **variables** (click the "Variables" tab, then "New repository
variable"):

| Variable name   | Value                                                                                          |
| --------------- | ---------------------------------------------------------------------------------------------- |
| `VITE_API_URL`  | Your Worker URL (see Step 7 — e.g., `https://bee-epic-apiary.your-subdomain.workers.dev`)      |
| `VITE_SITE_URL` | Your storefront URL (e.g., `https://bee-epic-apiary.pages.dev` or `https://beeepicapiary.com`) |

### 6.2 — Push to trigger deployment

Once secrets are set, push your code to the `main` branch on GitHub:

```bash
git push origin main
```

Go to your repository on GitHub, click the **Actions** tab, and you'll see the
deployment workflow running. It runs tests first, then deploys all three
projects to Cloudflare.

> If anything fails, click into the failing step to see what went wrong.
> Most failures are missing secrets or wrong key values.

---

## Step 7 — Set up a custom domain (optional but recommended)

### 7.1 — Add your domain to Cloudflare

1. In the Cloudflare dashboard, go to **Websites** → **Add a Site**
2. Enter your domain name and follow the steps
3. Cloudflare will give you two nameservers (e.g., `nancy.ns.cloudflare.com`)
4. Go to your domain registrar (where you bought the domain) and update the
   nameservers to the ones Cloudflare gave you
5. Wait a few minutes (up to 24 hours) for the change to spread

### 7.2 — Connect custom domains to your sites

**Storefront** (`bee-epic-apiary` Pages project):

1. In Cloudflare, go to **Workers & Pages** → **bee-epic-apiary**
2. Click **Custom domains** → **Set up a custom domain**
3. Enter `beeepicapiary.com` (or whatever your domain is)
4. Cloudflare handles the SSL certificate automatically

**Admin panel** (`bee-epic-apiary-admin` Pages project):

1. Go to **Workers & Pages** → **bee-epic-apiary-admin**
2. Click **Custom domains** → **Set up a custom domain**
3. Enter `admin.beeepicapiary.com`

**Backend Worker**:

1. Go to **Workers & Pages** → **bee-epic-apiary**
2. Click **Triggers** → **Custom domains** → **Add custom domain**
3. Enter `api.beeepicapiary.com`

Update the `ALLOWED_ORIGINS` and `VITE_API_URL` secrets/variables on GitHub
(Step 6.1) to include these actual URLs, then re-deploy.

---

## Step 8 — Configure Stripe webhook for production

After deployment, you need to point Stripe's webhook at your live Worker URL.

1. Go to [dashboard.stripe.com](https://dashboard.stripe.com) → **Developers → Webhooks**
2. Click **Add endpoint** (or edit the one you created in Step 1.2)
3. **Endpoint URL**: `https://api.yourdomain.com/stripe/webhook`
   (replace with your actual worker domain from Step 7.2)
4. **Events to send**: Select `checkout.session.completed`
5. Click **Add endpoint**
6. Copy the **Signing secret** (`whsec_...`) and add it as a GitHub secret:
   - Go to your GitHub repo → **Settings → Secrets and variables → Actions**
   - Add `STRIPE_WEBHOOK_SECRET` with the `whsec_...` value
   - Push any change (or re-run the workflow) to deploy it

> The Worker verifies every webhook using this signing secret. If it's missing
> or wrong, Stripe events will be rejected with a 401 error.

---

## Step 9 — Configure email notifications

The contact form and order notifications send email through Cloudflare.
You have two options:

### Option A: Cloudflare Email Service (recommended)

1. Make sure your domain is onboarded (Step 3.3)
2. In the admin panel, go to **Settings → Admin Config**
3. Leave the **Formspark Form ID** field empty
4. Set the **Email format** (HTML or plain text)
5. In **Settings → Site Content**, set the admin email address
   (e.g., `contact@yourdomain.com`)
6. The system uses `contact@<your-domain>` as the from address for contact
   form submissions and `noreply@<your-domain>` for order notifications

### Option B: Formspark (third-party form service)

1. Go to [formspark.io](https://formspark.io) and create an account
2. Create a new form and copy its Form ID
3. In the admin panel → **Settings → Admin Config**, paste the Form ID
   in the **Formspark Form ID** field
4. Save — all emails will now route through Formspark instead

---

## Step 10 — Auth secrets & first-time bootstrap

> **Required for production.** The admin panel uses a cookie-based login page.
> You need to set the JWT signing secret before deploying, then complete the
> bootstrap flow to create your first OWNER account.
>
> **Note on legacy Zero Trust gating**: The admin panel no longer uses an
> external identity proxy for authentication. If you previously had an Access
> application in front of the admin Pages site, **disable it** — leaving it in
> place creates a double-gating problem (users would have to pass the external
> gate and then the login page).

### 10.1 — Set the required Wrangler secrets

The admin cookie session is signed with `JWT_SIGNING_SECRET`. Generate a
strong random value and set it as a Wrangler secret:

```bash
# Generate a strong key (copy the output):
openssl rand -base64 32

# Set it in your Worker:
npx wrangler secret put JWT_SIGNING_SECRET
# Paste the generated value when prompted.
```

The two other optional secrets should also be set if you need them:

```bash
# CI / script bearer bypass — maps to OWNER role when present:
npx wrangler secret put API_SECRET_KEY

# Bootstrap owner allowlist — comma-separated emails:
npx wrangler secret put OWNER_EMAILS
# Example value: owner@example.com,backup@example.com
```

For **local development**, add these to `services/.dev.vars` (not committed):

```env
JWT_SIGNING_SECRET=any-local-dev-value-here
OWNER_EMAILS=owner@example.com
ENVIRONMENT=development
```

`ENVIRONMENT=development` enables the server-side `X-Dev-Email` header bypass
for scripts and automated tests. The SPA does **not** send this header — local
dev uses the login page just like production.

### 10.2 — Bootstrap your first owner account

On the **first deploy** (before any user accounts exist), the backend signals
that setup is needed:

1. Visit `admin.yourdomain.com` — the SPA calls `GET /whoami`.
2. The response includes `"bootstrapAvailable": true` — the SPA automatically
   redirects to `/bootstrap`.
3. On the Bootstrap page, type the email address you want as the first OWNER.
   - This email must be in `OWNER_EMAILS` (the bootstrap allowlist).
4. The server sends an **invite email** to that address.
5. Open the invite email and click the link → you land on the
   **Accept Invite** page.
6. Set your password (must meet the password policy) and submit.
7. You are now signed in. `/whoami` returns `"bootstrapAvailable": false`
   from this point on — the bootstrap page is permanently disabled.

### 10.3 — Add more users

Once you're signed in as OWNER:

1. Go to **Settings → Users** (visible only to OWNER).
2. Click **Invite user**, enter their email and choose a role
   (`OWNER`, `MANAGER`, `EMPLOYEE`, or `VENDOR`).
3. They receive an invite email, set their password, and can log in.

> The `OWNER_EMAILS` allowlist is a "never-lockout" safety net — anyone in
> that list can always log in (bypassing the user KV) and recover access even
> if the user list is accidentally emptied.

---

## Step 11 — Production Gotchas (read this before deploying)

These are real issues encountered during deployment. If you're setting up from
scratch, read through this section to avoid hours of debugging.

### Gotcha 1: `ADMIN_BASE_URL` must be set in `wrangler.jsonc`

The worker needs `ADMIN_BASE_URL` to generate correct invite email links and
order notification links. If this is empty (the default), invite emails contain
broken relative URLs like `/accept-invite?token=...` with no domain.

In `services/wrangler.jsonc`, under the top-level `vars`, make sure it is set:

```jsonc
"vars": {
    "RATE_LIMIT_MAX": "100",
    "RATE_LIMIT_WINDOW": "60",
    "ADMIN_BASE_URL": "https://your-admin-domain.pages.dev",
    "ENVIRONMENT": "production",
}
```

For the `development` environment at the bottom of the same file:

```jsonc
"development": {
    "vars": {
        "ADMIN_BASE_URL": "http://localhost:5174",
        "ENVIRONMENT": "development",
    }
}
```

After changing `wrangler.jsonc`, redeploy with `npx wrangler deploy`.

### Gotcha 2: PBKDF2 iterations capped at 100,000

The Cloudflare Workers runtime **hard-caps** PBKDF2 at 100,000 iterations.
If the code has a higher value (e.g. 600,000), login will return 500 with this
error in the worker logs:

```
Pbkdf2 failed: iteration counts above 100000 are not supported (requested 600000)
```

The fix is already applied in `services/src/auth/crypto/passwordHash.ts`:
the `derive()` function clamps iterations to `WORKERS_MAX_ITERATIONS = 100_000`.
If you change the iteration count, never exceed 100,000 for production deploys.

If you previously deployed with a higher iteration count (e.g. 600k), existing
user records in KV will have been hashed at that higher count. The clamping in
`derive()` gracefully handles this at verify time (it re-hashes at 100k), but
the old record will still fail verification because the stored digest was
computed with more iterations. **You must delete the stale user record from KV**
and re-run the bootstrap flow:

```bash
# List KV keys to find the user record
npx wrangler kv key list --binding CONTENT_KV

# Delete the stale user (replace <email> with the actual email)
npx wrangler kv key delete --binding CONTENT_KV "user:<email>"

# Also delete the user index if present
npx wrangler kv key delete --binding CONTENT_KV "user_index:<email>"
```

Then re-do the bootstrap flow from Step 10.2.

### Gotcha 3: Cross-origin cookies require `SameSite=None`

When the admin SPA (e.g. `bee-epic-apiary-admin.pages.dev`) and the worker
(e.g. `bee-epic-apiary.your-subdomain.workers.dev`) are on **different
domains**, the browser treats them as different sites. Cookies set by the
worker with `SameSite=Lax` will **not** be sent on cross-origin XHR/fetch
requests — even with `withCredentials: true`. This causes login to return 200
(set-cookie succeeds), but every subsequent API call returns 401 (no cookie
sent).

**Symptoms:**

- Login returns 200, the app briefly shows the dashboard, then redirects back
  to `/login`
- API calls to orders, products, etc. all return 401

**Fix:** Cookies must use `SameSite=None` (already applied in
`services/src/auth/cookies.ts`). CSRF defence is handled by CORS origin
validation (`ALLOWED_ORIGINS`), not by SameSite.

If you need to change this back for a same-site setup (custom domain where
admin and worker share an eTLD+1), change `SameSite=None` to `SameSite=Lax`
in `cookies.ts`.

### Gotcha 4: Stale invite tokens in KV

If you run the bootstrap flow, receive an invite email, but don't complete it,
the invite token remains in KV. If you later delete the user record and
re-bootstrap, the old token may still be in KV and could cause confusion.

Clean up stale tokens:

```bash
npx wrangler kv key list --binding CONTENT_KV | grep invite
npx wrangler kv key delete --binding CONTENT_KV "invite:<token-value>"
```

### Gotcha 5: Rate limit lockout during testing

If you attempt login multiple times with wrong credentials, the rate limiter
(100 requests per 60 seconds per IP) may lock you out. During testing you can
temporarily increase `RATE_LIMIT_MAX` in `wrangler.jsonc`:

```jsonc
"RATE_LIMIT_MAX": "10000",
```

Remember to set it back to `100` (or your preferred limit) before production
deploy. Redeploy after changing this value.

---

## Step 12 — What you see now

After deployment, you have three live sites:

| Site            | URL                       | What it's for                             |
| --------------- | ------------------------- | ----------------------------------------- |
| **Storefront**  | `beeepicapiary.com`       | Your customers browse products and buy    |
| **Admin panel** | `admin.beeepicapiary.com` | You manage products, orders, and settings |
| **Backend API** | `api.beeepicapiary.com`   | (Behind the scenes — handles payments)    |

### Adding your first product

1. Go to your admin panel at `admin.beeepicapiary.com`
2. Click **Products** in the sidebar, then **Add Product**
3. Fill in the name, price, description, and image URL
4. Click **Save** — the product appears on your storefront immediately

### Updating site content

1. Go to **Settings → Site Content** in the admin panel
2. Change your business name, hero heading, about section text, etc.
3. Click **Save** — your storefront updates instantly

### How the admin dashboard notifications work

When a customer places an order, the backend sends a real-time notification
to the admin panel via Server-Sent Events (SSE). You'll see a popup in the
top-right corner of the admin panel within seconds. No browser refresh needed.

This works automatically on Cloudflare — no additional configuration required.

---

## Troubleshooting

**The storefront looks blank / shows errors**

- Make sure `VITE_API_URL` is set correctly. If the backend Worker isn't
  deployed yet, the storefront can't fetch products.
- Check the browser's developer console (F12 → Console) for error messages.
- Verify the backend Worker is running and reachable from your browser.

**The admin panel won't save settings**

- Settings are saved to the backend Worker's KV store via the API.
- Make sure the backend Worker is running and `VITE_API_URL` is correct.
- Check the browser console for CORS or network errors.

**Payments fail with "no such price" or similar**

- Your Stripe keys might be mismatched (test vs live). Make sure the
  publishable key and secret key are both from the same mode (both test or
  both live).

**Login returns 500 Internal Server Error**

- Check the worker logs. If you see `Pbkdf2 failed: iteration counts above
100000 are not supported`, the code has an iteration count above the
  Workers runtime limit. See Step 11, Gotcha 2. The fix is to clamp the
  iteration count to 100,000 and delete stale user records from KV.

**Invite emails have broken links (relative URLs)**

- The `ADMIN_BASE_URL` env var in `wrangler.jsonc` is empty or missing.
  See Step 11, Gotcha 1. Set it to your admin domain and redeploy.

**The contact form doesn't send emails**

- If using Cloudflare Email Service: the domain must be onboarded (Step 3.3).
- If using Formspark: double-check the Formspark Form ID in Admin Config.
- Check that the admin email in Site Content matches a domain you control.

**Admin panel shows 401 / 403 errors on orders/products**

- 401 means the worker couldn't resolve any caller identity. In local dev,
  make sure you've completed the bootstrap flow and are signed in through the
  login page. If the session cookie has expired, log in again. For CI/scripts,
  check that `Authorization: Bearer <API_SECRET_KEY>` is set correctly.
- 403 means you signed in successfully, but your role is too low. The error
  body carries `requiredRole`: e.g., `{ "code": "FORBIDDEN", "requiredRole": "MANAGER" }`.
  Have an OWNER bump your role in **Settings → Users**.
- For CI / scripts, set `Authorization: Bearer <API_SECRET_KEY>` — that path
  still works and maps to OWNER.
- **Cross-origin 401 loop**: If login returns 200 but you are immediately
  redirected back to `/login` and all API calls return 401, this is a
  cross-origin cookie issue. The worker must set `SameSite=None` on auth
  cookies when the admin SPA and worker are on different domains. See
  Step 11, Gotcha 3.

**Webhook returns 401 Unauthorized**

- The `STRIPE_WEBHOOK_SECRET` in the Worker must match the signing secret
  from your Stripe webhook endpoint.
- For local development, use the secret printed by `stripe listen`.
- For production, use the secret from the Stripe dashboard (Step 8).

**Deployment fails on GitHub Actions**

- Click into the failed step — it usually says exactly what's wrong.
- Most common cause: a missing or incorrect secret. Double-check Step 6.1.
