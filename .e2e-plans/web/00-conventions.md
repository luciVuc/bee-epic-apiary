# Web Storefront E2E — Conventions & Setup (READ FIRST)

> **You are an AI agent testing the public storefront through a real browser using
> Playwright.** You have no prior knowledge of the codebase. Act like a shopper browsing
> and buying honey. Follow each workflow file step by step. When something does not match
> the **Expected result**, stop and **file an issue** (see §6) with a suggested fix, then
> continue with the remaining independent steps.

---

## 1. What this app is

The **web storefront** is the public, no-login e-commerce site for the honey/apiary shop.
It has a marketing home page, an about/process page, a product catalog with detail pages, a
contact form, and a **cart → Stripe Checkout** purchase flow with success/cancel return
pages. Site content (business name, copy, testimonials, process steps, categories) is
loaded from the same Cloudflare Worker API the admin uses.

---

## 2. Environment & how to start it

**Prerequisites:** Node.js 18+, the `services/` Cloudflare Worker on port 8787.

```bash
# 1. Backend API (Cloudflare Worker) — REQUIRED for real product/site data
cd services && npm install && npm run dev        # http://localhost:8787

# 2. Storefront app
cd web && npm install && npm run dev              # http://localhost:5173
```

> **Checkout note:** completing a real Stripe Checkout requires the Worker's Stripe **test**
> keys to be configured. Use Stripe **test card `4242 4242 4242 4242`**, any future expiry,
> any CVC/ZIP. For the order to flow back into the admin/dashboard, Stripe webhooks must be
> forwarded (`cd services && npm run dev:webhooks`) — otherwise the payment still succeeds
> and you'll be redirected to `/success`, but the admin won't register a "new" order. Don't
> report the missing admin order as a storefront bug unless webhook forwarding was enabled.

### URLs

| Environment            | URL                     |
| ---------------------- | ----------------------- |
| Storefront (local dev) | `http://localhost:5173` |
| API (services Worker)  | `http://localhost:8787` |

### Environment variables (in `web/.env`)

| Variable                      | Purpose                                        |
| ----------------------------- | ---------------------------------------------- |
| `VITE_API_URL`                | API base URL (`http://localhost:8787`)         |
| `VITE_STRIPE_PUBLISHABLE_KEY` | Stripe publishable key                         |
| `VITE_SITE_URL`               | Canonical site URL used in SEO/structured data |

---

## 3. Testing configuration

### 3.1 Viewport & responsive breakpoints

Default: **1280×720**. Run the happy path of each workflow at:

| Breakpoint | Viewport   | Focus                                                      |
| ---------- | ---------- | ---------------------------------------------------------- |
| Desktop    | `1280x720` | Full nav bar, multi-column product grid                    |
| Tablet     | `768x1024` | Reflowed grids, condensed nav                              |
| Mobile     | `375x812`  | Hamburger menu, single-column grid, cart drawer full-width |

At each: no horizontal scrollbar, no overflow/overlap, all controls tappable, images scale
cleanly, mobile menu works. Capture a full-page screenshot.

### 3.2 Selectors — prefer `data-testid`

The storefront is **richly instrumented with `data-testid`s**. Prefer them.
**Priority:** `data-testid` > ARIA role/label > visible text > CSS class.

Patterns you'll see:

| Pattern                              | Example                                              |
| ------------------------------------ | ---------------------------------------------------- |
| `{page}-page` / `{section}-section`  | `products-page`, `hero-section`                      |
| `{context}_{action}-btn`             | `navbar_cart-btn`, `cart-drawer_checkout-btn`        |
| dynamic products by **slug**         | `product-card-<slug>`, `product-card_<slug>_add-btn` |
| dynamic cart items by **product id** | `cart-item_<id>`, `cart-item_<id>_remove-btn`        |
| filters by lowercased id/tag         | `products-section_filter-honey`, `_tag-raw`          |

