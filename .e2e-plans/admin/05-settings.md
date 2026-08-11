# Admin E2E — 05 · Settings

> Prerequisite: read `00-conventions.md` and be logged in. Settings has several tabs; two
> of them (**Users**, **Security**) are **OWNER-only**. Honor §5 (self-contained): record
> original values before editing and restore them after.

**Route:** `/settings` (`settings-page`). Tabs live in `settings-page_tab-nav`; content in
`settings-page_tab-content`. Save success shows a role="status" toast ("Content saved
successfully!", auto-dismiss ~3 s); save failure shows `settings-page_save-error`.

**Tabs (`settings-page_tab-<name>`):** `admin` (Admin Config), `site` (Site Content),
`process` (Process), `testimonials` (Testimonials), `categories` (Categories),
`users` _(OWNER-only)_, `security` _(OWNER-only)_.

---

## Workflow 5.1 — Tab visibility by role (happy path)

1. Go to `/settings`. _Expected:_ the tab nav shows Admin Config, Site Content, Process,
   Testimonials, Categories.
2. **If logged in as OWNER:** the **Users** (`settings-page_tab-users`) and **Security**
   (`settings-page_tab-security`) tabs are also present.
3. **If logged in as a non-OWNER** (ask the user for a second account, if available): the
   Users and Security tabs must be **absent/hidden**. If a lower role can see or open them,
   file a `major` issue (UX gate leak — note the server still enforces access).

---

## Workflow 5.2 — Site Content tab

1. Open **Site Content** (`settings-page_tab-site`) → `site-content-tab`.
2. This manages business name, logo, tagline, about text/images, and nav links. Change one
   easily-reversible field (e.g. tagline). **Record the original value first.**
3. Click **Save** (`settings-page_save-site-btn`). _Expected:_ success toast; the change
   persists on reload. Cross-check by loading the **storefront** home page — the storefront
   reads the same `/settings/site` data (see `web/`), so the tagline/business name there
   should reflect your edit.
4. **Cleanup:** restore the original value and Save again.

- **EC:** enter an invalid value where validated (e.g. a malformed logo URL) → expect a
  save error rather than a silent corrupt save.

---

## Workflow 5.3 — Process tab

1. Open **Process** (`settings-page_tab-process`) → `process-tab`. This manages the
   hive-to-table process steps (title, description, icon, order).
2. Click **Add** (`process-tab_add-btn`) to add a step; fill fields; **Save**
   (`settings-page_save-process-btn`). _Expected:_ success toast; the storefront `/about`
   page's Process section reflects the new/changed step.
3. Reorder or edit a step; Save. Verify order is respected on the storefront.
4. **Cleanup:** remove any step you added and restore original ordering; Save.

---

## Workflow 5.4 — Testimonials tab

1. Open **Testimonials** (`settings-page_tab-testimonials`). Manages name, location,
   rating (1–5), text, date.
2. Add a testimonial; **Save** (`settings-page_save-testimonials-btn`). _Expected:_ success
   toast; appears on the storefront home Testimonials section with the correct star count.
3. **EC:** rating outside 1–5, or missing required fields → expect validation.
4. **Cleanup:** delete the added testimonial; Save.

---

## Workflow 5.5 — Categories tab

1. Open **Categories** (`settings-page_tab-categories`). Manages the category list
   (id + label) used by products and storefront filters.
2. Add a category; **Save** (`settings-page_save-categories-btn`). _Expected:_ success
   toast; the new category appears in the product form's category select
   (`product-form-dialog_select-category`) and in the storefront's category filter.
3. **EC:** duplicate id, or empty label → expect validation/rejection.
4. **Cleanup:** remove the added category (ensure no product references it first); Save.

---

## Workflow 5.6 — Admin Config tab

1. Open **Admin Config** (`settings-page_tab-admin`). Change a reversible setting; **Save**
   (`settings-page_save-admin-config-btn`). _Expected:_ success toast; setting persists.
2. **Cleanup:** restore original; Save.

---

## Workflow 5.7 — Users tab (OWNER-only)

**As the owner, I want to invite and manage staff.** Skip entirely if not OWNER.

1. Open **Users** (`settings-page_tab-users`) → `users-tab`. _Expected:_ while loading you
   may see `users-tab_loading`; on error `users-tab_fetch-error` with a retry
   (`users-tab_retry-btn`). On success, a list of user rows (`users-tab_row-<email>`) each
   showing email, display name, a **role** select (`users-tab_role-<email>`), a **status**
   badge (INVITED / ACTIVE / DISABLED), a **Reinvite** button (`users-tab_reinvite-<email>`
   for invited users), and a **Delete** button (`users-tab_delete-<email>`).
2. **Invite (happy path):** in the invite form (`users-tab_invite-form`) enter a test email
   like `e2e-invitee@example.test`, pick a role, optionally a display name, click **Invite**
   (`users-tab_invite-btn`).
   - _Expected:_ a success banner; a new row appears with status **INVITED**. (The invite
     email can't be received locally; if the user can retrieve the token, you can complete
     `01-auth.md` Workflow 1.6's accept-invite happy path with it.)
3. **Change a role:** for a non-owner test user, change `users-tab_role-<email>`.
   _Expected:_ persists; restore afterward.
4. **Reinvite:** click `users-tab_reinvite-<email>` on an invited user → success flash
   (`users-tab_reinvite-flash`).
5. **Delete (cleanup):** delete the `e2e-invitee` you created (`users-tab_delete-<email>`).
   _Expected:_ row disappears. **Do not delete real staff or the only OWNER.**
6. **EC — invalid invite email:** enter a malformed email → `users-tab_invite-email-error`.
7. **EC — empty list:** if no users, `users-tab_empty` shows.
8. **Regression / safety:** deleting/demoting the **last active OWNER** should be prevented
   by the server — do not attempt this on the account you're logged in with. If the UI
   allows it and it locks you out, that's a `blocker` issue.

---

## Workflow 5.8 — Security tab (OWNER-only)

**As the owner, I want to set the password policy.** Skip if not OWNER.

1. Open **Security** (`settings-page_tab-security`) → `security-tab`. On load you may see
   `security-tab_loading`; on error `security-tab_fetch-error` + `security-tab_retry-btn`.
2. Fields:
   - **Minimum length** (`security-tab_min-length`) — default 12.
   - **Check breach corpus** (`security-tab_check-breach-corpus`) — HIBP check on submit.
   - **Notify on change** (`security-tab_notify-on-change`) — reserved/unused.
   - **Metadata** (`security-tab_metadata`) — free-form JSON.
3. **Record originals.** Change min length to, say, 14; **Save** (`security-tab_save-btn`).
   _Expected:_ `security-tab_save-success`.
4. **Verify the policy takes effect:** open a password field elsewhere (e.g. the Change
   Password modal, `01-auth.md` 1.4) — the length hint (`password-field_hints`) should now
   read "At least 14 characters", and the denylist hint should be present. If breach corpus
   is on, the breach-check hint appears.
5. **EC — invalid min length:** set a nonsensical value (e.g. 0 or non-numeric) → expect
   `security-tab_min-length-error`; save blocked.
6. **EC — invalid metadata JSON:** enter malformed JSON → expect a save error, not a silent
   accept.
7. **Cleanup:** restore all original values (min length back to 12, toggles as they were);
   Save.

> Changing the policy affects **all** password validation. Always restore it, and warn the
> user if you set a value that could inconvenience real logins.
