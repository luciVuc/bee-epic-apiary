# Phase 10 — Admin SPA auth (expansion)

**Date:** 2026-07-05
**Author:** Lucian Vuc (via Claude)
**Parent plan:** `docs/superpowers/plans/2026-06-30-admin-auth-refactor.md`
**Spec source of truth:** `docs/superpowers/specs/2026-06-29-admin-auth-refactor-design.md` §Admin app components (lines 460–557)

This document expands the 15 subtasks from Phase 10 of the parent plan to the same task-by-task level of detail used for Phases 1–2 and the Phase 8 and Phase 9 expansions. It reconciles the design spec against the admin SPA's current state (as of commit `e3a65ca` on `feat/admin-auth-refactor`) and locks in file paths, contracts, and TDD flows for downstream subagents.

---

## Current admin state (as of commit `e3a65ca`)

- **Router:** `admin/src/App.tsx` (31 lines) — a single top-level `<Routes>` block, all routes under `<AdminLayout />`. **No public routes exist.** Everything renders behind `RequireCaller` via `AdminLayout`.
- **RequireCaller:** `admin/src/components/auth/RequireCaller.tsx` — renders loading / error / "not authenticated" placeholder / children. Uses `useCaller` hook. **Never redirects** — the CF Access-era assumption was "the browser can't even load this page if you're not authorized."
- **useCaller:** `admin/src/hooks/useCaller.ts` — mounts, dispatches `fetchCaller` thunk (from `authSlice`), returns `{caller, status, refetch}`.
- **authSlice:** `admin/src/store/authSlice.ts` (60 lines) — `{caller, status, error}` with a single `fetchCaller` thunk and a `resetAuth` reducer. No login/logout/refresh thunks yet.
- **api.ts:** `admin/src/utils/api.ts` (387 lines) — axios client with `withCredentials: true`, a dev-only `X-Dev-Email` request interceptor (lines 58–68), an `unwrap` envelope helper, `ApiError` class, and a fat `api` object with per-endpoint methods. Includes `getWhoami` at line 149. **No 401-refresh interceptor.**
- **Settings page:** `admin/src/pages/SettingsPage.tsx` — tab strip renders `AdminConfigTab`, `SiteContentTab`, `ProcessTab`, `TestimonialsTab`, `CategoriesTab`, `StaffTab`. `StaffTab` still targets the deleted `/settings/staff` route (dead client-side after Phase 9.4).
- **cookieScope:** `admin/src/utils/cookieScope.ts` — pre-existing eTLD+1 warn used by api.ts boot. Reused in Phase 10.
- **Test infra:** RTL + Vitest configured; existing specs for `RequireCaller`, `authSlice`, `api`, `cookieScope`, plus slice tests.

## Reconciled deltas against the spec

Where the spec (2026-06-29) said one thing and the current code has drifted, this doc records the reconciliation up-front so no subagent has to guess:

1. **`RequireCaller` is a placeholder today, not a redirector.** Task 10.6 rewrites it to `<Navigate to="/login" replace state={{from: location}} />` on `status === 'succeeded' && caller === null`. The existing loading/error UIs stay.
2. **`useCaller`'s `refetch` helper is preserved.** The spec doesn't mention it; the interceptor uses `resetAuth` (not `refetch`) to force a re-probe on refresh failure. Task 10.7 leaves the hook interface unchanged.
3. **`fetchCaller` becomes the boot probe AND the `/whoami` reader.** The response shape now includes optional `bootstrapAvailable: boolean` (Phase 9.5). Task 10.7 extends the slice's success reducer to store that flag; Task 10.5 uses it as the bootstrap gate.
4. **`X-Dev-Email` server contract is preserved.** Phase 9 kept the server-side dev bypass gated on `ENVIRONMENT=development`. Phase 10.12 removes only the **admin-side** interceptor — CI, scripts, and manual curl still work.
5. **CSRF:** The design predates a CSRF decision; the current server contract accepts cookie auth only when `Origin` is in `ALLOWED_ORIGINS`. No CSRF token in Phase 10. If a future review adds one, it slots into `api.ts` as a new request interceptor and is out of scope here.
6. **`cookieScope` warning stays.** Its message text is now stale ("CF Access cookies" → "auth cookies"); Task 10.9 rewrites the copy but keeps the warning gate.
7. **`VITE_DEV_EMAIL`:** The variable itself remains readable by tests during Phase 10 (a few of them consult `import.meta.env.DEV`); Task 10.12 only removes the interceptor that forwards it. Full env-var deletion + doc updates are Phase 11.12.

---

## Task list

Each task ends at green tests + green lint + green typecheck. Every task is TDD: failing test first, minimal code to green, commit. Every task ends with the subagent-driven-development two-stage review (spec compliance → code quality).

### 10.0 — This expansion doc (in progress)

- Commit and mark complete when the file is written.

### 10.1 — `LoginPage.tsx`

**Files:**

