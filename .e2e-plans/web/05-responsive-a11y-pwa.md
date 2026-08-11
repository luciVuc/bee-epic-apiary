# Web Storefront E2E — 05 · Responsive, Accessibility & PWA

> Prerequisite: read `00-conventions.md`. Cross-cutting checks across the storefront. Run
> the responsive matrix on each major page; run a11y where enabled.

---

## Workflow 5.1 — Responsive matrix

For each of `/`, `/products`, a product detail page, `/about`, `/contact`, and the cart
drawer, at **1280×720**, **768×1024**, and **375×812**:

1. Verify layout: no horizontal scrollbar, no overlapping or clipped elements, no text
   overflowing its container, images scale without distortion.
2. Navigation adapts: desktop links vs. mobile hamburger (`navbar_menu-btn` →
   `navbar_mobile-menu`); the cart drawer is comfortably usable (near full-width on mobile).
3. Product grid reflows (4 cols → 2 → 1). Touch targets are large enough on mobile.
4. Capture a full-page screenshot per page per breakpoint.

Report any breakpoint-specific breakage with the viewport noted in the issue.

---

## Workflow 5.2 — Accessibility sweep (if enabled)

1. **aXe scan** on each major page: no critical violations.
2. **Landmarks & skip link:** the skip link works (`01-home-and-navigation.md` 1.6);
   `layout_main` is the main landmark.
3. **Images:** meaningful images have alt text; decorative ones are `aria-hidden`.
4. **Dialogs/drawers:** the cart drawer, image lightboxes, and the success modal each have
   `role="dialog"` + `aria-modal`, trap focus while open, close on Escape, and return focus
   to their trigger.
5. **Forms:** the contact form fields have associated labels, `aria-required`, and
   `aria-invalid`/`aria-describedby` on error.
6. **Live regions:** the cart-count announcement region updates on add/remove; the products
   results count is a polite live region.
7. **Keyboard-only purchase path:** browse → add to cart → open drawer → adjust qty →
   reach the checkout button, entirely via keyboard.
8. **Color contrast** in both light and dark themes meets AA for text.

File one issue per violation with the element, the rule, and a concrete fix suggestion.

---

## Workflow 5.3 — PWA & update prompt

1. Verify a web app manifest and service worker register (check the Application tab /
   network for `manifest` and the SW). _Expected:_ the site is installable (an install
   affordance may appear in-browser).
2. **Update prompt:** the app includes an `UpdatePrompt` component that surfaces when a new
   service-worker version is available. This is hard to trigger on demand; if you can
   simulate an SW update (e.g. via DevTools "Update on reload"), verify the prompt appears
   and its action reloads to the new version. Otherwise note it as not readily testable.
3. **Offline (optional):** with the SW active, toggle offline and reload. _Expected:_
   previously-cached shell still renders (per the app's caching strategy) rather than the
   browser's dinosaur page. Note the observed behavior.

---

## Workflow 5.4 — SEO/meta (light check)

1. Each route sets a sensible document `<title>` and meta description via the SEO head
   (e.g. `/products` → "Shop All Products").
2. Canonical URLs and structured data are emitted (present in the DOM `<head>`). A missing
   or obviously wrong canonical is a `minor` issue worth noting.
