# Admin E2E — 04 · Orders

> Prerequisite: read `00-conventions.md` and be logged in. This file covers the orders
> list, its three-level filtering, and the order detail page including status changes.
>
> **Caution:** orders reflect **real customer transactions**. Do **not** delete orders or
> make destructive changes to real orders. If the user allows it, you may change the
> **fulfillment status** of a test order and then set it back. Confirm with the user first.

**Routes:** `/orders`, `/orders/:id`, `/orders/:id/edit`.

---

## Workflow 4.1 — Browse & search orders (happy path)

**As an admin, I want to find a customer's order.**

1. Go to `/orders`. _Expected:_ `orders-page` with title (`orders-page_title`), a filter
   section (`orders-page_filter`), and a table on desktop (`orders-page_table`) / cards on
   mobile. A results count reads "Showing X of Y orders".
2. **Search:** type into `orders-page_search-input` (placeholder "Search by customer email,
   name, or order ID…"). Wait ~500 ms. _Expected:_ list narrows by email/name/order ID.
   Clear with `orders-page_search-clear`.
3. **Load more:** click `orders-page_load-more-btn` if present → more rows append
   (cursor-based); no duplicates; hides when exhausted.
4. Click an order row → navigates to its detail page (`/orders/:id`).

---

## Workflow 4.2 — Filter orders (three dimensions)

Open the filters panel via `orders-page_filter-toggle` (`orders-page_filters-panel`).

1. **Checkout status** (`orders-page_checkout-status-filter`): options `ALL`, `open`,
   `complete`, `expired`.
2. **Payment status** (`orders-page_payment-status-filter`): options `ALL`, `paid`,
   `unpaid`, `no_payment_required`.
3. **Order (fulfillment) status** (`orders-page_order-status-filter`): options `ALL`,
   `new`, `pending`, `fulfilled`.
4. Apply each individually, then in combination. _Expected:_ the list reflects the
   intersection of active filters; results count updates; URL query params sync (`status`,
   `payment_status`, `order_status`, `search`). Reloading the page preserves the filters
   from the URL.
5. **EC — no matches:** pick a combination that yields nothing (e.g. `expired` + `paid` +
   `fulfilled`). _Expected:_ an empty state, not a broken table.

---

## Workflow 4.3 — Order detail (happy path)

1. Open an order (`/orders/:id`) → `order-detail-page`.
2. Verify:
   - Truncated order ID (`order-detail-page_id`); clicking it reveals a popup with the full
     ID and a **Copy** button (`order-detail-page_copy-order-id-btn`, text toggles
     "Copy"→"Copied").
   - Customer info, line items, totals, payment/fulfillment status cards.
   - A **checkout link** (`order-detail-page_checkout-link`) opening the Stripe checkout
     session in a new tab (external — just verify the href/target, don't complete anything).
   - The **Back** button (`order-detail-page_back-button`) returns to `/orders` with your
     prior filters/scroll intact.
3. **EC — unknown order:** navigate to `/orders/does-not-exist`. _Expected:_
   `order-detail-page_error` (not an infinite spinner).

---

## Workflow 4.4 — Change fulfillment status (mutation — needs approval)

**As an admin, I want to mark an order as pending/fulfilled.**

1. On an order the user designates as safe to modify, click **Edit**
   (`order-detail-page_edit-button`) → opens the edit dialog at `/orders/:id/edit`.
2. Change the order (fulfillment) status (e.g. `new` → `pending`), save.
   - _Expected:_ the detail page reflects the new status; the change persists on reload;
     the dashboard "Orders by status" counts shift accordingly (paid orders only).
3. **Cleanup:** set the status back to its original value.

- **EC:** attempt to save with no change → save should be a no-op or disabled; report if it
  errors.

> If the user does not approve modifying any order, skip the mutation and verify only that
> the Edit button opens the dialog and Cancel closes it without changes.

---

## Workflow 4.5 — Live order arrival (conditional)

Same condition as `02-dashboard.md` Workflow 2.3 — requires webhook forwarding or a real
environment. With it enabled, a newly-paid order should appear in the `/orders` list
(and bump the "new" count) via the `NEW_ORDER` event **without a manual reload**. Without
forwarding, mark as not testable rather than a bug.
