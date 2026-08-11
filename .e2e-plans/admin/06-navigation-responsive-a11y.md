# Admin E2E — 06 · Navigation, Responsive & Accessibility

> Prerequisite: read `00-conventions.md` and be logged in. This file verifies the app
> shell (navbar, sidebar, notifications) and cross-cutting responsive + accessibility
> behavior. Run it at all three breakpoints.

**Components:** `AdminNavbar`, `Sidebar`, `AdminLayout`, `NotificationsPanel`, `UserMenu`.

---

## Workflow 6.1 — Sidebar navigation (desktop, happy path)

1. At 1280×720, verify the sidebar is **visible** and lists: Dashboard, Products, Orders,
   Settings.
2. Click each link in turn. _Expected:_ correct route loads (`/dashboard`, `/products`,
   `/orders`, `/settings`) and the active item is visually highlighted / `aria-current`.
3. The navbar shows branding, the user menu (`user-menu_trigger`), a theme toggle, a
   notifications bell, and an SSE/connection health indicator.

---

## Workflow 6.2 — Theme toggle

1. Click the navbar theme toggle. _Expected:_ the UI switches light ↔ dark; the choice
   persists across a reload (stored client-side).
2. Toggle back to the original theme.

- _(a11y)_ the toggle has an `aria-label` reflecting the target mode.

---

## Workflow 6.3 — Notifications panel

1. Click the notifications bell in the navbar → the `NotificationsPanel` opens.
2. _Expected:_ it lists recent notifications or an empty state. If webhook forwarding is
   active, a new order should produce a notification entry.
3. Close the panel (button or click-outside). _(a11y)_ the bell button has an `aria-label`;
   focus handling is sane.

- If no notifications exist locally (no webhook forwarding), verify only the open/empty/
  close behavior — not live delivery.

---

## Workflow 6.4 — Responsive layout (tablet & mobile)

1. **Tablet (768×1024):** the sidebar collapses to a toggle. Open it, navigate, and
   confirm it can be dismissed. Grids reflow; touch targets remain adequate.
2. **Mobile (375×812):**
   - The sidebar is **hidden**; a **hamburger** button appears in the navbar.
   - **Regression check:** the sidebar container must actually be off-canvas — verify it is
     translated off-screen (e.g. a `-translate-x-full` transform / not in the layout flow),
     not merely visually covered. Opening the hamburger slides it in over an overlay;
     tapping the overlay or a link closes it.
   - Product and order **tables** switch to **card** layouts.
   - No horizontal scrollbar anywhere; no overlapping controls.
3. Capture a full-page screenshot at each breakpoint for the happy path of each major page
   (dashboard, products, orders, settings).

---

## Workflow 6.5 — Accessibility sweep (if enabled)

Across the main pages:

1. **aXe scan:** no critical violations on dashboard, products list, product detail,
   product form dialog, orders list, order detail, and each settings tab.
2. **Icon-only buttons have `aria-label`s:** hamburger, sidebar close, notification bell,
   dialog close (`product-form-dialog_close-btn`), back buttons, add/remove tag, image-URL
   remove, settings trash buttons, category filter select, row edit/delete icons.
   _(Known regression area — verify these are labeled.)_
3. **Focus trapping:** open the product form dialog, the change-password modal, and the
   notifications panel — focus stays within while open (Tab cycles inside) and returns to
   the trigger on close (Escape closes).
4. **Keyboard-only flows:** log in, open the user menu, and submit a settings form using
   only the keyboard.
5. Report each violation as its own issue with the offending element and a suggested fix
   (e.g. "add `aria-label='Close dialog'` to `product-form-dialog_close-btn`").

---

## Workflow 6.6 — Session resilience (edge cases)

- **EC-1 Token refresh:** stay idle long enough for the access token to expire, then click
  a nav link. _Expected:_ the API transparently refreshes and retries once; you stay logged
  in. A bounce to `/login` mid-session is a `major` issue.
- **EC-2 Hard reload on a deep route:** reload the browser on `/products/:id`. _Expected:_
  after the auth check you land back on the same page (not `/login`, assuming the session
  cookie is still valid).
- **EC-3 Direct-to-login when authed:** navigate to `/login` while logged in. _Expected:_
  you're allowed to see it (or redirected to `/dashboard`) — note the actual behavior; a
  broken/blank state is a bug.
