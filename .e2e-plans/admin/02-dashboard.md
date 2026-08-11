# Admin E2E — 02 · Dashboard

> Prerequisite: read `00-conventions.md` and be logged in (`01-auth.md`, Workflow 1.1).
> This file covers the dashboard landing page: stats, breakdowns, quick actions, recent
> lists, and the live new-order event.

**Route:** `/dashboard` (also the redirect target for `/`).

---

## Workflow 2.1 — Dashboard loads with stats (happy path)

**As an admin, I open the dashboard and see an at-a-glance summary of the store.**

1. Navigate to `/dashboard` (or click the logo / land here after login).
   - _Expected:_ `dashboard-page` renders with a header (`dashboard-page_header`) and title
     (`dashboard-page_title`).
2. Verify the **stat cards** in `dashboard-page_stats-grid`:
   - New Orders — `dashboard-page_stat-card_new-orders`
   - Total Active Products — `dashboard-page_stat-card_total-active-products`
   - Featured Products — `dashboard-page_stat-card_featured-products`
   - Total Categories — `dashboard-page_stat-card_total-categories`
   - _Expected:_ each shows a numeric value (0 is valid). Cross-check "Total Active
     Products" against the count you'll see later on the Products page — they should agree.
3. Verify **Orders by status** (`dashboard-page_orders-by-status`): a title, a "View All →"
   link (`dashboard-page_orders-by-status_view-all-link`), and bars for **new**,
   **pending**, **fulfilled** (`dashboard-page_orders-by-status_category-bar-new` /
   `-pending` / `-fulfilled`). Values reflect **paid** orders only.
4. Verify **Category breakdown** (`dashboard-page_category-breakdown`) shows per-category
   product counts (`dashboard-page_category-breakdown_content`).
5. Verify **Recent Orders** (`dashboard-page_recent-orders_list`) and **Recent Products**
   (`dashboard-page_recent-products_list`) each show up to 5 rows, or an empty state
   (`dashboard-page_recent-orders_empty` → "No orders yet.").

---

## Workflow 2.2 — Quick actions & navigation

1. In **Quick Actions** (`dashboard-page_quick-actions_list`), verify and click each:
   - View Orders (`dashboard-page_quick-actions_view-orders-link`) → `/orders`
   - Manage Products (`dashboard-page_quick-actions_manage-products-link`) → `/products`
   - Add New Product (`dashboard-page_quick-actions_add-product-link`) → `/products/new`
     (opens the product form dialog — see `03-products.md`)
   - Update Settings (`dashboard-page_quick-actions_update-settings-link`) → `/settings`
   - _Expected:_ each navigates to the correct route. Use the browser back button between.
2. The top-right **Add Product** button (`dashboard-page_add-product-link`) also opens the
   create dialog at `/products/new`.
3. "View All →" on Recent Orders (`dashboard-page_recent-orders_view-all-link`) and Recent
   Products (`dashboard-page_recent-products_view-all-link`) go to `/orders` and
   `/products` respectively.
4. Click a recent order row (`dashboard-page_recent-orders_order-<id>`) → opens that
   order's detail page. Click a recent product row
   (`dashboard-page_recent-products_product-<id>`) → opens that product's detail page.

---

## Workflow 2.3 — Live new-order event (conditional)

Only meaningful if Stripe webhooks are being forwarded locally
(`services npm run dev:webhooks`) or on a real environment.

1. Stay on `/dashboard`. Trigger a test order (complete a checkout in the storefront —
   see `web/03-cart-and-checkout.md`), or have the user replay a webhook.
   - _Expected:_ the dashboard listens for a `NEW_ORDER` event and **refetches** the order
     counts and Recent Orders **without a manual reload** — the "New Orders" stat and the
     Recent Orders list update.
2. If no webhook forwarding is configured, note this workflow as **not testable in this
   environment** rather than reporting a bug.

---

## Workflow 2.4 — Degraded / error states (edge cases)

- **EC-1 API down:** stop the Worker (or block the API), reload `/dashboard`.
  _Expected:_ the page still renders in a degraded state (stat fetches are non-fatal) —
  cards show fallbacks rather than crashing to a blank screen. If the whole page white-
  screens, file a `major` issue. Restart the Worker afterward.
- **EC-2 Empty store:** on an environment with no products/orders, verify empty states
  render (e.g. `dashboard-page_recent-orders_empty`), and stat cards show 0 rather than
  blank/NaN.
- **EC-3 `?reset=complete` banner:** navigate to `/dashboard?reset=complete` (this is where
  a completed password reset lands). _Expected:_ a notice that other sessions were signed
  out, if the app surfaces one. Absence is acceptable; note it.
