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
API_SECRET_KEY=your-api-password-change-me
```

> `ALLOWED_ORIGINS=*` in `.env` allows all origins in local dev. If you want
> to restrict it, put specific origins in `.dev.vars` (it overrides `.env`).

The `API_SECRET_KEY` is a password you choose. It protects your admin API
endpoints from unauthorized access. Change `change-me` to something real.

**`admin/.env`** (admin panel — all values are **build-time environment
variables**, set before you run or build):

```env
VITE_API_URL=http://localhost:8787
VITE_STRIPE_PUBLISHABLE_KEY=pk_test_your_publishable_key_here
VITE_API_SECRET_KEY=your-api-password-change-me
```

> **Important**: All `VITE_*` values are baked into the JavaScript bundle at
> build time. Anyone with browser dev tools can see them. This is normal for
> Stripe publishable keys. For the API secret key, this is acceptable in
> development; in production, use Cloudflare Access (Step 10) to protect the
> admin panel itself.

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
you need to forward Stripe's webhooks to your local server.

1. **Install the Stripe CLI** (one-time):

   ```bash
   npm install -g @stripe/cli
   ```

2. **Start forwarding** (run this in a separate terminal and leave it running):

   ```bash
   stripe listen --forward-to localhost:8787/stripe/webhook
   ```

   The first time, it will ask you to log in — paste your Stripe secret key
   when prompted.

3. **Copy the signing secret** — the CLI prints something like:

   ```
   Your webhook signing secret is whsec_abc123... (^C to quit)
   ```

   Copy this `whsec_...` value and paste it as `STRIPE_WEBHOOK_SECRET` in
   `services/.dev.vars`.

4. **Restart the dev server** so it picks up the new secret. Press `Ctrl+C`
   where `npm run dev` is running, then run `npm run dev` again.

5. **Test it** by triggering a test event:

   ```bash
   stripe trigger checkout.session.completed
   ```

   You should see `POST /stripe/webhook 200 OK` in the backend logs.

### 5.2 — Configure your admin content

Open the admin panel at `http://localhost:5174`. The first time, go to:

**Settings → Admin Config** — this page shows you the current configuration.
These values come from your `admin/.env` file and can only be changed there:

- **API URL** — `http://localhost:8787` (read-only, from `VITE_API_URL`)
- **API Secret Key** — shows whether one is configured (from `VITE_API_SECRET_KEY`)
- **Stripe Publishable Key** — set this in `admin/.env` and restart the dev server

To configure your site content, go to **Settings → Site Content**:

1. Fill in your business name, tagline, hero text, and email address
2. Add your process steps, testimonials, and product categories
3. Click **Save** — everything is stored in the backend KV and served to your
   storefront immediately

> There is no "login" for the local admin panel — it's unprotected. In
> production, you'll add Cloudflare Access (Step 10) to require a real login.

---

## Step 6 — Set up GitHub Actions (automatic deployment)

The project includes a GitHub Actions workflow that automatically deploys
everything whenever you push changes to your `main` or `release` branch.

### 6.1 — Add secrets to GitHub

Go to your forked repository on GitHub. Click **Settings → Secrets and
variables → Actions**. Add the following **secrets** (click "New repository
secret" for each):

| Secret name                   | Value                                                                                                    |
| ----------------------------- | -------------------------------------------------------------------------------------------------------- |
| `CF_API_TOKEN`                | The Cloudflare API token from Step 3.1                                                                   |
| `STRIPE_SECRET_KEY`           | Your Stripe secret key (`sk_live_...` for production)                                                    |
| `STRIPE_WEBHOOK_SECRET`       | Your Stripe webhook signing secret (`whsec_...`)                                                         |
| `ALLOWED_ORIGINS`             | Your live site URLs, comma-separated (e.g., `https://beeepicapiary.com,https://admin.beeepicapiary.com`) |
| `API_SECRET_KEY`              | The API password you chose in Step 4.1                                                                   |
| `VITE_STRIPE_PUBLISHABLE_KEY` | Your Stripe publishable key (`pk_live_...` for production)                                               |
| `VITE_API_SECRET_KEY`         | Same API password as `API_SECRET_KEY` (used by the admin panel build)                                    |

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

## Step 10 — Protect the admin panel with Cloudflare Access

> **This is strongly recommended for production.** Without it, anyone who knows
> your admin URL can access the admin panel.

[Cloudflare Access](https://www.cloudflare.com/zero-trust/access/) creates a
login page that sits in front of your admin panel. Users must sign in before
they can reach it.

1. In Cloudflare dashboard, go to **Zero Trust** (left sidebar)
2. If prompted, set up a team name (e.g., `bee-epic-apiary`) and choose a plan
   (the free plan supports up to 50 users)
3. Go to **Access → Applications**
4. Click **Add an application** → **Self-hosted**
5. **Application name**: `Admin Panel`
6. **Session duration**: `24h`
7. **Domain**: `admin.yourdomain.com` (your actual admin domain from Step 7.2)
8. Click **Next**
9. Under **Configure rules**, set up a policy:
   - **Policy name**: `Allow admins`
   - **Action**: `Allow`
   - Add a rule like **Emails ending with**: `@yourcompany.com`
   - Or **Everyone** if you just want a basic email + one-time-passcode login
10. Click **Next** → **Add application**

Now when you visit `admin.yourdomain.com`, Cloudflare will show a login page.
Only authenticated users will reach the admin panel.

> Cloudflare Access works at the edge — the request never reaches your app
> if the user isn't logged in. The backend API (`api.yourdomain.com`) is still
> protected by the `API_SECRET_KEY` and does not go through Access.

---

## Step 11 — What you see now

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

**The contact form doesn't send emails**

- If using Cloudflare Email Service: the domain must be onboarded (Step 3.3).
- If using Formspark: double-check the Formspark Form ID in Admin Config.
- Check that the admin email in Site Content matches a domain you control.

**Admin panel shows 401 errors on orders/products**

- The API secret key in `admin/.env` (`VITE_API_SECRET_KEY`) must match
  the `API_SECRET_KEY` on the backend Worker.
- In production, ensure both GitHub secrets (`VITE_API_SECRET_KEY` and
  `API_SECRET_KEY`) have the same value.

**Webhook returns 401 Unauthorized**

- The `STRIPE_WEBHOOK_SECRET` in the Worker must match the signing secret
  from your Stripe webhook endpoint.
- For local development, use the secret printed by `stripe listen`.
- For production, use the secret from the Stripe dashboard (Step 8).

**Deployment fails on GitHub Actions**

- Click into the failed step — it usually says exactly what's wrong.
- Most common cause: a missing or incorrect secret. Double-check Step 6.1.