- Create `admin/src/pages/LoginPage.tsx`
- Create `admin/src/pages/__tests__/LoginPage.test.tsx`

**Contract:**

- Form: `<label>Email</label>`, `<label>Password</label>`, `type="submit"` "Sign in". Autofocus the email field on mount.
- Submits `POST /auth/login` via a new `api.login({email, password})` method (added in Task 10.10).
- Success: `navigate(location.state?.from ?? '/dashboard', {replace: true})`.
- Errors:
  - `INVALID_CREDENTIALS` OR `ACCOUNT_DISABLED` → generic "Invalid email or password." (do not distinguish; per spec §Pages line 531 — no user enumeration surface).
  - `RATE_LIMITED` → "Too many attempts. Please try again in a few minutes."
  - Any other → `apiErrorMessage(err, 'Sign in failed')`.
- Link: `<Link to="/request-reset">Forgot your password?</Link>`. No sign-up link.
- Wraps children in a plain full-viewport centered layout (does NOT render inside `AdminLayout`). The parent `App.tsx` (Task 10.11) mounts it OUTSIDE `RequireCaller`.

**Test cases (minimum):**

1. Renders email + password + submit + forgot-password link; email is autofocused.
2. Submitting empty form does not call the API (native `required` validation OR client validation — pick native for parity with existing forms in `admin/src/components/forms/`).
3. Successful login calls `api.login` with trimmed lowercase email and calls `navigate('/dashboard', {replace: true})`.
4. `INVALID_CREDENTIALS` and `ACCOUNT_DISABLED` both render the identical generic error.
5. `RATE_LIMITED` renders the retry-after copy.
6. When `location.state.from` is set (e.g. `{pathname: '/orders/xyz'}`), successful login navigates there instead of `/dashboard`.
7. Submit button is disabled while `loginInFlight` is true.

**Mocks:** vi.mock `../utils/api` and `react-router-dom` `useNavigate`/`useLocation`.

**Model:** cheap (mechanical form + wired thunk).

---

### 10.2 — `AcceptInvitePage.tsx`

**Files:**

- Create `admin/src/pages/AcceptInvitePage.tsx`
- Create `admin/src/pages/__tests__/AcceptInvitePage.test.tsx`

**Contract:**

- Reads `?token=` from the URL via `useSearchParams`.
- On mount, calls `api.getAuthPolicy()` (new method — Task 10.10) to render min-length + breach-check hints inline. If policy fetch fails, still render the form with a default-hint fallback ("Password must be at least 12 characters.") — do not block.
- Two password fields: "New password" + "Confirm password". Client-side confirm-match; on mismatch surface inline before submit.
- Submits `POST /auth/accept-invite` with `{token, password}`. Sets `bea_at` / `bea_rt` cookies server-side.
- Success: `navigate('/dashboard', {replace: true})`.
- Errors:
  - `INVALID_TOKEN`, `EXPIRED_TOKEN` → "This invitation link is invalid or has expired. Ask your administrator to send a new one."
  - `WEAK_PASSWORD` → surface `err.apiError.reasons[]` verbatim as a `<ul>` under the field.
  - other → fallback message via `apiErrorMessage`.
- Uses `PasswordField` (Task 10.14) once it exists — until then, plain `<input type="password">`. Cross-task dependency noted; Task 10.14 lands before this or as part of a review-fix.

**Test cases:**

1. Missing `?token` → renders "This invitation link is invalid." without calling the API.
2. Renders policy hints (min length) when `getAuthPolicy` resolves.
3. Falls back to default hint when `getAuthPolicy` rejects.
4. Confirm-mismatch shows inline error, does NOT call the API.
5. Successful accept navigates to `/dashboard`.
6. `WEAK_PASSWORD` with reasons `['too_short','pwned']` renders both in a list.
7. `EXPIRED_TOKEN` renders the invalid-link copy.

**Model:** cheap.

---

### 10.3 — `RequestResetPage.tsx`

**Files:**

- Create `admin/src/pages/RequestResetPage.tsx`
- Create `admin/src/pages/__tests__/RequestResetPage.test.tsx`

**Contract:**

- Single email field, submit button.
- Submits `POST /auth/request-reset` via `api.requestReset({email})` (Task 10.10). Server always returns 200 regardless of email existence — do not surface any distinction.
- On any 2xx result: render "If an account with that email exists, we've sent a reset link." and hide the form. The literal copy comes from spec §Pages line 533.
- On network / envelope failure: render `apiErrorMessage(err, 'Request failed. Please try again.')` — do NOT surface the always-200 success text on error.
- No auto-redirect.

**Test cases:**

1. Submits and shows the exact success copy.
2. Hides the form after successful submit.
3. Network failure shows the fallback error, form remains editable.
4. Trims and lowercases email before POSTing.

**Model:** cheap.

---

### 10.4 — `CompleteResetPage.tsx`

**Files:**

- Create `admin/src/pages/CompleteResetPage.tsx`
- Create `admin/src/pages/__tests__/CompleteResetPage.test.tsx`

