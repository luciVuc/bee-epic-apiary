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

Stripe handles all payment processing. You need two keys: a "publishable" key
(for the website) and a "secret" key (for the backend). Stripe gives you test
keys to start with — your store won't charge real money until you switch to
live keys.

1. Log in to [dashboard.stripe.com](https://dashboard.stripe.com)
2. If prompted, activate your account (no real-money charges yet)
3. In the left menu, go to **Developers → API keys**
4. You'll see:
   - **Publishable key** — starts with `pk_test_` — copy this
   - **Secret key** — starts with `sk_test_` — copy this (click "Reveal")
5. Keep both keys handy. You'll paste them in Step 4.

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

### 3.2 — Create KV namespaces (for data storage)

The backend uses Cloudflare's "KV" storage (like a filing cabinet in the cloud).
You need to create two of these:

1. In the Cloudflare dashboard, go to **Workers & Pages** → **KV**
2. Click **Create namespace**, name it `CONTENT_KV`, click **Add**
3. Click **Create namespace** again, name it `RATE_LIMIT_KV`, click **Add**

Write down the **Namespace ID** for each (a long string of characters —
looks like `a1b2c3d4...`). You'll need them later.

---

## Step 4 — Configure the project for your account

### 4.1 — Create `.dev.vars` (local secrets, never committed to git)

In the `services/` folder, create a file called `.dev.vars` with this content
(use your Stripe keys from Step 1):

```env
STRIPE_SECRET_KEY=sk_test_your_secret_key_here
ALLOWED_ORIGINS=http://localhost:5173,http://localhost:5174
API_SECRET_KEY=your-api-secret-key-change-me
```

The `API_SECRET_KEY` is a password you choose that protects your admin backend.
Change `change-me` to something real.

### 4.2 — Create `.env` files

You need three `.env` files for local development. They're listed in
`.gitignore` so your secrets stay private.

**`services/.env`**:

```env
STRIPE_SECRET_KEY=sk_test_your_secret_key_here
ALLOWED_ORIGINS=http://localhost:5173,http://localhost:5174
```

**`admin/.env`**:

```env
VITE_API_URL=http://localhost:8787
VITE_API_SECRET_KEY=your-api-secret-key-change-me
```

**`web/.env`**:

```env
VITE_STRIPE_PUBLISHABLE_KEY=pk_test_your_publishable_key_here
VITE_API_URL=http://localhost:8787
VITE_SITE_URL=http://localhost:5173
```

### 4.3 — Update KV namespace IDs in `services/wrangler.jsonc`

Open `services/wrangler.jsonc` and find the `kv_namespaces` section.
Replace `CONTENT_KV_ID` and `RATE_LIMIT_KV_ID` with the actual namespace IDs
you copied in Step 3.2:

```jsonc
"kv_namespaces": [
    {
        "binding": "CONTENT_KV",
        "id": "your_actual_content_kv_id_here",        // ← paste here
        "preview_id": "your_actual_content_kv_id_here"
    },
    {
        "binding": "RATE_LIMIT_KV",
        "id": "your_actual_rate_limit_kv_id_here",     // ← paste here
        "preview_id": "your_actual_rate_limit_kv_id_here"
    }
],
```

Repeat for the `development` environment section at the bottom of the file.

---

## Step 5 — Install and test locally

These commands install everything and start the project on your computer so you
can see it working before going live.

```bash
# 1. Install all dependencies
npm run services:install
npm run admin:install
npm run web:install

# 2. Start the backend API (services), admin panel, and storefront all at once
npm run dev
```

This starts three servers:

- **Storefront** — open `http://localhost:5173` in your browser
- **Admin panel** — open `http://localhost:5174`
- **Backend API** — runs on `http://localhost:8787` (you don't need to visit this)

Open the admin panel at `http://localhost:5174`. The first time, go to
**Settings → Admin Config** and enter:

- **API URL**: `http://localhost:8787`
- **API Secret Key**: the key you chose in Step 4.1
- **Stripe Publishable Key**: your `pk_test_...` key

Then save. You can now manage products, update site content, and browse the
storefront.

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
| `ALLOWED_ORIGINS`             | Your live site URLs, comma-separated (e.g., `https://beeepicapiary.com,https://admin.beeepicapiary.com`) |
| `API_SECRET_KEY`              | The API password you chose in Step 4.1                                                                   |
| `VITE_STRIPE_PUBLISHABLE_KEY` | Your Stripe publishable key                                                                              |
| `VITE_API_SECRET_KEY`         | Same API password (for admin deployment)                                                                 |

Then add these **variables** (click the "Variables" tab, then "New repository
variable"):

| Variable name   | Value                                                                                             |
| --------------- | ------------------------------------------------------------------------------------------------- |
| `VITE_API_URL`  | Your Worker URL (see Step 7 — e.g., `https://bee-epic-apiary.your-subdomain.workers.dev`)         |
| `VITE_SITE_URL` | Your storefront URL (e.g., `https://golden-hive-apiary.pages.dev` or `https://beeepicapiary.com`) |

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

**Storefront** (`golden-hive-apiary` Pages project):

1. In Cloudflare, go to **Workers & Pages** → **golden-hive-apiary**
2. Click **Custom domains** → **Set up a custom domain**
3. Enter `beeepicapiary.com` (or whatever your domain is)
4. Cloudflare handles the SSL certificate automatically

**Admin panel** (`bee-epic-apiary-admin` Pages project):

1. Go to **Workers & Pages** → **bee-epic-apiary-admin**
2. Click **Custom domains** → **Set up a custom domain**
3. Enter `admin.beeepicapiary.com`

**Backend Worker** (`bee-epic-apiary`):

1. Go to **Workers & Pages** → **bee-epic-apiary**
2. Click **Triggers** → **Custom domains** → **Add custom domain**
3. Enter `api.beeepicapiary.com`

Update the `ALLOWED_ORIGINS` secret on GitHub (Step 6.1) to include these
actual URLs, then re-deploy.

---

## Step 8 — Set up email

The contact form and order notifications send email through Cloudflare.

1. In the Cloudflare dashboard, go to **Email** → **Email Routing** → **Domains**
2. Add your domain and follow setup instructions
3. Enable the email sending feature:
   ```
   npx wrangler email sending enable yourdomain.com
   ```
4. In the admin panel's **Settings → Site Content**, set the admin email address
   (e.g., `contact@yourdomain.com`). The contact form uses
   `contact@<your-domain>` and order notifications use `noreply@<your-domain>`.

> For local development, emails are simulated (not actually sent). Real emails
> only fire when the Worker is deployed to Cloudflare.

---

## Step 9 — What you see now

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

> **Pro tip**: Put Cloudflare Access in front of your admin panel for an extra
> layer of security. In Cloudflare dashboard, go to **Zero Trust → Access →
> Applications** and add your admin domain. This creates a login page so only
> you (and people you invite) can reach the admin panel.

---

## Troubleshooting

**The storefront looks blank / shows errors**

- Make sure `VITE_API_URL` is set correctly. If the backend Worker isn't
  deployed yet, the storefront can't fetch products.
- Check the browser's developer console (F12 → Console) for error messages.

**The admin panel won't save settings**

- Go to **Settings → Admin Config** and check your API URL and secret key.
- Make sure the backend Worker is running and reachable.

**Payments fail with "no such price" or similar**

- Your Stripe keys might be mismatched (test vs live). Make sure the
  publishable key and secret key are both from the same mode (both test or
  both live).

**The contact form doesn't send emails**

- The email domain must be onboarded with Cloudflare (Step 8).
- Check that the admin email in Site Content matches a domain you control.

**Deployment fails on GitHub Actions**

- Click into the failed step — it usually says exactly what's wrong.
- Most common cause: a missing or incorrect secret. Double-check Step 6.1.
