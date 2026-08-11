# Phase 12 — Final cross-project verification

> Parent: `2026-06-27-repo-wide-code-review-fixes.md`. Task 93.

---

## Task 93: Repo-wide verification gate

**Files:** none modified by this task. Only runs checks and writes a summary commit message.

- [ ] **Step 1: Clean install**

```bash
cd /Users/I843666/Documents/DEV/Projects/bee-epic-apiary
rm -rf shared/dist services/.wrangler admin/dist web/dist
rm -rf shared/node_modules services/node_modules admin/node_modules web/node_modules node_modules
npm install
```

`preinstall` rebuilds `shared/` and installs all sub-projects.

- [ ] **Step 2: Lint everything**

```bash
npm run lint
```

Expected: zero warnings, zero errors (all sub-projects use `--max-warnings 0`).

- [ ] **Step 3: Run all tests**

```bash
npm run test
```

Expected: all `services` and `admin` tests pass. (`web` tests added in Phase 0; the root `test` script doesn't include `web` today — verify by adding `npm run web:test` to the root if Phase 0 was completed.)

- [ ] **Step 4: Run all coverage and inspect thresholds**

```bash
npm run test:coverage
```

Expected: thresholds met (services 90/90/90/90, admin 88/85/75/88 after Task 40 bumped functions). If web has tests now, ensure the coverage config doesn't fail.

- [ ] **Step 5: Type-check + build everything**

```bash
npm run build
```

This deploys the worker (`services:deploy`) — only run on a deploy-ready environment. For a non-deploy verification, run each individually:

```bash
cd shared && npm run build
cd ../services && npx tsc --noEmit
cd ../admin && npx tsc --noEmit && npm run build
cd ../web && npx tsc --noEmit && npm run build
```

Expected: zero TS errors.

- [ ] **Step 6: Manual smoke (concurrent dev)**

```bash
npm run dev
```

In a browser:

- Visit `http://localhost:5173` (web). Add a product to cart, click checkout, verify redirect to a real Stripe URL.
- Visit `http://localhost:5174` (admin). Verify `/whoami` returns a caller (via `X-Dev-Email`); navbar shows the email + role badge; SSE indicator shows "connected"; Products list loads; Orders list loads.
- Mutate a product → confirm SSE event arrives in admin within 1s.

Stop the dev server.

- [ ] **Step 7: Verify documentation parity**

```bash
grep -rn "VITE_API_SECRET_KEY\|checkAuth" --include="*.md" .
```

Expected: zero matches (or only intentional historical references in CHANGELOG-style docs).

- [ ] **Step 8: Final commit**

```bash
git add -A
git commit --allow-empty -m "chore: complete 2026-06-27 code-review fix sweep (Critical+Important+Minor)"
```

- [ ] **Step 9: Update `docs/superpowers/plans/2026-06-27-repo-wide-code-review-fixes.md` checkbox status** — mark Phase 12 done in the master plan.

---

End of Phase 12. All tasks complete.

---

## Stretch — recommended next sweep

After this plan lands, consider:

1. **Add `web/` to root `test` and `lint` scripts** so CI runs them automatically.
2. **`noUncheckedIndexedAccess: true` in `admin/tsconfig.json` and `web/tsconfig.json`** — would catch several `arr[index]` patterns flagged in the review.
3. **Replace `axios` error extraction in admin with a typed `parseEnvelope` helper** modeled on `web/src/utils/api.ts`.
4. **Add `EOrderFulfillmentStatus` enum to admin form options** so the dropdown is type-safe and matches the worker whitelist (Task 32).
