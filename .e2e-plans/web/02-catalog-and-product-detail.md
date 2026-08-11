# Web Storefront E2E — 02 · Catalog & Product Detail

> Prerequisite: read `00-conventions.md`. Covers the products listing (search, sort,
> category & tag filters, load-more, scroll restoration) and the product detail page
> (image gallery, lightbox, quantity, add to cart, not-found). Happy paths first.

**Routes:** `/products` (`products-page`), `/products/:slug` (`product-detail-page`).

---

## Workflow 2.1 — Browse the catalog (happy path)

**As a shopper, I want to see all products.**

1. Go to `/products`. _Expected:_ `products-page` → `products-section` renders a grid of
   `product-card-<slug>` tiles. A results count (`products-section_results-count`,
   `role="status"`) reads "Showing X of Y products".
2. Each **product card** shows: an image (or a 🍯 placeholder), name
   (`product-card_<slug>_name-link` → detail), weight, a 2-line description, a formatted
   price, and an **Add** button (`product-card_<slug>_add-btn`). Featured items show a
   "Featured" badge; out-of-stock items show an "Out of Stock" badge and the button reads
   **"Unavailable"** and is disabled.

---

## Workflow 2.2 — Search & sort

1. **Search:** type into `products-section_search-input` (placeholder "Search products…").
   Wait ~500 ms. _Expected:_ the grid filters; count updates; a clear button
   (`products-section_search-clear`) appears — click to reset.
2. **Sort:** use `products-section_sort-select` with options:
   `name-asc` (A–Z), `name-desc` (Z–A), `price-asc` (low→high), `price-desc` (high→low).
   _Expected:_ order changes accordingly. Verify price sorts by numeric value, not string.

---

## Workflow 2.3 — Category & tag filters

1. **Category buttons** (`products-section_filter-<categoryId>`, e.g.
   `products-section_filter-honey`): click one → only that category shows and the button
   becomes visibly active. Click it again → filter clears.
2. **Tag pills** (`products-section_tag-<tag>`, shown only when tags exist among visible
   products): click to filter by tag; active state styled distinctly; click again clears.
3. **Combined:** apply category + tag + search together → intersection applies; count
   reflects it.

---

## Workflow 2.4 — Load more & scroll restoration

1. If more than one page of products exists, a **Load More** button
   (`products-section_load-more-btn`) is shown; click it → more tiles append; button
   disables while loading and hides when exhausted (page size is 12).
2. **Scroll restoration:** scroll down, click a product's `name-link` to open its detail,
   then use the detail page's **Back to Products** button. _Expected:_ you return to
   `/products` at your **previous scroll position** (state is saved in `sessionStorage`
   keys `products_page_scroll` / `products_page_url`).

---

## Workflow 2.5 — Add to cart from the grid

1. Click a product's `product-card_<slug>_add-btn`. _Expected:_ the item is added; the
   navbar cart badge increments; the `aria-live` region announces the change.
2. Add the same product again → its quantity increases (not a duplicate line).
3. Try to add an **out-of-stock** product → the button is disabled/"Unavailable"; nothing
   is added.

---

## Workflow 2.6 — Product detail page (happy path)

1. Open a product (`/products/:slug`) → `product-detail-page` with
   `product-detail-page_content`.
2. **Image gallery** (`product-detail-page_image-grid`): a main image
   (`product-detail-page_main-image`). If multiple images:
   - Prev/next buttons (`product-detail-page_prev-image-btn` / `_next-image-btn`).
   - Dot indicators (`product-detail-page_image-indicators`, each
     `product-detail-page_image-indicator-<idx>`) jump to that image.
3. **Lightbox:** click the main image → `product-detail-page_lightbox` opens
   (`role="dialog"`, `aria-modal`). It has close (`_lightbox-close-btn`) and, when multiple
   images, prev/next (`_lightbox-prev-btn` / `_lightbox-next-btn`). Escape or the close
   button dismisses it and focus returns sensibly.
4. **Details:** category label, product name (h1), formatted price + weight, description,
   long description, and tags (`product-detail-page_tag-<tag>`) when present.
5. **Quantity selector** (in-stock only): decrease (`product-detail-page_decrease-qty-btn`),
   value (`product-detail-page_qty-value`, `aria-live`), increase
   (`product-detail-page_increase-qty-btn`). Minimum is 1 — decreasing at 1 should not go
   to 0.
6. **Add to cart** (`product-detail-page_add-to-cart-btn`): with quantity N, adds N. If the
   item is already in the cart, this **sets** the cart quantity to N (an explicit update),
   rather than adding on top — verify by opening the cart and confirming the quantity.
7. **Back** (`product-detail-page_back-btn`) returns to `/products` (restoring scroll, per
   2.4).

---

## Workflow 2.7 — Product detail edge cases

- **EC-1 Not found:** open `/products/this-slug-does-not-exist`.
  _Expected:_ a "Product not found" message with a **Back to Products** button
  (`product-detail-page_back-btn`) — not an infinite spinner or crash.
- **EC-2 Fetch error:** if the product fetch fails (API down), an error message + Back
  button render. Restart the Worker afterward.
- **EC-3 Out of stock detail:** open an out-of-stock product. _Expected:_ "Out of Stock"
  badge; the add-to-cart button reads "Out of Stock" and is disabled; no quantity selector.
- **EC-4 Empty catalog / no matches:** filter/search to zero results.
  _Expected:_ `products-section_empty` state with the "no products found" copy.
