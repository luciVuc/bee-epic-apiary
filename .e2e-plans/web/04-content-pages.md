# Web Storefront E2E — 04 · Content Pages (About/Process & Contact)

> Prerequisite: read `00-conventions.md`. Covers the About/Process page and the Contact
> page (form validation, honeypot, submit, success). Submitting the contact form POSTs to
> the API — confirm with the user (conventions §7 Q6) before submitting real data.

**Routes:** `/about` (`about-process-page`), `/contact` (`contact-page`).

---

## Workflow 4.1 — About & Process page (happy path)

1. Go to `/about` → `about-process-page`, rendering an About section and a Process section.
2. **About** (`about-section`):
   - Text column (`about-text` / `about-text-content`) with the store's story paragraphs.
   - Image column (`about-image` / `about-image-content`): a main image
     (`about-image_main-image`) or a placeholder (`about-image-placeholder`, 🐝). If
     multiple images: prev/next (`about-image_prev-btn` / `_next-btn`) and dot indicators
     (`about-image_indicators`, each `about-image_indicator-<idx>`).
   - **Lightbox:** click the main image → `about-image_lightbox` (`role="dialog"`), with
     close (`_lightbox-close-btn`) and, if multiple, prev/next. Escape/close dismisses it.
   - A stats box (`about-stats`, e.g. "Since 2009") and a stats grid (`about-stats-grid`)
     with three cards.
3. **Process** (`process-section`): step cards (`process-section_step-<id>`, e.g.
   `process-section_step-harvest`) shown as a horizontal timeline on desktop and a vertical
   one on mobile. Verify each configured step (from the admin Process tab) appears with its
   icon, number, title, and description, in order.

---

## Workflow 4.2 — Contact page & form (happy path)

1. Go to `/contact` → `contact-page` → `contact-section`.
2. Fill the form:
   - Name (`contact-section_input-name`) — required.
   - Email (`contact-section_input-email`) — required, type=email.
   - Subject (`contact-section_select-subject`) — options: `general` (General Inquiry),
     `order` (Order Question), `wholesale` (Wholesale Inquiry), `other` (Other); default
     `general`.
   - Message (`contact-section_textarea-message`) — required.
   - **Leave the honeypot empty** (hidden `_gotcha` field — do not fill it).
3. Click **Send Message** (`contact-section_submit-btn`). _Expected:_ the button shows a
   loading state, then the section swaps to a **success view**: a green Send icon, "Message
   Sent!", a thank-you line, and a **Send Another Message** button (which resets the form to
   idle). No `contact-section_error`.
4. **Contact info** column: email link (`contact-section_email-link`, `mailto:`), phone link
   (`contact-section_phone-link`, `tel:`, displayed formatted as "(XXX) XXX-XXXX"), a
   location line, and a `LocationMap`.

---

## Workflow 4.3 — Contact form edge cases

- **EC-1 Missing required fields:** submit with Name/Email/Message empty.
  _Expected:_ native required-field validation blocks submit; fields marked
  `aria-required`; no request sent.
- **EC-2 Invalid email:** enter `not-an-email`, submit. _Expected:_ email validation blocks
  submit (or the server returns a validation error surfaced in `contact-section_error`,
  `role="alert"`, `aria-live="assertive"`, with fields marked `aria-invalid`).
- **EC-3 Server validation error:** if the API returns `VALIDATION_FAILED`, the joined field
  errors show in `contact-section_error`. Verify the message is human-readable, not a raw
  code.
- **EC-4 Honeypot (spam):** if the hidden `_gotcha` field is filled (simulating a bot), the
  submission should be silently rejected/treated as spam. You can force this via
  `page.evaluate` to set the hidden input's value, then submit — _Expected:_ it does **not**
  succeed as a normal message. (Optional; note the observed behavior.)
- **EC-5 Network failure:** with the API down, submit → _Expected:_ a generic "Failed to
  send message" error in `contact-section_error`; the form remains editable. Restart the
  Worker after.
