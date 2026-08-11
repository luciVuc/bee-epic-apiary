# Admin E2E — Conventions & Setup (READ FIRST)

> **You are an AI agent testing the Admin panel through a real browser using Playwright.**
> You have no prior knowledge of the codebase. Act like a careful store administrator
> clicking through the app. Follow each workflow file step by step. When something does
> not match the **Expected result**, stop and **file an issue** (see §7) with a suggested
> fix, then continue with the remaining independent steps.

---

## 1. What this app is

The **Admin panel** is a React single-page app used by store staff and the owner to run
an online honey/apiary shop. It provides:

- **Authentication** (email + password, JWT session cookies) with bootstrap, invite, and
  password-reset flows.
- A **Dashboard** with live order/product stats.
- **Products** — full CRUD backed by Stripe (create, view, edit, delete, bulk cleanup).
- **Orders** — list, filter, view detail, change fulfillment status.
- **Settings** — site content, process steps, testimonials, categories, and (OWNER-only)
  user management and password/security policy.

All data is served by a Cloudflare Worker API. There is **no traditional database**; data
lives in Cloudflare KV behind the Worker.

---

## 2. Environment & how to start it

**Prerequisites:** Node.js 18+, the `services/` Cloudflare Worker running on port 8787.

```bash
# From the repo root, in three terminals (or use the services combined dev script):

# 1. Backend API (Cloudflare Worker) — REQUIRED
cd services && npm install && npm run dev        # serves http://localhost:8787

# 2. Admin app
cd admin && npm install && npm run dev            # serves http://localhost:5174
```

> **Note on notifications:** New-order events and the live SSE indicator only fire locally
> if Stripe webhooks are being forwarded (`cd services && npm run dev:webhooks`). Without
> it, orders will not spontaneously appear as "new". This is expected locally — do not
> report it as a bug unless the user asked you to test webhook forwarding.

### URLs

| Environment           | URL                     |
| --------------------- | ----------------------- |
| Admin app (local dev) | `http://localhost:5174` |
| API (services Worker) | `http://localhost:8787` |

### Environment variables (in `admin/.env`)

| Variable                      | Purpose                                  |
| ----------------------------- | ---------------------------------------- |
| `VITE_API_URL`                | API base URL (`http://localhost:8787`)   |
| `VITE_STRIPE_PUBLISHABLE_KEY` | Stripe publishable key for payment links |

---

## 3. Authentication (IMPORTANT)

This app **requires login**. All routes under `/` (dashboard, products, orders, settings)
are protected by a `RequireCaller` guard that redirects unauthenticated visitors to
`/login`.

**You must obtain credentials from the user before testing.** Do **not** guess, brute
force, or reuse credentials from another environment. Ask:

> "The admin panel requires login. Please provide the email and password for a test
> account, and tell me its role (OWNER or a staff role). OWNER is needed to test the
> Users and Security settings tabs."

- Session is held in **HTTP-only cookies** (`bea_at` access token, `bea_rt` refresh
  token). You do not manage tokens manually — logging in through the UI is enough, and
  the browser sends the cookies automatically on later requests.
- The API auto-refreshes an expired access token on a 401 and retries once. A brief
  re-auth round trip is normal; a redirect back to `/login` mid-session is **not** —
  report it.

### Roles (highest → lowest)

`OWNER > MANAGER > EMPLOYEE > VENDOR`. Role gating in the UI is UX-only (the server is the
real boundary), but you should still verify OWNER-only controls are **hidden/absent** for
lower roles when a non-OWNER account is provided.

---

## 4. Testing configuration

### 4.1 Viewport & responsive breakpoints

Default viewport: **1280×720**. Run the **happy path of every workflow** at these
breakpoints unless the user opts out:

| Breakpoint | Viewport   | Focus                                                     |
| ---------- | ---------- | --------------------------------------------------------- |
| Desktop    | `1280x720` | Full layout, always-visible sidebar, product table view   |
| Tablet     | `768x1024` | Sidebar collapse/toggle, adjusted grids, touch targets    |
| Mobile     | `375x812`  | Hamburger menu + overlay, card layout for products/orders |

At each breakpoint verify: no horizontal scrollbar, no overflowing/truncated text, no
overlapping elements, all controls tappable, navigation adapts (hamburger on mobile),
images scale without distortion. Capture a full-page screenshot. Edge cases may be run at
desktop only unless the edge case is itself about responsive behavior.

### 4.2 Selectors — prefer `data-testid`

This app is **richly instrumented with `data-testid` attributes**. Always prefer them.

**Selector priority:** `data-testid` > ARIA role/label > visible text > CSS class.

Naming patterns you will see:

| Pattern                                    | Example                                 |
| ------------------------------------------ | --------------------------------------- |
| `{page}-page`                              | `dashboard-page`, `products-page`       |
| `{page}_{region}`                          | `products-page_toolbar`                 |
| `{context}_{action}-btn` / `_submit`       | `products-page_add-btn`, `login_submit` |
| `{context}_input-{field}` / `_email-input` | `product-form-dialog_input-name`        |
| dynamic rows: `{list}_{kind}-${id}`        | `users-tab_row-jane@x.io`               |

If a `data-testid` referenced in a workflow is **missing** from the DOM, that is itself a
finding — file an issue (the app may have regressed or the plan may be stale) and fall
back to a role/text selector to continue.

### 4.3 Timeouts

| Action                            | Timeout  |
| --------------------------------- | -------- |
| Page navigation / initial load    | 15000 ms |
| API-backed content (lists, stats) | 10000 ms |
| Element visible after click       | 5000 ms  |
| Search/filter debounce settle     | 500 ms   |
| Toast/success message appears     | 3000 ms  |

Search and filter inputs debounce at **300 ms** before firing a request — wait ~500 ms
after typing before asserting results.

### 4.4 Retry strategy

Retry a **read-only** assertion up to 2× with a 1 s pause (covers animation/async settle).
**Never** retry a **mutating** action (create/edit/delete, invite, save) — a failed
mutation may have partially applied; report it and inspect state instead of re-clicking.

---

## 5. Self-contained testing principle

Any data you create during testing you must **clean up**. Concretely:

- A product you create → **edit** it (to test edit), then **delete** it (to test delete
  and to leave the store clean). Prefix test product names with `E2E TEST –` so they are
  obvious.
- A user you invite → **delete** the invite when done.
- Settings you change → **restore** the original value (record it before editing).

Never leave `E2E TEST` artifacts behind. If cleanup fails, file an issue.

---

## 6. Accessibility checks (if enabled by the user)

At key steps: run an aXe-style scan (no critical violations), verify focus is trapped in
open modals/drawers and returns to the trigger on close, verify all icon-only buttons have
an `aria-label`, and verify keyboard-only operation (Tab/Enter/Escape) of forms and menus.

---

## 7. Issue reporting (how to report problems + suggest fixes)

When actual behavior ≠ Expected result, **do not silently continue**. Create one Markdown
file per issue in `.issues/` at the repo root (git-ignored; a handoff artifact for a
coding agent). Name it `admin-<workflow>-<kebab-description>.md`. Use this format:

```markdown
---
title: "[Admin · <Workflow>] <brief issue description>"
app: admin
workflow: "<workflow file / name>"
step: <step number>
severity: blocker | major | minor | cosmetic
date: "<YYYY-MM-DD>"
---

## What I was doing (user's perspective)

<Plain-language: "As an admin, I was trying to …">

## Steps to reproduce

1. …
2. …
3. … (the failing step)

## What happened

<Actual behavior: error text, wrong state, missing element, console error.>

## What I expected

<Per the plan's Expected result.>

## Evidence

- Screenshot: <path to saved Playwright screenshot at moment of failure>
- URL: <url where it happened>
- Viewport: <e.g. 1280x720>
- Console errors: <any console.error / failed network requests, with status codes>

## Suggested fix or improvement

<Your best hypothesis about the cause and a concrete fix. Reference the likely file/area
if you can infer it (e.g. "the ProductFormDialog submit handler likely isn't validating
price > 0"). If it's a UX/clarity problem rather than a bug, suggest the improvement.>
```

**Severity guide:** `blocker` = cannot proceed / data loss / auth broken; `major` =
feature broken but workaround exists; `minor` = wrong text/state, non-blocking; `cosmetic`
= visual/copy only.

Also always report, even if non-blocking: **console errors**, **failed network requests
(4xx/5xx)**, **missing `data-testid`s** referenced by the plan, and **accessibility
violations**.

---

## 8. Pre-flight questions for the user

Ask these and wait for answers before executing any workflow:

1. **Credentials & role:** "What email/password should I use, and what is the account's
   role (OWNER or staff)? OWNER is required for the Users and Security settings tabs."
2. **Scope:** "Which workflows should I run — all of them, or specific files (auth,
   dashboard, products, orders, settings, navigation)?"
3. **Responsive:** "Run responsive checks at all three breakpoints, or desktop only?"
4. **Screenshots:** "Capture a screenshot at each step, or only on failures?"
5. **Accessibility:** "Run accessibility checks (aXe + keyboard nav), or skip them?"
6. **Mutations & cleanup:** "OK to create/edit/delete `E2E TEST` products and test
   invites? I will clean them up afterward. Should I avoid touching real orders?"
7. **Issue handling:** "For any problem I find, I'll write an issue file to `.issues/`
   with a suggested fix. Is that what you want, or should I just report inline?"