**Contract:**

- Mirrors 10.2's shape: reads `?token=`, fetches policy for hints, two-field form, submits `POST /auth/complete-reset` with `{token, password}`.
- Server contract per Phase 7: on success clears the refresh family (all sessions logged out) and returns a fresh `bea_at` cookie for the current session.
- Success: `navigate('/dashboard', {replace: true})` with a toast/banner "Password updated. All other sessions have been logged out." — pick whichever notification pattern already exists in `admin/src/components/shared/`; if none, use a query-string flag `?reset=complete` on the destination and let `DashboardPage` render a one-time banner. **Prefer** the simpler flag approach if inspection shows no toast primitive already exists.
- Error taxonomy identical to 10.2.

**Test cases:** mirror 10.2 with the reset endpoint substituted; add one case asserting the post-success banner surface (either toast call or `?reset=complete` in the target URL).

**Model:** cheap.

---

### 10.5 — `BootstrapOwnerPage.tsx` + `BootstrapGuard`

**Files:**

- Create `admin/src/pages/BootstrapOwnerPage.tsx`
- Create `admin/src/components/auth/BootstrapGuard.tsx`
- Create `admin/src/pages/__tests__/BootstrapOwnerPage.test.tsx`
- Create `admin/src/components/auth/__tests__/BootstrapGuard.test.tsx`

**Contract:**

- `BootstrapOwnerPage`: single email input + "Send setup link" button. Submits `POST /auth/bootstrap-owner` with `{email}`. On success renders "Check your email for the setup link. If you don't see it within a few minutes, check spam or ask your hosting provider about email delivery."
- Errors:
  - `BOOTSTRAP_DISABLED` → "The initial owner has already been claimed. Please sign in instead." with a link to `/login`.
  - other → fallback message.
