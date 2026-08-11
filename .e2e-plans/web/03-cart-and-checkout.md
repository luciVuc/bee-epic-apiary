# Web Storefront E2E — 03 · Cart & Checkout

> Prerequisite: read `00-conventions.md`. Covers the cart drawer (add/update/remove,
> subtotal, empty state, persistence), the Stripe checkout hand-off, and the `/success` and
> `/cancel` return pages. **Checkout hits Stripe test mode** — confirm scope/depth with the
> user first (conventions §7 Q2).

**Components/routes:** `CartDrawer`, `CartItem`, `CheckoutButton`, `/success`
(`success-page`), `/cancel` (`cancel-page`).

---

## Workflow 3.1 — Open, inspect, and close the cart (happy path)

1. Add 1–2 products (from a grid or detail page, per `02`). Click the navbar cart button
   (`navbar_cart-btn`).
   - _Expected:_ `cart-drawer_overlay` + `cart-drawer` (`role="dialog"`, `aria-modal`) slide
     in from the right. A title "Your Cart" and an item count show. Focus moves into the
     drawer (close button autofocuses) and is trapped while open.
2. Each line is a `cart-item_<productId>` with: thumbnail (or 🍯), name link
   (`cart-item_<id>_name-link` → product detail), weight, quantity controls, a line total
   (`price × qty`, formatted), and a remove button (`cart-item_<id>_remove-btn`).
3. The footer shows a **Subtotal** (formatted) and a **Proceed to Checkout** button
   (`cart-drawer_checkout-btn`), plus a **Continue Shopping** button.
4. Close via the X (`cart-drawer_close-btn`), the overlay, or Continue Shopping. _Expected:_
   drawer closes; focus returns to the cart button.

---

## Workflow 3.2 — Update quantities & remove

1. In the drawer, click `cart-item_<id>_increase-btn` → quantity and line total and subtotal
   all increase; navbar badge updates.
2. Click `cart-item_<id>_decrease-btn` → decreases. Decreasing at quantity 1 removes the
   line (quantity ≤ 0 removes the item).
3. Click `cart-item_<id>_remove-btn` → the line is removed with an exit animation; subtotal
   and badge update.
4. Remove all items → the drawer shows the **empty state**: a bag icon, "Your cart is
   empty", "Add some honey to get started!", and a Continue Shopping button. The checkout
   button is not shown / is disabled in the empty state.

---

## Workflow 3.3 — Cart persistence (edge case)

1. Add items, then **reload** the page. _Expected:_ the cart is restored from
   `localStorage` (`beeEpicCart`) — same items and quantities; navbar badge matches.
2. _(Optional destructive)_ Corrupt the `beeEpicCart` value in localStorage, reload.
   _Expected:_ the app detects invalid data and clears the cart rather than crashing.

---

## Workflow 3.4 — Checkout hand-off to Stripe (happy path)

**As a shopper, I want to pay for my cart.**

1. With ≥ 1 valid in-stock product in the cart, click **Proceed to Checkout**
   (`cart-drawer_checkout-btn`). _Expected:_ the button enters a loading state while the app
   POSTs to `/checkout`; on success the browser **redirects to a Stripe Checkout URL**
   (external, `checkout.stripe.com` or similar). Allow up to 20 s for the redirect.
2. **If completing the test payment (user-approved):** on Stripe's page use test card
   `4242 4242 4242 4242`, any future expiry, any CVC/ZIP, and pay.
   - _Expected:_ Stripe redirects back to `/success?session_id=cs_...` on the storefront.
3. **If stopping at the redirect:** confirm you reached a Stripe-hosted checkout URL, then
   navigate back. Note that the payment was not completed.

---

## Workflow 3.5 — Success page (`/success`)

1. Arrive at `/success` after payment (or navigate to
   `/success?session_id=cs_test_123` to exercise the UI).
   - _Expected:_ `success-page` with an icon (`success-page_icon`/`_glyph`), a confirmed
     title (`success-page_title`), a message (`success-page_message`), and a "What's Next?"
     list (`success-page_next-steps` with items `_next-steps-item-1`/`-2`).
2. **Cart clearing:** when the `session_id` starts with `cs_`, the cart is **cleared** on
   this page (once) — verify the navbar badge drops to 0. A forged/non-`cs_` session id must
   **not** clear the cart (guard against tampering). The URL query is stripped after
   clearing so a reload doesn't re-run it.
3. **Order ID:** `success-page_session-id-value` shows a truncated id; clicking it copies
   the full id to the clipboard (icon flips to a check for ~2 s).
4. Buttons: **Continue Shopping** (`success-page_continue-shopping-btn` → `/products`) and
   **Home** (`success-page_home-btn` → `/`). A contact email link
   (`success-page_contact-email`) is present.

---

## Workflow 3.6 — Cancel page (`/cancel`)

1. Navigate to `/cancel` (or click "back"/cancel from Stripe Checkout).
   - _Expected:_ `cancel-page` with an icon (`cancel-page_icon`), a "Checkout Cancelled"
     title (`cancel-page_title`), a message stating **no charges were made and items remain
     in the cart** (`cancel-page_message`), and a "Need Help?" list (`cancel-page_help`).
2. **Cart preserved:** verify the cart still contains the items (badge unchanged) — cancel
   must not clear the cart.
3. Buttons: **Continue Shopping** (`cancel-page_continue-btn` → `/`) and **Contact Support**
   (`cancel-page_contact-btn` → `/contact`).

---

## Workflow 3.7 — Checkout edge cases

Run against the cart / `CheckoutButton` (the standalone `checkout-button_btn` behaves the
same as the drawer button).

- **EC-1 Empty cart:** with an empty cart, the checkout button is disabled (aria-label "Cart
  is empty"); clicking does nothing. If it somehow fires, the hook sets an error "Your cart
  is empty".
- **EC-2 Invalid price ids:** if a cart item has a placeholder/invalid `stripePriceId` (not
  starting with `price_`, or containing "REPLACE"), checkout must surface an error like
  **"No valid products for checkout. Please contact support."** — not a silent failure or a
  broken Stripe redirect. (You may not be able to force this without seeded bad data; if you
  observe it, verify the message.)
- **EC-3 Mixed cart (subscription + one-time):** add both a subscription product and a
  one-time product, then checkout. _Expected:_ an error explaining you must check out each
  type separately (**"Your cart mixes subscription and one-time items. Please check out each
  type separately."**). The error shows in the drawer footer (`role="alert"`).
- **EC-4 API/network failure:** if `/checkout` fails, _Expected:_ a friendly error ("An
  unexpected error occurred. Please try again.") in the drawer footer; no redirect; cart
  intact; button returns from loading state.
- **EC-5 Double-click guard:** rapidly click checkout twice → only one request/redirect
  (the loading state should prevent a second submit).