If a referenced `data-testid` is missing, that's a finding — file an issue and fall back to
role/text to continue.

### 3.3 Timeouts

| Action                      | Timeout  |
| --------------------------- | -------- |
| Initial site data load      | 15000 ms |
| Product list / detail fetch | 10000 ms |
| Element visible after click | 5000 ms  |
| Search/sort debounce settle | 500 ms   |
| Stripe redirect (external)  | 20000 ms |

### 3.4 Retry strategy

Retry read-only assertions up to 2× (1 s pause). **Never** re-trigger checkout or a form
submit automatically after a failure — report and inspect instead.

---

## 4. Money & formatting

- Prices are stored in **cents** and rendered via `formatPrice` as USD, e.g. `1250` →
  **"$12.50"**. When you assert a price, assert the formatted string.
- Dates render long-form, e.g. **"January 5, 2026"**.
- Phone renders as **"(XXX) XXX-XXXX"** for 10-digit US numbers (contact section).

---

## 5. Cart persistence

The cart is saved to `localStorage` under **`beeEpicCart`** and survives reloads. A cart
with corrupt data is validated and cleared on load. To start from a clean cart, clear that
key (or use a fresh browser context).

---

## 6. Issue reporting (how to report problems + suggest fixes)

When actual behavior ≠ Expected result, create one Markdown file per issue in `.issues/`
at the repo root, named `web-<workflow>-<kebab-description>.md`:

```markdown
---
title: "[Web · <Workflow>] <brief issue description>"
app: web
workflow: "<workflow file / name>"
step: <step number>
severity: blocker | major | minor | cosmetic
date: "<YYYY-MM-DD>"
---

## What I was doing (shopper's perspective)

<Plain-language: "As a shopper, I was trying to …">

## Steps to reproduce

1. …
2. …
3. … (the failing step)

## What happened

<Actual behavior: error text, wrong price/total, missing element, console error.>

## What I expected

<Per the plan's Expected result.>

## Evidence

- Screenshot: <path to saved Playwright screenshot at moment of failure>
- URL: <url where it happened>
- Viewport: <e.g. 1280x720>
- Console errors: <console.error / failed network requests, with status codes>

## Suggested fix or improvement

<Best hypothesis about the cause + a concrete fix, or a UX/copy improvement if it's not a
strict bug. Reference the likely component/area if inferable, e.g. "the checkout hook
should surface the API error message instead of a generic one".>
```

**Severity:** `blocker` = can't browse/buy / data loss; `major` = feature broken w/
workaround; `minor` = wrong text/state; `cosmetic` = visual/copy.

Always report even if non-blocking: **console errors**, **failed network requests
(4xx/5xx)**, **missing `data-testid`s**, **broken images/links**, **accessibility
violations**, and **incorrect prices/totals**.

> A known-benign case: a product image may fall back to `https://via.placeholder.com/...`
> which can fail to load with `ERR_CONNECTION_CLOSED`. That's a placeholder image, not an
> app fault — note it but mark it `cosmetic`/environment.

---

## 7. Pre-flight questions for the user

Ask and wait for answers before executing:

1. **Scope:** "Which workflows should I run — all, or specific files (home/nav, catalog,
   cart/checkout, content pages, responsive/a11y)?"
2. **Checkout depth:** "Should I complete a real Stripe **test** checkout (test card
   4242…) through to `/success`, or stop at the Stripe redirect? Are webhooks being
   forwarded so the order reaches the admin?"
3. **Responsive:** "All three breakpoints, or desktop only?"
4. **Screenshots:** "Screenshot each step, or only on failures?"
5. **Accessibility:** "Run accessibility checks (aXe + keyboard nav), or skip?"
6. **Contact form:** "OK to submit the contact form (it POSTs to the API)? Use a test
   name/email?"
7. **Issue handling:** "For any problem, I'll write an issue file to `.issues/` with a
   suggested fix. Good?"
