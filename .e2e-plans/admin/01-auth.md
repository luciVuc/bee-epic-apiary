# Admin E2E — 01 · Authentication

> Prerequisite: read `00-conventions.md`. This file covers login, logout, session
> protection, and the bootstrap / invite / password-reset flows. Do the **Happy paths**
> first, then **Edge cases**. Report deviations per §7 of the conventions.

**Routes covered:** `/login`, `/bootstrap`, `/accept-invite?token=…`, `/request-reset`,
`/reset?token=…`, plus the protected-route redirect and logout.

---

## Workflow 1.1 — Log in (happy path)

**As an admin, I want to sign in and reach the dashboard.**

1. Open `http://localhost:5174/`. Because you are not authenticated, you should be
   redirected to **`/login`** and see the login form (`login_form`).
   - _Expected:_ URL is `/login`; you see an email field, a password field with a
     show/hide toggle (`password-field_toggle`), and a **Sign in** button (`login_submit`).
     A "Forgot your password?" link points to `/request-reset`.
2. Type the user-provided email into the email input (`login_email-input`).
3. Type the password into the password field.
4. (Optional a11y) Click `password-field_toggle` → the password becomes visible; click
   again → masked.
5. Click **Sign in** (`login_submit`).
   - _Expected:_ You are redirected to **`/dashboard`** (or back to the page you first
     requested). The admin chrome (navbar + sidebar) is visible. No `login_error` shown.

**Regression check:** visiting `/` while authenticated should land you on `/dashboard`
(root redirects), not leave you on a blank `/`.

---

## Workflow 1.2 — Login validation & failures (edge cases)

Run each from a fresh `/login`.

- **EC-1 Empty submit:** Click **Sign in** with both fields blank.
  _Expected:_ the browser's native `required` validation blocks submission (fields are
  `required`); no network request is sent.
- **EC-2 Wrong password:** Enter the valid email + a wrong password, submit.
  _Expected:_ `login_error` (role="alert") shows **"Invalid email or password."** The
  message must **not** reveal whether the email exists (anti-enumeration). You remain on
  `/login`.
- **EC-3 Unknown email:** Enter a made-up email + any password, submit.
  _Expected:_ identical **"Invalid email or password."** message (same as EC-2 — this is
  intentional). If the two messages differ, file an issue (enumeration leak).
- **EC-4 Rate limiting:** Submit wrong credentials repeatedly (the server allows ~5
  attempts per email+IP per 15 min). After the limit:
  _Expected:_ `login_error` shows **"Too many attempts. Please try again in a few
  minutes."** _(This is destructive to the rate-limit budget — only run if the user
  approves, and note that it may lock the account's login for ~15 min.)_
- **EC-5 Disabled account:** If the user provides a DISABLED account, logging in
  _Expected:_ also collapses to **"Invalid email or password."** (no distinct "disabled"
  message).

---

## Workflow 1.3 — Protected routes & logout

1. While logged in, note you can reach `/dashboard`, `/products`, `/orders`, `/settings`.
2. Open the user menu (`user-menu_trigger`) in the navbar. It should show your role
   (`user-menu_role`) and a dropdown (`user-menu_dropdown`) with **Edit Name**, **Change
   Password**, and **Logout**.
3. Click **Logout** (`user-menu_logout`).
   - _Expected:_ session cookies are cleared and you are returned to `/login`.
4. **EC-1 Deep link while logged out:** Now navigate directly to `/settings`.
   - _Expected:_ redirected to `/login`; after logging back in you are returned to
     `/settings` (the guard preserves the intended destination).
5. **EC-2 Loading/edge:** During the auth check you may briefly see
   `require-caller_loading`. If the auth check errors, `require-caller_error` shows —
   report it if it appears under normal conditions.

---

## Workflow 1.4 — Edit display name & change password (user menu)

1. Open `user-menu_trigger` → click **Edit Name** (`user-menu_edit-name`).
2. A text input appears (`user-menu_edit-input`). Change the name, click Save
   (`user-menu_edit-save`).
   - _Expected:_ name updates in the menu; no `user-menu_edit-error`.
   - **Cleanup:** restore the original name afterward.
   - **EC:** clear the name and Save → expect a validation error in `user-menu_edit-error`;
     Cancel (`user-menu_edit-cancel`) restores the original.
