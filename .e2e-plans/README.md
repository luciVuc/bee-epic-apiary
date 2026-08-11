# E2E Test Plans

This directory contains End-to-End (E2E) test plans for the Bee Epic Apiary monorepo.
Each plan is written for an **AI testing agent driving a real browser via Playwright**,
with **no prior knowledge of the project internals**. Every plan is phrased from the
**user's point of view** ("click the Sign in button", "you should see…") and tells the
agent exactly what to do, what to expect, and — when something is wrong — **how to report
it and suggest a fix**.

## Structure

```
.e2e-plans/
├── README.md                 ← you are here
├── admin/                    ← Admin panel app (React SPA, requires login)
│   ├── 00-conventions.md     ← READ FIRST: setup, selectors, reporting, prompts
│   ├── 01-auth.md            ← login, logout, bootstrap, invite, password reset
│   ├── 02-dashboard.md       ← dashboard stats, quick actions, live order events
│   ├── 03-products.md        ← product list, search/filter, CRUD, cleanup
│   ├── 04-orders.md          ← order list, filters, order detail, status changes
│   ├── 05-settings.md        ← all settings tabs (incl. OWNER-only Users & Security)
│   └── 06-navigation-responsive-a11y.md ← nav, responsive, accessibility
├── web/                      ← Public storefront app (no login)
│   ├── 00-conventions.md     ← READ FIRST: setup, selectors, reporting, prompts
│   ├── 01-home-and-navigation.md ← home page, navbar, footer, theme, mobile menu
│   ├── 02-catalog-and-product-detail.md ← product list, filters, detail, gallery
│   ├── 03-cart-and-checkout.md ← cart drawer, quantities, Stripe checkout, success/cancel
│   ├── 04-content-pages.md    ← about/process, contact form
│   └── 05-responsive-a11y-pwa.md ← responsive, accessibility, PWA
└── admin.md (legacy)          ← superseded by admin/ — kept for history
```

## How to use these plans

1. **Start with `00-conventions.md`** in the app folder you're testing. It contains
   the environment setup, URLs, credentials handling, selector strategy, timeout/retry
   rules, and the issue-reporting format. Every workflow file assumes you have read it.
2. Ask the user the **pre-flight questions** listed in `00-conventions.md` (scope,
   responsive breakpoints, screenshots, accessibility, issue handling) and wait for
   answers before executing.
3. Execute the workflow files in numeric order (they build on each other — e.g. auth
   before dashboard). Within a file, do the **happy path** first, then the **edge cases**.
4. When a step's actual behavior differs from the **Expected result**, do not silently
   continue: **report it** using the issue format in `00-conventions.md`, including a
   plain-language description, repro steps, console errors, a screenshot, and a
   **suggested fix**. Then continue with the remaining independent steps.

## Two apps, two audiences

| App   | Path     | Audience            | Auth           | Dev URL                 |
| ----- | -------- | ------------------- | -------------- | ----------------------- |
| Admin | `admin/` | Store staff / owner | Email+password | `http://localhost:5174` |
| Web   | `web/`   | Public shoppers     | None           | `http://localhost:5173` |

Both are backed by the same Cloudflare Worker API (`services/`) at
`http://localhost:8787`. The Worker must be running for either app to load real data.
