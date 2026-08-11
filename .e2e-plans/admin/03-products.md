# Admin E2E — 03 · Products

> Prerequisite: read `00-conventions.md` and be logged in. This is the largest workflow
> set: browsing/searching/filtering, the full create→view→edit→delete lifecycle, and bulk
> cleanup. Honor the **Self-contained testing principle** (§5): everything you create you
> must edit and then delete. Prefix test products with **`E2E TEST –`**.

**Routes:** `/products`, `/products/new`, `/products/:id`, `/products/:id/edit`.

---

## Workflow 3.1 — Browse, search, filter, paginate (happy path)

**As an admin, I want to find products quickly.**

1. Go to `/products`. _Expected:_ `products-page` with header (`products-page_title`), a
   toolbar (`products-page_toolbar`), and a product **table** on desktop
   (`products-page_table`) / cards on mobile. A results count
   (`products-page_results-count`) reads "Showing {n} of {total} products".
2. **Search:** type a known product name into `products-page_search-input`. Wait ~500 ms
   (300 ms debounce). _Expected:_ the list narrows; results count updates. A clear button
   (`products-page_search-clear`) appears — click it to reset.
3. **Filter by category:** click the filter toggle (`products-page_filter-toggle`) to open
   `products-page_filters-panel`, then pick a category in `products-page_category-filter`
   (options: `ALL` + each category). _Expected:_ only that category's products show;
   results count updates.
4. **Combined search + category:** with a category selected, also type a search term.
   _Expected:_ both filters apply (AND). Clearing the search keeps the category filter.
5. **Pagination:** if `products-page_load-more-btn` is visible, click it. _Expected:_ more
   rows append (cursor-based `starting_after`); count grows; no duplicates. The button
   hides when there are no more.

**Regression check:** the Edit and Delete icon buttons in each row must have accessible
labels (`aria-label`) — verify at least one row.

---

## Workflow 3.2 — Create a product (happy path)

**As an admin, I want to add a new product; it should be created in Stripe and appear in
the list.**

1. Click **Add Product** (`products-page_add-btn`) → URL becomes `/products/new` and the
   `product-form-dialog` opens with title "New Product" (`product-form-dialog_title`).
2. Fill the form:
   - Name (`product-form-dialog_input-name`): `E2E TEST – Wildflower Honey`
   - Slug (`product-form-dialog_input-slug`): `e2e-test-wildflower-honey`
   - Description (`product-form-dialog_input-description`): a short line.
   - Long description (`product-form-dialog_textarea-long-description`): optional.
   - Price (`product-form-dialog_input-price`): an integer in **cents**, e.g. `1250`
     (= $12.50). Must be **> 0**.
   - Category (`product-form-dialog_select-category`): pick one, e.g. Honey.
   - Weight (`product-form-dialog_input-weight`): e.g. `12 oz`.
   - In stock (`product-form-dialog_checkbox-in-stock`): checked.
   - Featured (`product-form-dialog_checkbox-featured`): optional.
   - Optionally add an image URL via `product-form-dialog_url-input-list-imageUrls` and a
     tag via `product-form-dialog_input-tags`.
3. Click **Save Product** (`product-form-dialog_submit_btn`).
   - _Expected:_ the dialog performs a multi-call Stripe sequence server-side (create
     product → create price → set default price → refetch). On success the dialog closes
     and the new product appears in the list. This can take a few seconds — allow up to
     10 s.
4. Search for `E2E TEST` to confirm it's listed. **Do not delete yet** — proceed to 3.3
   and 3.4 to test View/Edit, then delete in 3.5.

> **Note on Stripe (test mode):** creation actually hits Stripe test mode via the Worker.
> If the Worker's Stripe key is missing/invalid you'll get an error banner
> (`product-form-dialog_error`) — that's an environment problem, not necessarily an app
> bug; report it as environment-blocked.

---

## Workflow 3.3 — View product detail

1. From the list, click the `E2E TEST` product's row/name → `/products/:id`
   (`product-detail-page`).
2. Verify sections: name (`product-detail-page_name`), images
   (`product-detail-page_images`), description (`product-detail-page_description`), tags if
   any (`product-detail-page_tags`), and the sidebar cards:
   - **Status** (`product-detail-page_status`): in-stock / featured flags.
   - **Details** (`product-detail-page_details`): price (`product-detail-page_price_value`
     — confirm it matches what you entered, formatted as currency), category, weight, slug.
   - **Stripe info** (`product-detail-page_stripe-info`): a Stripe price ID
     (`product-detail-page_stripe-price-id_value`) and payment link.
3. The **Back** button (`product-detail-page_back-button`) returns to `/products`.

---

## Workflow 3.4 — Edit a product

1. On the detail page click **Edit** (`product-detail-page_edit-button`) → URL becomes
   `/products/:id/edit` and the `product-form-dialog` opens prefilled with title "Edit
   Product".
2. Confirm the **Save** button is initially **disabled** until you change something (the
   dialog tracks `hasChanges`).
