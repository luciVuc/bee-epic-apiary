# Web Storefront E2E — 01 · Home & Navigation

> Prerequisite: read `00-conventions.md`. This file covers the home page and its sections,
> the navbar (desktop + mobile), footer, theme toggle, and the initial site-data load
> states. Do happy paths first, then edge cases. Report deviations per §6.

**Routes/components:** `/` (`home-page`), `Layout`/`Navbar`/`Footer`, the app loading/error
states, and the `?session=success` modal.

---

## Workflow 1.1 — Home page loads (happy path)

**As a shopper, I land on the home page and see a compelling hero + social proof.**

1. Open `http://localhost:5173/`.
   - _Expected (loading):_ briefly you may see `app-loading` (a spinner) while site data
     fetches from the API. Then the page renders.
   - _Expected (loaded):_ `layout` wraps the page; `home-page` is present.
2. **Hero** (`hero-section`): a tagline pill (`hero-section_tagline`), a headline + sub-
   headline, and two CTAs:
   - "Shop Our Honey" (`hero-section_shop-btn`, wrapped by `hero-section_shop-link` → `/products`)
   - "Our Story" (`hero-section_story-btn`, `hero-section_story-link` → `/about`)
   - A scroll indicator (`hero-section_scroll-indicator`).
3. **Testimonials** (`testimonials-section`): one card per testimonial
   (`testimonials-section_card-<id>`), each with a star rating
   (`testimonials-section_card-<id>_rating`, `role="img"` with a star-count aria-label),
   author, location, and a formatted date.
4. Click **Shop Our Honey** → navigates to `/products`. Go back. Click **Our Story** →
   `/about`. Go back.

---

## Workflow 1.2 — Navbar (desktop)

1. **Logo** (`navbar_logo-link` with `navbar_logo` image + `navbar_business-name`) links to
   `/`. The business name matches the API's site content (and any edit you made in the
   admin Site Content tab).
2. **Nav links** (`navbar_link-<id>`, e.g. `navbar_link-home`, `navbar_link-products`,
   `navbar_link-contact`): each routes correctly; the active route has `aria-current="page"`
   and is visually highlighted.
3. **Scroll behavior:** scroll down > 20px → the navbar becomes opaque (background/blur
   appears). Scroll back up → returns to transparent.
4. **Cart button** (`navbar_cart-btn` inside `navbar_cart-container`): clicking opens the
   cart drawer (covered in `03-cart-and-checkout.md`). With items in the cart a badge shows
   the count (`9+` when > 9). An `aria-live` region announces cart changes to screen readers.

---

## Workflow 1.3 — Theme toggle

1. Click `navbar_theme-toggle`. _Expected:_ light ↔ dark switch; icon flips (Sun/Moon);
   `aria-label` reflects the target mode ("Switch to light/dark mode"); the choice persists
   across reloads.
2. Toggle back to the original theme.

---

## Workflow 1.4 — Mobile menu (mobile viewport)

At 375×812:

1. Desktop nav links are hidden; a menu button (`navbar_menu-btn`) appears with
   `aria-expanded` and `aria-controls="navbar_mobile-menu"`.
2. Tap `navbar_menu-btn` → `navbar_mobile-menu` slides open with links
   (`navbar_mobile-link-<id>`). Icon changes to an X; `aria-expanded="true"`.
3. Tap a link (e.g. `navbar_mobile-link-products`) → navigates and the menu **auto-closes**.
4. The cart button and theme toggle remain reachable.

---

## Workflow 1.5 — Footer

1. Scroll to the `footer`. Verify:
   - Business name + tagline.
   - **Social links** (only those configured in site content):
     `footer_instagram-link`, `footer_facebook-link`, `footer_etsy-link`,
     `footer_twitter-link`, `footer_youtube-link` — each `target="_blank"` with
     `rel="noopener noreferrer"`. Verify hrefs are present (don't need to open them).
   - **Quick links** (`footer_link-<label>`, e.g. `footer_link-about`, `footer_link-shop`,
     `footer_link-contact`) route within the site.
   - **Contact:** `footer_email-link` (`mailto:`), `footer_phone-link` (`tel:`), and a
     location line.
   - Copyright shows the current year and business name.

---

## Workflow 1.6 — Accessibility of the shell

1. A **skip link** ("skip to content", `href="#main-content"`) is the first focusable
   element and reveals on focus; activating it moves focus to `layout_main`
   (`id="main-content"`, `tabindex="-1"`).
2. Keyboard-tab through the navbar: logo → links → theme → cart (→ menu on mobile), in a
   sensible order, all reachable and operable with Enter/Space.

---

## Workflow 1.7 — Site-data load edge cases

- **EC-1 API error:** stop the Worker (or block the API), then load `/`.
  _Expected:_ the app shows `app-error` ("Unable to load site") **or** gracefully falls back
  to bundled default content (`DEFAULT_SITE`) and still renders. A blank white screen is a
  `major` issue. Restart the Worker after.
- **EC-2 Post-checkout modal:** navigate to `/?session=success`.
  _Expected:_ a success modal (`success-modal_overlay` + `success-modal`) appears with a
  🎉, an order-confirmed title (`success-modal_title`), and a continue button
  (`success-modal_continue-btn`). Closing it (button or click the overlay) dismisses it, and
  the `?session=success` param is stripped from the URL so a reload doesn't reopen it.
  _(a11y)_ the modal has `role="dialog"`, `aria-modal="true"`, and is labelled by its title.