3. Open `user-menu_trigger` → **Change Password** (`user-menu_change-password`). The
   `change-password_modal` opens with **Current**, **New**, and **Confirm** password
   fields (the New field shows the policy hints).
   - **EC-1 Mismatch:** New ≠ Confirm → submit (`change-password_submit`) shows
     `change-password_error`.
   - **EC-2 Weak password:** enter a denylisted password (e.g. `password123`) → expect a
     weak-password error listing reasons.
   - **EC-3 Wrong current:** correct new/confirm but wrong current password → expect an
     error, no change.
   - **Happy path (only if the user OKs changing the real password):** valid current +
     strong matching new → `change-password_success` (role="status"), modal closes.
     **Immediately change it back** (or have the user do so) so the provided credentials
     keep working. If the user declines, run only the edge cases above and Cancel
     (`change-password_cancel`).
   - (a11y) Focus should be trapped in the modal and return to the trigger on close.

---

## Workflow 1.5 — Password reset request (`/request-reset`)

1. From `/login`, click **"Forgot your password?"** → you land on `/request-reset` with
   `request-reset_form`.
2. Enter any email in `request-reset_email-input`, click `request-reset_submit`.
   - _Expected:_ `request-reset_success` (role="status") shows **"If an account with that
     email exists, we've sent a reset link."** — shown for **any** email (anti-enumeration).
   - **EC:** submit a non-existent email → identical success message. Differing behavior is
     an enumeration leak → file an issue.
3. "Back to sign in" returns to `/login`.

> The actual reset email cannot be received in local testing. To exercise
> `/reset?token=…`, the user must supply a valid token, or you skip the completion step
> and only verify the no-token guard (below).

---

## Workflow 1.6 — Complete reset (`/reset`) & accept invite (`/accept-invite`)

These pages take an opaque `token` from an email. Test the **no-token guards** always;
test the **happy path only if the user supplies a valid token**.

- **Complete reset — no token:** open `/reset` with no query string.
  _Expected:_ `complete-reset_no-token` alert (role="alert"); no form submission possible.
- **Complete reset — with token (if provided):** open `/reset?token=<valid>`, fill New +
  Confirm password (must match, must satisfy policy), submit (`complete-reset_submit`).
  _Expected:_ redirect to `/dashboard?reset=complete`; all **other** sessions for that user
  are invalidated server-side.
- **Accept invite — no token:** open `/accept-invite`.
  _Expected:_ `accept-invite_no-token` alert.
- **Accept invite — invalid/expired token:** open `/accept-invite?token=bogus`, set a
  password, submit (`accept-invite_submit`).
  _Expected:_ `accept-invite_error` — "This invitation link is invalid or has expired. Ask
  your administrator to send a new one."
- **Accept invite — weak password:** with a (valid) token, enter a denylisted password.
  _Expected:_ `accept-invite_error` renders a `<ul>` of specific reasons.
- **Accept invite — happy path (if valid token):** strong matching passwords → redirect to
  `/dashboard`, session cookies set. (You can generate a real invite via the OWNER Users
  tab — see `05-settings.md` — then use the token if the user can retrieve it.)

---

## Workflow 1.7 — Bootstrap owner (`/bootstrap`)

The bootstrap flow only appears when **no active OWNER exists** (a fresh install). On a
normal environment an OWNER already exists, so `/bootstrap` auto-redirects to `/login`.

- **Guard behavior (normal env):** navigate to `/bootstrap`.
  _Expected:_ `BootstrapGuard` checks the server; because an OWNER exists it redirects you
  to `/login`. You may briefly see `bootstrap-guard_loading`.
- **Happy path (only on a truly fresh env with no OWNER):** the guard keeps you on
  `/bootstrap` showing `bootstrap-owner_form`. Enter an allow-listed owner email
  (`bootstrap-owner_email-input`) and submit (`bootstrap-owner_submit`).
  _Expected:_ `bootstrap-owner_success` with the copy: _"Check your email for the setup
  link. If you don't see it within a few minutes, check spam or ask your hosting provider
  about email delivery."_ No auto-redirect (owner completes setup via the emailed invite).
- **EC — race:** if another admin bootstraps first, submitting shows a `BOOTSTRAP_DISABLED`
  alert with a link to `/login`.

> If you cannot reach a fresh-install state, verify only the guard redirect and note that
> the full bootstrap happy path was not testable in this environment.