3. Change the price (e.g. `1250` → `1400`) and the name suffix, then Save.
   - _Expected:_ because the price changed, the server creates a **new** Stripe price and
     sets it as default, then refetches. Dialog closes; detail page reflects the new price.
4. Edit again changing only a non-price field (e.g. description); Save.
   - _Expected:_ metadata-only update (no new Stripe price). Detail reflects the change.

---

## Workflow 3.5 — Delete a product (and cleanup)

1. On the detail page (or from the list row) click **Delete**
   (`product-detail-page_delete-button` / row delete). A confirm dialog appears
   (`product-detail-page_delete-confirm-dialog`).
2. Confirm the deletion.
   - _Expected:_ the product is removed and you return to `/products`; it no longer appears
     in the list. **Regression check:** if you then navigate directly to the deleted
     product's `/products/:id` URL, you must see an **error state**
     (`product-detail-page_error`), **not an infinite spinner**.
3. This satisfies cleanup for the product created in 3.2. Ensure **no `E2E TEST` products
   remain** — search to confirm.

> **Stripe delete constraint:** a product that has any Stripe price cannot be hard-deleted;
> the backend falls back to **archiving** it (removing it from active listings). So a
> "deleted" product may actually be archived in Stripe — it should still disappear from the
> admin's active list. If it remains visible/active, file an issue.

---

## Workflow 3.6 — Create-from-dashboard variant

1. From `/dashboard`, click **Add New Product**
   (`dashboard-page_quick-actions_add-product-link`) → opens `/products/new` dialog.
2. Create a second `E2E TEST` product, then delete it from its detail page (as in
   3.2 → 3.5). This verifies the create flow initiated from the dashboard entry point.

---

## Workflow 3.7 — Product form validation (edge cases)

Run in the create dialog (`/products/new`); Cancel (`product-form-dialog_cancel-btn`) after
each without saving invalid data.

- **EC-1 Missing required fields:** leave Name/Slug/Price/Category empty, Save.
  _Expected:_ submission blocked; required-field validation surfaces. No product created.
- **EC-2 Zero / negative price:** enter `0` (or a negative) for price, Save.
  _Expected:_ inline error banner **"Price must be greater than 0"**
  (`product-form-dialog_error`); modal stays open; nothing created. _(Known regression
  guard — must not submit a zero-price product.)_
- **EC-3 Invalid image URL:** add a non-URL string (e.g. `not a url`) in the image URL
  list, Save. _Expected:_ validation rejects it with a clear message.
- **EC-4 Duplicate slug:** create a product with a slug that already exists.
  _Expected:_ the server rejects it; an error banner explains the conflict; no duplicate
  created.
- **EC-5 Subscription category:** choose the Subscriptions category — the recurring
  interval controls appear (`product-form-dialog_select-interval`,
  `product-form-dialog_input-interval-count`). Verify they show only for subscriptions.
- **EC-6 Close mid-edit:** make a change then click the X (`product-form-dialog_close-btn`)
  or Cancel. _Expected:_ the dialog closes and the list is unchanged (no partial save).
- **EC-7 Failed create rollback:** if a create fails after the product row is created in
  Stripe, the backend attempts a best-effort DELETE to roll back. Hard to force manually;
  if you observe an orphaned half-created product after an error, file an issue.

---

## Workflow 3.8 — Cleanup un-priced products (dialog)

**As an admin, I want to remove unsellable (un-priced) products in bulk.**

1. Click the **Cleanup** button (`products-page_cleanup-btn`, title "Remove un-priced
   (unsellable) products"). The `cleanup-dialog` opens and runs a **dry run** first.
   - _Expected:_ it lists candidate un-priced products (`cleanup-dialog_list`) or shows an
     empty state (`cleanup-dialog_empty`) if none. The confirm button
     (`cleanup-dialog_confirm-btn`) reads "Preview"/"Cleanup".
2. **If there are candidates AND the user approves the destructive apply:** click confirm
   to apply. _Expected:_ a summary like "X deleted, Y archived, Z failed". Products that
   can't be hard-deleted are archived (per the Stripe constraint).
3. **If you do not want to mutate real data:** verify only the dry-run list, then Cancel
   (`cleanup-dialog_cancel-btn`). Note that the apply step was not run.

- **EC:** if the dry run errors, `cleanup-dialog_error` shows — report it.

---

## Workflow 3.9 — Empty & error states

- **EC-1 No products / no matches:** search for a string that matches nothing.
  _Expected:_ `products-page_empty` state (with an add button `products-page_empty-add-btn`)
  — and its copy should reflect _"no matches"_ when filtering vs _"no products yet"_ when
  the store is genuinely empty.
- **EC-2 List load error:** if the products fetch fails, `products-page_error` (role=alert)
  shows instead of a silent blank table.
- **EC-3 Back-navigation count persistence:** load more (3.1 step 5) so you're showing >
  the default page size, open a product detail, then click Back. _Expected:_ the list
  reloads with the **same item count** you had before (not reset to the default) and your
  **scroll position** is restored.