- `BootstrapGuard`: read-only route wrapper. Reads `state.auth.bootstrapAvailable` (populated by `fetchCaller` — Task 10.7 change). If null/undefined (probe hasn't fired), dispatches `fetchCaller()` and renders a spinner. If `false`, `<Navigate to="/login" replace />`. If `true` OR route already `/bootstrap`, render children.
- Also wraps `LoginPage`: on the login page, if `bootstrapAvailable === true`, redirect to `/bootstrap`. This means `App.tsx` Task 10.11 wraps `/login` and `/bootstrap` in the same guard, but the guard's redirect direction depends on the current path.

Concretely the guard is one component with two branches:

```
if (path === '/bootstrap' && bootstrapAvailable === false) → Navigate('/login')
if (path === '/login'     && bootstrapAvailable === true ) → Navigate('/bootstrap')
otherwise render children
```

**Test cases (page):**

1. Renders email input + submit.
2. Success renders the check-your-email copy and hides the form.
3. `BOOTSTRAP_DISABLED` renders the "already claimed" copy + link.

**Test cases (guard):**

1. When `bootstrapAvailable === null` and status is `idle`, dispatches `fetchCaller` and renders a spinner.
2. When on `/bootstrap` and `bootstrapAvailable === false`, redirects to `/login`.
3. When on `/login` and `bootstrapAvailable === true`, redirects to `/bootstrap`.
4. When flag matches route intent, renders children.

**Model:** standard (routing logic + slice interaction).

---

### 10.6 — Rewrite `RequireCaller.tsx` as a redirector

**Files:**

- Modify `admin/src/components/auth/RequireCaller.tsx`
- Modify `admin/src/components/auth/__tests__/RequireCaller.test.tsx`

**Contract:**

- Loading (`idle` | `loading`) branch unchanged (keeps the `data-testid="require-caller_loading"` block).
- Error branch unchanged (keeps `role="alert"` + retry button).
- **Removed:** the "Access required" copy for null caller in dev/CF-Access-off cases.
- **Added:** `succeeded && caller === null` → `<Navigate to="/login" replace state={{from: location}} />` (imports `useLocation` from `react-router-dom`).
- `succeeded && caller` → render children (unchanged).

**Test cases (update existing spec):**

- Keep the loading + error + retry tests unchanged.
- Replace "renders access-required message" with "redirects to /login with state.from when caller is null after probe."
- Keep "renders children when caller is populated."

**Model:** cheap.

---

### 10.7 — Extend `authSlice.ts` with login/logout/refresh/changePassword thunks + `refreshInFlight` mutex

**Files:**

- Modify `admin/src/store/authSlice.ts`
- Modify `admin/src/store/__tests__/authSlice.test.ts`

**State shape (post-task):**

```ts
interface IAuthState {
  caller: ICaller | null;
  status: "idle" | "loading" | "succeeded" | "error";
  error: string | null;
  bootstrapAvailable: boolean | null; // null = unknown, populated by fetchCaller on null caller
  loginInFlight: boolean;
  logoutInFlight: boolean;
  refreshInFlight: boolean; // doubles as the 401-interceptor mutex
}
```

**Thunks:**

- `login({email, password})` → `api.login`. Sets `loginInFlight` around it. On success: sets `caller`, clears `bootstrapAvailable`, sets `status: 'succeeded'`. On failure: rejects with the `ApiError.apiError` shape so components can pattern-match on `code`.
- `logout()` → `api.logout`. Sets `logoutInFlight`. On success or failure: resets caller to null, status to `succeeded`, `bootstrapAvailable` untouched. (Logout should not fail the UX even if the server is unreachable — we still want the client to forget the caller.)
- `refresh()` → `api.refresh`. Sets `refreshInFlight`. On success: leaves caller untouched (the server rotated the cookie). On failure: resets caller to null, status to `succeeded`. The interceptor (Task 10.9) uses `refreshInFlight` as its coalescing gate.
- `changePassword({currentPassword, newPassword})` → `api.changePassword`. Does NOT reset caller on success (server contract: current session survives). Rejects with `apiError` on failure.
- `fetchCaller` (existing) → change payload: return `{caller, bootstrapAvailable?}` and store both. The extraReducer for `.fulfilled` now sets both fields.

**Reducers:**

- `resetAuth` — unchanged public shape, but also clears `bootstrapAvailable` back to `null` and all in-flight flags to false. Called from `logout` on failure and from the interceptor on refresh-failure.

**Test cases (append to existing):**

1. `login.fulfilled` sets caller and clears `bootstrapAvailable`.
2. `login.rejected` sets `error` from `apiError.code`.
3. `logout.fulfilled` and `logout.rejected` both reset caller.
4. `refresh.pending` sets `refreshInFlight: true`; `.fulfilled` clears it; `.rejected` clears it AND resets caller.
5. `changePassword.fulfilled` leaves caller intact.
6. `fetchCaller.fulfilled` with `{caller: null, bootstrapAvailable: true}` populates both fields.
7. `resetAuth` clears `bootstrapAvailable` and all in-flight flags.

**Model:** standard (slice with 4 thunks + interceptor mutex semantics).

---

### 10.8 — `useAuthActions.ts` hook

**Files:**

- Create `admin/src/hooks/useAuthActions.ts`
- Create `admin/src/hooks/__tests__/useAuthActions.test.ts`

**Contract:**

- Returns `{login, logout, refresh, changePassword}` — each a thin `useCallback` wrapper that dispatches the corresponding thunk and returns its unwrapped promise (via `.unwrap()` from RTK).
- Callers (`LoginPage`, `UserMenu`, `ChangePasswordModal`, interceptor) use this hook so component code never touches `useAppDispatch` directly for auth actions.

**Test cases:**

1. `login({email, password})` dispatches the `login` thunk with the payload.
2. Return values propagate: successful thunk → resolved promise; rejected thunk → rejected promise with the same reason.
3. Hook returns a stable reference across renders (each fn wrapped in `useCallback`).

**Model:** cheap.

---

### 10.9 — Add 401-refresh interceptor to `admin/src/utils/api.ts`

**Files:**

- Modify `admin/src/utils/api.ts`
- Modify `admin/src/utils/__tests__/api.test.ts`

**Contract:**

Add an axios response interceptor:

```
on 401 →
  if req.url matches /^\/auth\// → reject as-is (no recursion)
  if store.getState().auth.refreshInFlight → await the in-flight refresh, then re-issue
  else dispatch refresh() thunk; on resolve, re-issue original request; on reject, dispatch resetAuth and reject original error
```

Key details:

- The interceptor imports the store lazily via a getter to avoid a circular dependency between `store/index.ts` and `utils/api.ts`. Pattern: expose `let __store: AppStore | null = null; export function bindStore(s) { __store = s }` from api.ts; `store/index.ts` calls `bindStore(store)` once at construction.
- "Await the in-flight refresh": subscribe to store changes until `refreshInFlight === false`, then check `caller`. If caller is populated, re-issue; else reject.
- Re-issued request must NOT trigger a second refresh loop even if it 401s again — track this by adding a header `X-Retry-After-Refresh: 1` (never sent to origin — stripped before send OR just used as an in-flight marker on the config object). Cleaner: attach a marker to `config` and check for it before entering the refresh branch.
- Update the `cookieScope` warning message: swap "CF Access cookies" → "auth cookies (bea_at, bea_rt)". Keep the warn gate.

**Test cases (append):**

1. 401 on `/products` triggers `refresh` thunk and re-issues the original request.
2. 401 on `/auth/login` is passed through without triggering refresh.
3. Two concurrent 401s only trigger one `refresh` call (coalesce).
4. Refresh failure dispatches `resetAuth` and rejects the original request.
5. A re-issued request that itself 401s does NOT loop — it rejects immediately.
6. `bindStore` wire-up: verify `store/index.ts` calls it.

**Model:** most capable (concurrency semantics + store binding + non-trivial edge cases).

---

### 10.10 — Add new auth API methods to `api.ts`

**Files:**

- Modify `admin/src/utils/api.ts`
- Modify `admin/src/utils/__tests__/api.test.ts`

**New methods on the exported `api` object:**

- `login({email, password})` → `POST /auth/login` → returns `ICaller`.
- `logout()` → `POST /auth/logout` → returns `void`.
- `refresh()` → `POST /auth/refresh` → returns `void` (server rotates cookies).
- `acceptInvite({token, password})` → `POST /auth/accept-invite` → returns `ICaller`.
- `requestReset({email})` → `POST /auth/request-reset` → returns `void`. Always 200 per server contract; treat any 2xx as success.
- `completeReset({token, password})` → `POST /auth/complete-reset` → returns `void`.
- `changePassword({currentPassword, newPassword})` → `POST /auth/change-password` → returns `void`.
- `bootstrapOwner({email})` → `POST /auth/bootstrap-owner` → returns `void`.
- `getAuthPolicy()` → `GET /settings/auth-policy` → returns `IAuthPolicy` (Phase 8.7 endpoint).
- `putAuthPolicy(policy)` → `PUT /settings/auth-policy` → returns `IAuthPolicy`.
- `listUsers()` → `GET /users` → returns `IUserPublic[]` (Phase 8.1).
- `inviteUser({email, role, displayName?})` → `POST /users/invite` → returns `IUserPublic`.
- `updateUser(email, patch)` → `PUT /users/:email` → returns `IUserPublic`.
- `deleteUser(email)` → `DELETE /users/:email` → returns `void`.
- `reinviteUser(email)` → `POST /users/:email/reinvite` → returns `void`.
- `updateMe({displayName})` → `PUT /users/me` → returns `IUserPublic`.

Each uses `unwrap` + `ApiError` (existing pattern). `getWhoami` (existing) is updated to return `{caller: ICaller | null, bootstrapAvailable?: boolean}`.

**Test cases:** one per method — assert URL, method, body shape, and error envelope handling. Existing `api.test.ts` structure gives the pattern.

**Model:** cheap (mechanical additions).

---

### 10.11 — Wire new routes into `App.tsx`

**Files:**

- Modify `admin/src/App.tsx`
- Modify `admin/src/__tests__/App.test.tsx` (if present) or add smoke test

**Route tree (final):**

```
<Routes>
  <Route element={<BootstrapGuard />}>
    <Route path="/login" element={<LoginPage />} />
    <Route path="/bootstrap" element={<BootstrapOwnerPage />} />
  </Route>
  <Route path="/accept-invite" element={<AcceptInvitePage />} />
  <Route path="/request-reset" element={<RequestResetPage />} />
  <Route path="/reset" element={<CompleteResetPage />} />
  <Route element={<RequireCaller><Outlet /></RequireCaller>}>
    <Route path="/" element={<AdminLayout />}>
      <Route index element={<Navigate to="/dashboard" replace />} />
      <Route path="dashboard" element={<DashboardPage />} />
      <Route path="products" element={<ProductsPage />} />
      <Route path="products/new" element={<ProductsPage />} />
      <Route path="products/:id/*" element={<ProductDetailPage />} />
      <Route path="orders" element={<OrdersPage />} />
      <Route path="orders/:id/*" element={<OrderDetailPage />} />
      <Route path="settings" element={<SettingsPage />} />
    </Route>
  </Route>
</Routes>
```

`RequireCaller` needs a small refactor to accept children via an `<Outlet />` pattern OR keep the existing `{children}` prop and inline it as an element wrapper. Prefer converting to an `<Outlet />` layout route in this pass — that's the idiomatic v6 pattern and cleaner than the double-wrap.

**Test cases:**

1. `/login` renders `LoginPage` (mock BootstrapGuard to pass-through).
2. `/dashboard` when caller is null redirects to `/login` (integration through RequireCaller).
3. `/dashboard` when caller is populated renders `DashboardPage`.
4. `/` redirects to `/dashboard` when authenticated (existing behavior preserved).

**Model:** standard (routing wire-up integration).

---

### 10.12 — Remove `X-Dev-Email` interceptor from `admin/src/utils/api.ts`

**Files:**

- Modify `admin/src/utils/api.ts` (delete lines 58–68 range — verify exact lines during implementation)
- Modify `admin/src/utils/__tests__/api.test.ts` — delete the test case that asserts the header is forwarded in dev mode

**Contract:**

- The `if (import.meta.env.DEV) { apiClient.interceptors.request.use(...X-Dev-Email...) }` block is removed entirely.
- Local dev now relies on the cookie set by `POST /auth/login` (dev flow: bootstrap → accept invite → normal login) or a bearer `Authorization: Bearer <API_SECRET_KEY>` header for scripted testing.
- Comment above the removal block also goes.
- The `VITE_DEV_EMAIL` env var itself is not deleted here — Phase 11.12 covers doc updates and any residual references.

**Grep audit after:**

- `grep -rn "X-Dev-Email" admin/src` → 0 hits
- `grep -rn "VITE_DEV_EMAIL" admin/src` → 0 hits (the interceptor was the only reader in TypeScript; env references live in docs, handled in Phase 11)

**Test cases:**

- Remove the "forwards X-Dev-Email in dev mode" test.
- Add a negative test: even with `import.meta.env.DEV = true` and a mock `VITE_DEV_EMAIL`, requests do NOT carry the header.

**Model:** cheap.

---

### 10.13 — `UserMenu.tsx` in AdminNavbar + `ChangePasswordModal.tsx`

**Files:**

- Create `admin/src/components/auth/UserMenu.tsx`
- Create `admin/src/components/auth/ChangePasswordModal.tsx`
- Create `admin/src/components/auth/__tests__/UserMenu.test.tsx`
- Create `admin/src/components/auth/__tests__/ChangePasswordModal.test.tsx`
- Modify `admin/src/components/layout/AdminNavbar.tsx` (or whichever navbar file exists — implementer verifies)

**UserMenu contract:**

- Renders caller `displayName` (or email fallback), a dropdown chevron.
- Menu items: "Edit name" (inline edit → `updateMe`), "Change password" (opens modal), divider, "Log out" (calls `useAuthActions().logout()`).
- On logout, after promise resolves, navigate to `/login`.
- Keyboard: dropdown opens on Enter/Space, closes on Escape, wraps arrow-key navigation.

**ChangePasswordModal contract:**

- Fields: current password, new password (via `PasswordField` — Task 10.14), confirm new password.
- On mount, fetch policy for min-length hint.
- Submits `changePassword` thunk. On success: modal shows "Password updated. Other sessions have been logged out." for ~2s then closes. On failure: `WEAK_PASSWORD` reasons rendered inline; `INVALID_CREDENTIALS` → "Current password is incorrect."

**Test cases:**

- UserMenu renders displayName, opens on click, all 3 items fire correct actions.
- ChangePasswordModal validates confirm-match before submit.
- Successful change shows the success banner then closes.
- `INVALID_CREDENTIALS` renders the localized copy.

**Model:** standard.

---

### 10.14 — `PasswordField.tsx` + `authPolicy.ts` (client-side policy mirror)

**Files:**

- Create `admin/src/components/auth/PasswordField.tsx`
- Create `admin/src/utils/authPolicy.ts`
- Create `admin/src/components/auth/__tests__/PasswordField.test.tsx`
- Create `admin/src/utils/__tests__/authPolicy.test.ts`

**PasswordField contract:**

- Wraps `<input type="password">` with a show/hide toggle button (accessible label `Show password` / `Hide password`).
- Accepts a `policy?: IAuthPolicy` prop; when present, shows below the input:
  - `✔ At least N characters` / `✘ …` based on live value length.
  - `✔ Not commonly breached` / `⏳ Checking…` — but the client-side check is length + denylist only. HIBP is server-side; the client label reads "Server will check against breach corpus on submit" when `policy.checkBreachCorpus === true`.
- Emits `onChange(value)` matching a plain input.
- Fully controlled — no internal state for the value.

**authPolicy.ts contract:**

- Exports `type IAuthPolicyHint = { ok: boolean; label: string }`.
- Exports `evaluate(password: string, policy: IAuthPolicy | null): IAuthPolicyHint[]` — pure function; produces the labels the PasswordField renders. Length + a short denylist (`['password','12345678','qwerty']` — mirror of the server denylist in `services/src/auth/policy/validatePassword.ts`; extract the denylist to a shared constant if that keeps the client and server in sync easily; otherwise duplicate with a code comment).
- Returns only the hints visible client-side. Does NOT call the network. Server is source of truth on submit.

**Test cases (authPolicy):**

1. Empty password → all hints fail.
2. Meets min-length → length hint passes.
3. Denylisted password fails the denylist hint.
4. Null policy → returns default hints (min 12).

**Test cases (PasswordField):**

1. Toggle button reveals/hides the value.
2. Renders hints from `evaluate()` when policy is passed.
3. Emits `onChange` on typing.

**Model:** cheap-to-standard.

---

### 10.15 — Phase 10 green checkpoint

- Full admin test suite green: `cd admin && npm test -- --run`.
- Lint: `cd admin && npm run lint`.
- Typecheck: `cd admin && npx tsc --noEmit`.
- Full monorepo build passes: `npm run build` from root.
- Grep audits:
  - `grep -rn "X-Dev-Email" admin/src` → 0
  - `grep -rn "Cloudflare Access\|CF Access" admin/src` → 0 hits in code (comments / test-only strings should already be gone; report any survivors)
  - `grep -rn "StaffTab" admin/src` → still present (Phase 11 deletes it — this is expected). Note in the completion write-up.
- Append a completion section to this doc listing the commit ledger and audit results, same pattern as the Phase 9 doc.

---

## Dependency graph

```
10.0 (this doc, committed)
 ├─ 10.10 (api.ts additions) — no dependency; can land first, feeds everything else
 ├─ 10.7  (authSlice thunks + bootstrapAvailable field) — depends on 10.10
 ├─ 10.9  (401 interceptor + bindStore) — depends on 10.7
 ├─ 10.8  (useAuthActions hook) — depends on 10.7
 ├─ 10.14 (PasswordField + authPolicy) — no thunk dependency; can land in parallel
 ├─ 10.1  (LoginPage) — depends on 10.7 + 10.8 + 10.10
 ├─ 10.2  (AcceptInvitePage) — depends on 10.7 + 10.10 + 10.14
 ├─ 10.3  (RequestResetPage) — depends on 10.10
 ├─ 10.4  (CompleteResetPage) — depends on 10.7 + 10.10 + 10.14
 ├─ 10.5  (BootstrapOwnerPage + BootstrapGuard) — depends on 10.7 + 10.10
 ├─ 10.6  (RequireCaller redirect rewrite) — depends on 10.7
 ├─ 10.11 (App.tsx wiring) — depends on 10.1–10.6
 ├─ 10.12 (remove X-Dev-Email interceptor) — depends on 10.11 landing (so dev cookie flow is usable)
 ├─ 10.13 (UserMenu + ChangePasswordModal) — depends on 10.7 + 10.10 + 10.14
 └─ 10.15 (green checkpoint) — depends on all above
```

**Practical dispatch order (single-thread subagent):**
`10.10 → 10.7 → 10.14 → 10.9 → 10.8 → 10.6 → 10.1 → 10.3 → 10.2 → 10.4 → 10.5 → 10.11 → 10.13 → 10.12 → 10.15`

10.10 first bootstraps the API contract; 10.7 layers on thunk state; 10.14 (no dep) parallel-safe but easier to keep in the flow so downstream pages compile against it; 10.9 adds the interceptor once the mutex flag exists; 10.11 wires everything only after the pages are green; 10.12 fires only after 10.11 so the dev cookie flow is usable end-to-end.

---

## Notes on approach (carried forward from Phases 8 and 9)

- Every task ends with green `npm test`, `npm run lint`, `npx tsc --noEmit` before the commit lands. Suite-red = BLOCKED even if the intent is right.
- Two-stage review after every task: spec compliance first, then code quality. Fix loops until both approve.
- Do not touch `web/` or `services/` in Phase 10 — cross-package changes are out of scope. If the review flags a shared type gap (e.g., `IAuthPolicy` not exported from `@bee-epic/shared`), the fix is either a `shared/` PR (rare — Phase 1 covered these) or a local type in `admin/src/types` (preferred for Phase 10).
- Storybook/component-only tests are allowed but not required. Prefer integration tests that hit the RTK slice + component together (existing admin spec pattern).
- Doc drift (`admin/README.md`, `admin/E2E-TESTING-PLAN.md`) is Phase 11.12–11.13, not Phase 10.
- Any code-quality reviewer suggestion that widens beyond Phase 10 scope (e.g., "the settings page should be broken up") gets a one-line "Deferred to Phase 11.X" note and does not block merge.

---

## Completion — 2026-07-06

Phase 10 shipped in 16 commits on top of `e3a65ca` (the Phase 9 close):

| Task        | Commit        | Summary                                                                                                              |
| ----------- | ------------- | -------------------------------------------------------------------------------------------------------------------- |
| 10.0        | `893f070`     | Expansion doc (this file) — 518 lines, dispatch order + deltas from spec                                             |
| 10.10       | `4026b27`     | `api.ts` — 16 new auth/user-management methods; widened `getWhoami` return                                           |
| 10.10 fixup | `8447c16`     | `ICaller.via` `'jwt'`→`'cookie'`; add `unwrapVoid` for 204 responses                                                 |
| 10.7        | `979561a`     | `authSlice.ts` — `login`/`logout`/`refresh`/`changePassword` thunks + `refreshInFlight` mutex + `bootstrapAvailable` |
| 10.14       | `788013b`     | `PasswordField.tsx` + `authPolicy.ts` — pure client-side policy mirror                                               |
| 10.9        | `744a72b`     | 401-refresh interceptor with `bindStore` pattern + coalescing via `refreshInFlight`                                  |
| 10.9 fixup  | `234b8e4`     | Document static-cycle invariant next to the `authSlice` import                                                       |
| 10.8        | `62403a8`     | `useAuthActions.ts` — hook wrapping the four thunks with `.unwrap()`                                                 |
| 10.6        | `d9f97a7`     | `RequireCaller` rewritten as `<Navigate to="/login" state={{from: location}}>`                                       |
| 10.1        | `459fa02`     | `LoginPage` — email + password + returnTo + error mapping (no user enumeration)                                      |
| 10.3        | `e5949a6`     | `RequestResetPage` — always-200 generic success copy                                                                 |
| 10.2        | `57e5626`     | `AcceptInvitePage` — policy hints, confirm-match, WEAK_PASSWORD reasons list                                         |
| 10.4        | `273350a`     | `CompleteResetPage` — same shape as 10.2 + `/dashboard?reset=complete` flag                                          |
| 10.5        | `182256f`     | `BootstrapOwnerPage` + `BootstrapGuard` — first-run flow, exact `BOOTSTRAP_DISABLED` copy                            |
| 10.11       | `e068bcd`     | `App.tsx` — three-tier route tree (public-gated / public-token / protected) via `<Outlet />`                         |
| 10.13       | `fcaa8a8`     | `UserMenu` + `ChangePasswordModal` — inline name edit + auto-close success banner                                    |
| 10.13 fixup | `dc853df`     | ARIA: `role="menuitem"` on buttons; modal autofocus + Escape close                                                   |
| 10.12       | `adfc2c7`     | Remove `X-Dev-Email` request interceptor (obsolete post-login flow)                                                  |
| 10.15       | (this commit) | Green checkpoint + completion write-up                                                                               |

**Reviews:** every task passed a two-stage review (spec compliance ✅, then code quality ✅ or 🟡). Two tasks (10.9, 10.13) had one **important** issue each surfaced by the code-quality reviewer; both were addressed by a small follow-up fix commit before moving on.

**Suite state at completion:**

- `cd admin && npm test -- --run` → **483 passing** (35→46 test files, +125 tests over the Phase 9 baseline of 358). Zero flakes across the session.
- `cd admin && npm run lint` → 73 errors, ALL in the two pre-existing untracked files (`admin/src/test/mocks.ts`, `admin/src/test/product-create.test.tsx`) plus the generated `admin/dev-dist/` service-worker artifacts. **Zero new lint errors introduced by Phase 10.**
- `cd admin && npx tsc --noEmit` → 10 baseline errors, ALL in files Phase 10 did not touch: `StaffTab.tsx` (4 — Phase 11 deletes), `ordersSlice.ts:142` (1 — pre-existing), `productsSlice.ts:209` (1 — pre-existing), `utils/api.ts` lines 478/630/644/645 (4 — legacy `getProducts`/`getOrders` sections, unmodified). **Zero new TS errors introduced by Phase 10.**
- Full monorepo build (`npm run build` from root) — the root script chains `services:deploy` (wrangler) which requires `CLOUDFLARE_API_TOKEN` and can't run locally; individual `shared:build`, `admin:build`, and `web:build` invocations succeed apart from the pre-existing baseline TS errors above. Same limitation acknowledged in the Phase 9 completion note.

**Grep audits:**

- `grep -rn "X-Dev-Email" admin/src` → 0 live references (5 hits inside the negative-assertion test's own comments/describe strings documenting the removal — expected).
- `grep -rIn "Cloudflare Access\|CF Access\|Cf-Access" admin/src` → 4 hits, all in files Phase 10 did not own:
  - `admin/src/pages/settings/AdminConfigTab.tsx:46,63` — visible "Cloudflare Access" Section title + explanatory copy. Deferred to Phase 11 (Users/Security tabs rewrite).
  - `admin/src/pages/settings/StaffTab.tsx:97` — visible copy inside StaffTab, which Phase 11 deletes entirely.
  - `admin/src/pages/settings/__tests__/AdminConfigTab.test.tsx:43` — asserts the visible "Cloudflare Access" title; travels with the AdminConfigTab rewrite.
  - `admin/src/pages/settings/__tests__/StaffTab.test.tsx:46` — comment about the `Cf-Access` email header emission; travels with StaffTab deletion.

  Two Phase-10-owned files were cleaned inline during 10.15 (`AdminNavbar.tsx` two comment blocks, `AdminNavbar.test.tsx` one JSDoc) — commit ships with the 10.15 checkpoint.

- `grep -rn "StaffTab" admin/src` → still present as expected (Phase 11 deletion).
- `grep -rn "settings-staff\|StaffListSchema" admin/src` → 0 hits (Phase 9 already scrubbed).

**Deferred items (Phase 11):**

- `AdminConfigTab.tsx` / `StaffTab.tsx` rewrites — remove Cloudflare Access surface, add Users tab (via new `listUsers`/`inviteUser`/etc. wired to the admin `api` object) + Security tab (via `getAuthPolicy`/`putAuthPolicy`).
- `admin/README.md`, `admin/E2E-TESTING-PLAN.md`, `services/API.md`, `services/AGENTS.md` — doc drift updates.
- `VITE_DEV_EMAIL` env-var reference in dev docs — removal announcement.
- Baseline TS errors in `ordersSlice.ts` / `productsSlice.ts` / legacy `api.ts` list methods — tackle when the paginated-fetch types get their long-overdue tightening.
- `AcceptInvitePage` / `ChangePasswordModal` WEAK_PASSWORD reasons render server strings verbatim (e.g. `too_short`, `pwned`) — code-to-copy translation is a Phase 11 polish item.

**Ready for Phase 11.**
