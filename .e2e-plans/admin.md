# E2E Test Plan: Admin Subproject

> **Instructions for the testing agent**: This plan is designed for an agent with
> no prior knowledge of the project. Follow every step exactly as written.
> When the plan asks you to ask the user a question, stop and wait for their answer
> before proceeding.

---

## 1. Metadata

| Field              | Value                                   |
| ------------------ | --------------------------------------- |
| **Plan ID**        | `admin-v1`                              |
| **Version**        | `4.0.0`                                 |
| **Date**           | `2026-05-18`                            |
| **Scope**          | Admin subproject — all workflows        |
| **Auth Method**    | None (API-level token only, no UI auth) |
| **Target Browser** | Playwright (Chromium)                   |

---

## 2. Project Overview

### Description

The admin subproject is a React 18 + TypeScript single-page application for managing an e-commerce honey/apiary store. It provides a dashboard with sales stats, a full product CRUD interface (create, read, update, delete) backed by Stripe, and a settings panel for editing site content (hero, about, process steps, testimonials) and admin configuration. All data is served by a Cloudflare Worker API.

### How to Deploy and Start

**Prerequisites**: Node.js 18+, the `services/` Cloudflare Worker running on port 8787.

```bash
# 1. Install dependencies
cd admin && npm install

# 2. Copy and configure environment
cp .env.example .env
# Edit .env: set VITE_API_SECRET_KEY, VITE_STRIPE_PUBLISHABLE_KEY,
# VITE_ALLOWED_ORIGINS=http://localhost:5174

# 3. Start the services worker (in a separate terminal)
cd ../services && npm install && npm run dev

# 4. Start the admin dev server (in another terminal)
cd ../admin && npm run dev
```

### URLs

| Environment           | URL                     |
| --------------------- | ----------------------- |
| Local dev             | `http://localhost:5174` |
| API (services worker) | `http://localhost:8787` |

### Required Environment Variables

The testing agent must ensure these are set in `admin/.env`:

| Variable                      | Purpose                                             |
| ----------------------------- | --------------------------------------------------- |
| `VITE_API_URL`                | API base URL (`http://localhost:8787`)              |
| `VITE_API_SECRET_KEY`         | Bearer token for API auth                           |
| `VITE_STRIPE_PUBLISHABLE_KEY` | Stripe publishable key for payment links            |
| `VITE_ALLOWED_ORIGINS`        | CORS origins (must include `http://localhost:5174`) |

---

## 3. Testing Configuration

### 3.1 Viewport

Default: `1280x720`. The testing agent should set this in Playwright before starting.

### 3.2 Responsive Viewport Testing

The happy path of EVERY workflow must be tested at the following breakpoints to verify responsive behavior:

| Breakpoint | Viewport   | Focus                                                                                       |
| ---------- | ---------- | ------------------------------------------------------------------------------------------- |
| Desktop    | `1280x720` | Full layout, always-visible sidebar, table view for products                                |
| Tablet     | `768x1024` | Collapsed sidebar toggle, adjusted grid, touch targets                                      |
| Mobile     | `375x812`  | Hidden sidebar with hamburger menu + overlay, card layout for products, single-column stack |

For each breakpoint, the testing agent MUST:

1. Resize the browser viewport to the target dimensions
2. Execute the workflow steps
3. Verify:
   - No horizontal scrollbars appear
   - No text is truncated or overflowing its container
   - No elements overlap
   - All interactive elements (buttons, links, form fields) remain tappable/clickable
   - Navigation adapts correctly (hamburger menu on mobile, sidebar collapse on tablet)
   - Images scale appropriately without distortion
4. Capture a full-page screenshot for visual comparison

Edge cases (non-happy-path scenarios) can be tested at the default desktop viewport only, unless the edge case is specifically about responsive behavior.

### 3.3 data-testid Convention

This plan prefers `data-testid` selectors for reliable element targeting. However, the admin codebase currently does **not** use `data-testid` attributes. Use text-based and role-based selectors as fallbacks.

Selector priority (use first available): `data-testid` > ARIA role > text content > CSS class.

If `data-testid` attributes are added in the future, use this convention:

| Pattern                          | Example               | Purpose               |
| -------------------------------- | --------------------- | --------------------- |
| `[data-testid="page-{name}"]`    | `page-product-detail` | Page-level container  |
| `[data-testid="btn-{action}"]`   | `btn-add-product`     | Buttons and actions   |
| `[data-testid="input-{field}"]`  | `input-product-name`  | Form input fields     |
| `[data-testid="form-{name}"]`    | `form-product`        | Form containers       |
| `[data-testid="nav-{name}"]`     | `nav-sidebar`         | Navigation elements   |
| `[data-testid="msg-{type}"]`     | `msg-success`         | Messages and alerts   |
| `[data-testid="list-{name}"]`    | `list-products`       | List/table containers |
| `[data-testid="heading-{page}"]` | `heading-dashboard`   | Page headings         |

### 3.4 Timeout Conventions

The testing agent MUST use these default timeout values:

| Context            | Timeout | Notes                                          |
| ------------------ | ------- | ---------------------------------------------- |
| Element visibility | 5s      | `page.waitForSelector` with `state: "visible"` |
| Page navigation    | 10s     | `page.waitForURL`, `page.goto`                 |
| Network idle       | 15s     | `page.waitForLoadState("networkidle")`         |
| DOM content loaded | 30s     | `page.waitForLoadState("domcontentloaded")`    |
| Retry base delay   | 1s      | Doubles on each retry (1s, 2s, 4s)             |

Per-step timeouts may override these defaults in the Detailed Steps section.

### 3.5 Retry Strategy

When a step fails during execution, the testing agent MUST follow this policy:

- **Max retries per step**: 3
- **Backoff**: Exponential (1s, 2s, 4s)
- **Retry condition**: Only on `TimeoutError`, `NoSuchElementError`, or transient network failures
- **Do NOT retry**: Assertion failures (wrong text, wrong URL, wrong state — these are real bugs)

**Abort execution when**:

- A step fails after exhausting all retries
- A P0 (critical) workflow step fails
- The application shows a fatal error (HTTP 500, blank page, crash overlay)
- The testing environment becomes unreachable

**Continue despite failure when**:

- A non-critical check fails (visual diff, responsive layout at non-default breakpoint)
- An edge case fails — log the issue, continue the happy path
- Cleanup fails — log and continue (the test has already run)

**Flaky detection**: Log any step that passes only after retries. A pattern of retry-dependent passes may indicate a timing issue in the test rather than a real bug.

### 3.6 Accessibility Checks

At every step where `a11y check: true` is specified, the testing agent MUST:

1. **Automated scan**: Inject and run `axe-core` (or equivalent). Check for:
   - Color contrast violations
   - Missing ARIA labels on interactive elements
   - Missing form label associations
   - Improper heading hierarchy (h1→h2→h3 — no skips)
   - Missing alt text on informative images
   - Insufficient focus indicators

2. **Keyboard navigation**: Tab through all interactive elements:
   - All form fields, buttons, and links reachable via Tab
   - Focus order follows visual/logical order
   - Focus indicator visible at all times
   - No focus traps (modal must be closable via Escape or close button)

3. **Screen reader hints**: Verify ARIA roles are appropriate, `aria-expanded` reflects current state, `aria-live` regions are used for dynamic content updates.

Report a11y violations using the issue report format in this plan.

### 3.7 Authentication Detail

**No UI authentication required.** The admin subproject does not have a login page. API authentication is handled automatically by the Axios client interceptor which reads `VITE_API_SECRET_KEY` from environment variables and attaches it as a Bearer token on every request. The testing agent does not need to perform any authentication steps.

### 3.8 Self-Contained Testing Principle

Every workflow that creates test data (products, content, settings) MUST be **self-contained** — it MUST clean up all data it creates within the same workflow. The testing agent MUST follow these rules:

- **Products**: Every product created during testing MUST be **edited** and then **deleted** before the workflow completes. Under no circumstance should a test leave behind a product it created.
- **Content modifications**: Any change to site content, process steps, or testimonials MUST be reverted using a paired teardown.
- **LocalStorage settings**: Any change to admin configuration in localStorage MUST be restored to its original value using a paired teardown.

**Rationale**: Self-contained tests ensure:

1. Each workflow can be run independently without dependency on prior cleanup
2. No stale test data accumulates in the database or localStorage
3. The edit and delete code paths are exercised (and thus verified) on every run
4. Bug fixes that affect edit/delete flows are caught immediately on the next test run

**Exception**: If a workflow explicitly documents that it does not clean up (e.g., for manual inspection or destructive testing), the reasoning must be stated in the workflow's Test Data table.

---

## 4. Workflows

---

### Workflow 1: Dashboard Page

**Metadata**:

| Field            | Value                                |
| ---------------- | ------------------------------------ |
| **Priority**     | P0 (critical)                        |
| **Tags**         | smoke                                |
| **Duration**     | ~45s                                 |
| **Dependencies** | Requires at least 1 product to exist |

**Description**: The user lands on the dashboard after navigating to `/`. They see summary statistics (4 stat cards), a category breakdown bar chart, recent products list (up to 5), and quick action links. This workflow verifies all dashboard elements render correctly.

**Preconditions**:

- The admin app is running at `http://localhost:5174`
- The services worker is running at `http://localhost:8787`
- At least one product exists in the database

**Test Data**:

| Record                         | Creation Method                          | Identifier | Cleanup        |
| ------------------------------ | ---------------------------------------- | ---------- | -------------- |
| At least 1 product in database | API (pre-seeded) or run Workflow 3 first | N/A        | Self-contained |

#### Happy Path

| Step | Action                                | Selector Hint                                                             | a11y | Expected Result                                                                     |
| ---- | ------------------------------------- | ------------------------------------------------------------------------- | ---- | ----------------------------------------------------------------------------------- |
| 1    | Navigate to `http://localhost:5174`   | URL `http://localhost:5174`                                               | Y    | Page loads, URL redirects to `/dashboard`                                           |
| 2    | Wait for stat cards to load           | `text=Total Active Products` or similar stat card heading                 | N    | 4 stat cards visible: Total Active Products, In Stock, Featured, Categories         |
| 3    | Verify "Quick Actions" section        | `text=Quick Actions` or a section heading                                 | N    | Three action links visible: "Manage Products", "Add New Product", "Update Settings" |
| 4    | Verify category breakdown chart       | A bar chart heading or chart container                                    | N    | Category breakdown (Honey, Beeswax, Gift Sets, Subscriptions) chart renders         |
| 5    | Verify "Recent Products" list         | `text=Recent Products` or similar heading                                 | N    | Up to 5 product cards/rows visible with name and thumbnail                          |
| 6    | Click the first recent product        | `a:has(>> text=<first product name>)` or `.recent-products a:first-child` | Y    | Navigates to `/products/:id`                                                        |
| 7    | Go back to dashboard                  | Click browser back or sidebar Dashboard link                              | N    | Dashboard loads correctly                                                           |
| 8    | Click "Add New Product" quick action  | `a:has-text("Add New Product")`                                           | Y    | Navigates to `/products/new`, the ProductFormDialog modal opens                     |
| 9    | Close the dialog                      | Click the dialog close button or press Escape                             | N    | Dialog closes, URL reverts to `/products`                                           |
| 10   | Verify "Add Product" button in navbar | `button:has-text("Add Product")` or navbar element                        | N    | Button visible in the top navbar                                                    |

#### Detailed Steps

**Step 1: Navigate to Admin Home**

```
Action:       Navigate to http://localhost:5174
Selector:     N/A
Input:        N/A
Wait for:     URL to change to /dashboard (automatic redirect)
Validate:     URL is http://localhost:5174/dashboard
Visual check: Page renders without console errors, no broken layout
a11y check:   true
Screenshot:   true
```

**Step 2: Verify Stat Cards**

```
Action:       Wait for all 4 stat cards to load
Selector:     The 4 card elements — look for headings containing "Total Active Products", "In Stock", "Featured", "Categories"
Input:        N/A
Wait for:     Each stat card's numeric value to be visible (may briefly show 0 before API responds)
Validate:     Four stat cards are present each with a label and a numeric count
Visual check: Cards are evenly spaced in a grid, text is readable, no overlapping elements
a11y check:   false
Screenshot:   true
```

**Step 3: Verify Quick Actions**

```
Action:       Scroll down or locate the Quick Actions section
Selector:     text=Quick Actions or a link/list containing action links
Input:        N/A
Wait for:     Three action links to appear
Validate:     Links exist: "Manage Products" (href=/products), "Add New Product" (href=/products/new), "Update Settings" (href=/settings)
Visual check: Links display as styled cards or buttons, evenly spaced
a11y check:   false
Screenshot:   false
```

**Step 4: Verify Category Chart**

```
Action:       Locate the category breakdown chart area
Selector:     A chart container or section with category labels
Input:        N/A
Wait for:     Chart container to render
Validate:     Category labels (Honey, Beeswax, Gift Sets, Subscriptions) are present
Visual check: Chart renders without visual defects, bars/labels are not overlapping
a11y check:   false
Screenshot:   true
```

**Step 5: Verify Recent Products**

```
Action:       Locate the recent products section
Selector:     text=Recent Products or a list of product items
Input:        N/A
Wait for:     At least one product to appear in the list (or an empty state message if none exist)
Validate:     1-5 product entries visible with name and thumbnail image
Visual check: Product thumbnails load without broken image icons, names are readable
a11y check:   false
Screenshot:   true
```

**Step 6: Navigate to Product Detail via Recent Products**

```
Action:       Click on the first product in the Recent Products list
Selector:     The first clickable product item/row in the recent products section
Input:        N/A
Wait for:     URL to change to /products/<id>
Validate:     Product detail page loads with the product's name as heading
Visual check: Product images, description, and metadata display correctly
a11y check:   true
Screenshot:   true
```

**Step 7: Return to Dashboard**

```
Action:       Click the "Dashboard" link in the sidebar
Selector:     a:has-text("Dashboard") or sidebar navigation link
Input:        N/A
Wait for:     URL to be /dashboard
Validate:     Dashboard loads, stat cards re-render
Visual check: Dashboard is fully rendered
a11y check:   false
Screenshot:   false
```

**Step 8: Click "Add New Product" Quick Action**

```
Action:       Click the "Add New Product" quick action link
Selector:     a:has-text("Add New Product")
Input:        N/A
Wait for:     URL to change to /products/new AND the ProductFormDialog modal to open
Validate:     Modal dialog with form fields (Product Name, Slug, Short Description, Price, Category, etc.) is visible
Visual check: Modal overlay with form, proper z-index, fields properly labeled
a11y check:   true
Screenshot:   true
```

**Step 9: Close the Dialog**

```
Action:       Close the modal without saving
Selector:     Modal close button (X icon) or press Escape key
Input:        N/A
Wait for:     Modal to disappear, URL to revert to /products
Validate:     Modal is no longer visible, page content is accessible beneath
Visual check: Page returns to normal state, no remnant overlay
a11y check:   false
Screenshot:   false
```

**Step 10: Verify Navbar "Add Product" Button**

```
Action:       Locate the "Add Product" button in the top navbar
Selector:     button:has-text("Add Product") or header/navbar container
Input:        N/A
Wait for:     Button to be visible in the navbar
Validate:     Button text reads "Add Product"
Visual check: Button is properly styled, visible in the navbar
a11y check:   false
Screenshot:   true
```

#### Edge Cases

**Edge Case 1: Empty Dashboard (No Products)**

```
Reference:  Happy Path Steps 2-5
Variation:  The database has zero products (empty state)
Action:     Navigate to /dashboard and observe how the UI handles empty data
Input:      N/A
Expected:   Stat cards show 0 values, Recent Products section shows a "No products yet" or empty state message. No console errors.
Screenshot: true
```

**Edge Case 2: API Failure on Dashboard**

```
Reference:  Happy Path Steps 1-2
Variation:  The services worker is not running or returns errors
Action:     Stop the services worker, then navigate to /dashboard
Input:      N/A
Expected:   The page shows an error banner/message about API failure. Stat cards may show dashes or "Error". The page should not be blank.
Screenshot: true
```

#### Cleanup

No data is modified in this workflow — it is read-only.

**Cleanup strategy**: Idempotent state

---

### Workflow 2: Products List — Browse, Search, Filter, and Paginate

**Metadata**:

| Field            | Value                                  |
| ---------------- | -------------------------------------- |
| **Priority**     | P0 (critical)                          |
| **Tags**         | smoke, regression                      |
| **Duration**     | ~90s                                   |
| **Dependencies** | Requires at least 11 products to exist |

**Description**: The user browses the full product catalog, searches by name/description, filters by category, combines both filters, verifies the results count display, and loads more products via pagination. This workflow validates the search and filter system works independently and in combination.

**Preconditions**:

- At least 11 products exist in the database (to verify pagination)
- Products span at least 2 categories (to verify category filtering)
- The user is on the products page at `/products`

**Test Data**:

| Record                           | Creation Method                                    | Identifier | Cleanup        |
| -------------------------------- | -------------------------------------------------- | ---------- | -------------- |
| At least 11 products in database | Run Workflow 3 multiple times, or pre-seed via API | N/A        | Self-contained |
| Products in 2+ categories        | Pre-seed with mixed categories                     | N/A        | Self-contained |

#### Happy Path

| Step | Action                                          | Selector Hint                                        | a11y | Expected Result                                                                                               |
| ---- | ----------------------------------------------- | ---------------------------------------------------- | ---- | ------------------------------------------------------------------------------------------------------------- |
| 1    | Navigate to `/products`                         | URL `http://localhost:5174/products`                 | Y    | Product list renders (table on desktop, cards on mobile)                                                      |
| 2    | Verify product table/card columns               | Table or card elements                               | N    | Product name, slug, category badge, price, status badge, featured badge, Edit/Delete actions visible          |
| 3    | Search by product name, verify results count    | `input[placeholder*="Search"]`                       | N    | List narrows; "Showing X of Y products" count reflects filtered total                                         |
| 4    | Clear search, filter by category, verify count  | `select` category dropdown                           | N    | List shows only products in that category; count updates                                                      |
| 5    | Add search on top of category filter (combined) | Keep category selected, type search term             | N    | List narrows further — both filters apply simultaneously. All visible products match BOTH category AND search |
| 6    | Clear all filters, verify full count restored   | Clear search input, set category to "All"            | N    | Count returns to original total; all products visible                                                         |
| 7    | Scroll to bottom, click "Load More Products"    | Scroll until `button:has-text("Load More Products")` | N    | "Load More Products" button visible and clickable                                                             |
| 8    | Verify pagination appended products             | Product list after clicking "Load More"              | N    | Additional 10 products appended; list grows; no duplicates                                                    |

#### Detailed Steps

**Step 1: Navigate to Products Page**

```
Action:       Navigate to http://localhost:5174/products
Selector:     N/A
Input:        N/A
Wait for:     Product table (desktop) or product cards (mobile) to render
Validate:     URL is /products, page heading contains "Products Management"
Visual check: The product listing renders without layout shift
a11y check:   true
Screenshot:   true
```

**Step 2: Verify Product Row Elements**

```
Action:       Inspect the first product row in the table/card layout
Selector:     Table row (`tr`) or card element containing product data
Input:        N/A
Wait for:     At least one product row to be fully rendered
Validate:     Each row contains: product thumbnail + name + slug, category badge (styled colored pill), price formatted as currency, status badge (In Stock/Out of Stock), featured badge (yes or no), Edit (pencil icon) and Delete (trash icon) action buttons
Visual check: Badges are properly colored and styled, thumbnails load, text is not truncated
a11y check:   false
Screenshot:   true
```

**Step 3: Search by Product Name — Verify Results Count**

```
Action:       Type a search term into the search input
Selector:     input[type="text"][placeholder*="Search products"]
Input:        Type a term likely to match multiple products (e.g., "Honey" or the first word of a known product name)
Wait for:     300ms debounce delay, then list updates
Validate:     The list filters to show only products matching the search term. The "Showing X of Y products" count text updates — Y (total) reflects the count of matching products, X equals Y (all matching products shown on first page). At least one product visible.
Visual check: Search input shows the typed term, list smoothly transitions to filtered results, count text updates
a11y check:   false
Screenshot:   true
```

**Step 4: Clear Search, Filter by Category — Verify Results Count**

```
Action:       Clear the search input, then select a category from the filter dropdown
Selector:     Clear the search input first. Then select from the `<select>` dropdown labelled "All Categories"
Input:        Select a specific category (e.g., "Honey" or "Beeswax" — any category that has products)
Wait for:     List to update after category selection
Validate:     Every visible product has a category badge matching the selected category. The "Showing X of Y products" count reflects the total products in this category. No products from other categories appear.
Visual check: Dropdown shows the selected category name, category badges on all visible rows match the filter
a11y check:   false
Screenshot:   true
```

**Step 5: Combined Search + Category Filter**

```
Action:       Keep the category filter selected. Type a search term into the search input.
Selector:     Leave category dropdown at its current value. Type into the search input.
Input:        Type a search term that is narrower than the full category — e.g., if category is "Honey", search for a specific honey product name or a keyword like "Raw" or "Wildflower"
Wait for:     300ms debounce delay, then list updates
Validate:     The product count drops further than the category filter alone. Every visible product: (a) belongs to the selected category AND (b) matches the search term. Verify that both filters are visually active — category dropdown shows the selected value, search input shows the typed term.
Visual check: Both filter indicators visible (dropdown selection + search text). List correctly shows intersection of both filters.
a11y check:   false
Screenshot:   true
```

**Step 6: Clear All Filters — Verify Full Count Restored**

```
Action:       Clear the search input AND reset the category dropdown to "All Categories"
Selector:     Clear search input text. Set category `<select>` value to "ALL" (the first option "All Categories")
Input:        N/A
Wait for:     300ms debounce delay, then list resets
Validate:     The "Showing X of Y products" count returns to the original total count (matching Step 1). All products visible again regardless of category.
Visual check: Search input is empty, dropdown shows "All Categories", full product list restored
a11y check:   false
Screenshot:   true
```

**Step 7: Verify "Load More" Button**

```
Action:       Scroll to the bottom of the product list
Selector:     Scroll until button:has-text("Load More Products") is visible in the viewport
Input:        N/A
Wait for:     The "Load More Products" button to be in the viewport
Validate:     Button text reads "Load More Products", it is not disabled, it is clickable
Visual check: Button is styled consistently, centered at the bottom of the list
a11y check:   false
Screenshot:   true
```

**Step 8: Load More Products — Verify Pagination**

```
Action:       Click the "Load More Products" button
Selector:     button:has-text("Load More Products")
Input:        N/A
Wait for:     New product rows to append to the existing list (~10 new items)
Validate:     The number of products in the list increases by ~10. No duplicate products appear (check the first new product's name — it should not match any previously visible product). The "Load More Products" button remains at the bottom (unless fewer than 10 remain).
Visual check: New products smoothly appear, no layout jump, no duplicate entries, loading overlay appears briefly then disappears
a11y check:   false
Screenshot:   true
```

#### Edge Cases

**Edge Case 1: Empty Search Results (No Filters)**

```
Reference:  Happy Path Step 3
Variation:  Search term matches no products, with no category filter active
Action:     Set category to "All Categories", type an impossible search term into the search input
Input:      "xyznonexistentproduct12345"
Expected:   A "No products found" empty state message appears with a package illustration and "Try adjusting your search or filter" subtitle text. The "Load More Products" button should be hidden. An "Add Product" button should appear to let the user create a new product. No console errors.
Screenshot: true
```

**Edge Case 2: Empty Category Filter (No Search)**

```
Reference:  Happy Path Step 4
Variation:  Selected category has no products, no search term
Action:     Select a category that has zero products (e.g., "Subscriptions" if none exist). If all categories have products, this edge case may require pre-condition data setup.
Input:      Select the empty category from the dropdown
Expected:   Same contextual empty message: "No products found" + "Try adjusting your search or filter". The "Add Product" button should appear. No console errors.
Screenshot: true
```

**Edge Case 3: Combined Filter Yields No Results**

```
Reference:  Happy Path Step 5
Variation:  Search + category combination that matches nothing
Action:     Select a real category (e.g., "Honey"), then type an impossible search term
Input:      Category: "Honey", Search: "xyznonexistentproduct12345"
Expected:   Empty state appears with "No products found" and "Try adjusting your search or filter" text — same as single-filter empty state. Both filter indicators remain visible (dropdown shows "Honey", search shows the typed term). The "Add Product" button is visible. No console errors.
Screenshot: true
```

**Edge Case 4: Single Product After Filter**

```
Reference:  Happy Path Steps 3-5
Variation:  Filter returns exactly one product
Action:     Search for a term that matches exactly one known product (use a unique product name from the test data)
Input:      A unique product name
Expected:   Single product shown, "Showing 1 of 1 products" in the results count. "Load More Products" button should be hidden (no more pages). Category badge and details for that single product display correctly.
Screenshot: true
```

**Edge Case 5: Rapid Search Typing (Debounce)**

```
Reference:  Happy Path Step 3
Variation:  Type rapidly to test 300ms debounce behavior
Action:     Type a multi-character search term quickly (e.g., "hon") and then backspace to clear within <300ms
Input:      Type "h", "o", "n", backspace, backspace, backspace rapidly — all within 500ms total
Expected:   The list should only update once after the debounce period (300ms) on the final empty input value. No flickering or rapid re-renders on each keystroke. The list should return to the full unfiltered state after the debounce completes.
Screenshot: false
```

**Edge Case 6: Contextual Empty State — No Filters vs With Filters**

```
Reference:  Happy Path Steps 3-5
Variation:  Compare empty state message text when filters are active vs inactive
Action:     Temporarily ensure no filters are active (category = "All", search = empty). Clear all filters and verify the "true empty" state message. Then apply filters and verify the "filtered empty" message. This edge case can be observed while testing Edge Cases 1-3.
Input:      N/A
Expected:   When no filters are active: empty state shows "Get started by adding your first product". When filters ARE active: empty state shows "Try adjusting your search or filter". The component code at ProductsPage.tsx:222-228 distinguishes these cases.
Screenshot: true
```

#### Cleanup

No data is modified in this workflow — it is read-only.

**Cleanup strategy**: Idempotent state

---

### Workflow 3: Full Product Lifecycle (Create → View → Edit → Delete)

**Metadata**:

| Field            | Value                 |
| ---------------- | --------------------- |
| **Priority**     | P0 (critical)         |
| **Tags**         | regression, slow      |
| **Duration**     | ~120s                 |
| **Dependencies** | None (self-contained) |

**Description**: A self-contained workflow that creates a new product with a unique test name, verifies it appears in the list, views its detail, edits its name and price, verifies the changes, then deletes the product. This workflow follows the Self-Contained Testing Principle (§3.8) — the product it creates is always edited and then deleted.

**Preconditions**:

- The user is on the products page at `/products`

**Test Data**:

| Record                     | Creation Method    | Identifier                              | Cleanup             |
| -------------------------- | ------------------ | --------------------------------------- | ------------------- |
| E2E Test Product (created) | UI (this workflow) | `E2E Test Product [timestamp]`          | Deleted in workflow |
| E2E Test Product (edited)  | UI (this workflow) | `E2E Test Product [timestamp] (edited)` | Deleted in workflow |

#### Happy Path

| Step | Action                                | Selector Hint                                    | a11y | Expected Result                                                      |
| ---- | ------------------------------------- | ------------------------------------------------ | ---- | -------------------------------------------------------------------- |
| 1    | Navigate to `/products/new`           | URL or click "Add Product" button                | Y    | ProductFormDialog modal opens                                        |
| 2    | Fill the product form with valid data | form fields                                      | N    | All required fields populated                                        |
| 3    | Submit the form                       | `button:has-text("Create Product")`              | N    | Modal closes, product appears in list                                |
| 4    | Click the new product in the list     | link containing the product name                 | Y    | Navigates to `/products/:id`, detail page shows all fields correctly |
| 5    | Navigate to edit page                 | `button:has-text("Edit")`                        | Y    | ProductFormDialog opens prefilled with existing data                 |
| 6    | Change the product name and price     | Name and price fields                            | N    | Fields update with new values                                        |
| 7    | Submit the edit                       | `button:has-text("Update Product")`              | N    | Modal closes, detail page shows updated name and price               |
| 8    | Navigate back to products list        | Click "Back" link or sidebar Products            | N    | Product list shows the updated name                                  |
| 9    | Delete the product                    | Click Delete button for this product             | N    | Confirmation modal appears                                           |
| 10   | Confirm deletion                      | `button:has-text("Delete")` within confirm modal | N    | Modal closes, product removed from list                              |

#### Detailed Steps

**Step 1: Open Create Product Modal**

```
Action:       Navigate to http://localhost:5174/products/new
Selector:     N/A
Input:        N/A
Wait for:     The ProductFormDialog modal to appear with form fields visible
Validate:     Modal heading reads "Add New Product", form fields for Product Name, Slug, Short Description, Price, Category, Weight, In Stock, Featured, Image URLs, Thumbnail URLs, Tags are visible
Visual check: Modal is centered with overlay behind it, form is properly labeled and spaced
a11y check:   true
Screenshot:   true
```

**Step 2: Fill the Product Form**

```
Action:       Fill in all required fields with unique test data
Selector:     Various input fields in the form
Input:
  - Product Name: "E2E Test Product [timestamp]" (use current timestamp for uniqueness)
  - Slug: "e2e-test-product-[timestamp]"
  - Short Description: "An automated E2E test product — delete me"
  - Long Description: "This product was created by the E2E test plan for automated testing purposes. It should be deleted after the test completes."
  - Price (cents): 1999 (for $19.99)
  - Category: "Honey"
  - Weight: "16 oz"
  - In Stock: checked (default)
  - Featured: unchecked (default)
  - Tags: add tag "e2e-test" (type "e2e-test" in the tag input and press Enter or click the + button)
Wait for:     All fields to be filled and no validation errors visible
Validate:     Form is complete, all fields show entered values
Visual check: Form looks properly filled, no overlapping labels or fields, the tag "e2e-test" appears as a removable badge
a11y check:   false
Screenshot:   true
```

**Step 3: Submit the Form**

```
Action:       Click the submit/create button
Selector:     button:has-text("Create Product")
Input:        N/A
Wait for:     Modal to close AND the product list to update with the new product appearing
Validate:     No visible error messages. The new product "E2E Test Product [timestamp]" appears in the product list with correct category badge and price.
Visual check: Modal closes smoothly, product list shows the new entry
a11y check:   false
Screenshot:   true
```

**Step 4: View Product Detail**

```
Action:       Click on the newly created product's name or thumbnail in the list
Selector:     a or link containing "E2E Test Product [timestamp]"
Input:        N/A
Wait for:     URL to change to /products/<stripe-id>
Validate:     Detail page shows:
  - Product name: "E2E Test Product [timestamp]"
  - Price: $19.99
  - Category: Honey
  - Short description present
  - Long description present
  - Weight: "16 oz"
  - Status badge: "In Stock"
  - Featured badge: "No"
  - Tag: "e2e-test"
  - Slug: "e2e-test-product-[timestamp]"
  - Edit button visible
  - Delete button visible
Visual check: Product images section (may be empty), all fields properly laid out, no overlapping text
a11y check:   true
Screenshot:   true
```

**Step 5: Open Edit Modal**

```
Action:       Click the "Edit" button on the detail page
Selector:     button:has-text("Edit")
Input:        N/A
Wait for:     ProductFormDialog modal to open, prefilled with the product's current data
Validate:     Modal heading reads "Edit Product", form fields contain the product's current values
Visual check: Prefilled form matches the product data, modal displays correctly
a11y check:   true
Screenshot:   true
```

**Step 6: Change Name and Price**

```
Action:       Update the product name and price fields
Selector:     input corresponding to Product Name and Price
Input:
  - Product Name: "E2E Test Product [timestamp] (edited)"
  - Price (cents): 2999 (for $29.99)
Wait for:     Fields to show updated values
Validate:     Product name now reads "E2E Test Product [timestamp] (edited)", price shows 2999
Visual check: Fields update with new values, no validation errors
a11y check:   false
Screenshot:   true
```

**Step 7: Submit the Edit**

```
Action:       Click the save/submit button
Selector:     button:has-text("Update Product")
Input:        N/A
Wait for:     Modal to close AND the detail page to show updated values
Validate:     Product name is now "E2E Test Product [timestamp] (edited)", price shows $29.99
Visual check: Updated values display correctly on the detail page
a11y check:   false
Screenshot:   true
```

**Step 8: Return to Products List**

```
Action:       Click the "Back" link/button (arrow icon) or the "Products" sidebar link
Selector:     a:has-text("Products") in sidebar, or a "Back" button/arrow on the detail page
Input:        N/A
Wait for:     URL to change to /products
Validate:     Product list shows the updated product name "E2E Test Product [timestamp] (edited)"
Visual check: Product correctly listed with updated name
a11y check:   false
Screenshot:   false
```

**Step 9: Initiate Delete**

```
Action:       Click the Delete button for the test product
Selector:     Find the row/card containing "E2E Test Product [timestamp] (edited)", then click the delete button (trash icon) within it
Input:        N/A
Wait for:     A confirmation modal/dialog to appear
Validate:     Confirmation modal reads "Confirm Delete" with text asking to confirm deletion of the product, and "Cancel" and "Delete" buttons
Visual check: Modal is styled consistently, properly centered, text is clear about what is being deleted
a11y check:   false
Screenshot:   true
```

**Step 10: Confirm Deletion**

```
Action:       Click the confirm "Delete" button in the modal
Selector:     button:has-text("Delete") within the confirmation modal (the red button)
Input:        N/A
Wait for:     Modal to close AND the product list to update (product should be gone)
Validate:     "E2E Test Product [timestamp] (edited)" no longer appears in the product list. The total count ("Showing X of Y products") decreases by 1.
Visual check: Product smoothly removed from the list, no empty state confusion
a11y check:   false
Screenshot:   true
```

#### Edge Cases

**Edge Case 1: Missing Required Fields on Create**

```
Reference:  Happy Path Steps 2-3
Variation:  Attempt to submit the form with an empty Product Name
Action:     Fill in all fields except Product Name, then click submit
Input:      Leave Product Name empty, fill everything else
Expected:   The form should show a native browser validation error on the Product Name field (since it has `required` attribute). The modal should NOT close. No console errors.
Screenshot: true
```

**Edge Case 2: Invalid Price**

```
Reference:  Happy Path Step 2
Variation:  Enter a non-numeric value in the Price field
Action:     Type "abc" in the price input (which is type="number")
Input:      "abc"
Expected:   Since the input is `type="number"`, the browser should prevent non-numeric input. The field should be empty or show no value. No console errors.
Screenshot: false
```

**Edge Case 3: Duplicate Slug on Create**

```
Reference:  Happy Path Step 2
Variation:  Use a slug that already exists for another product
Action:     Fill in the form with a slug that matches an existing product
Input:      Use an already-taken slug
Expected:   API returns an error (likely 4xx), the form shows an error message about the duplicate slug. The modal stays open.
Screenshot: true
```

**Edge Case 4: Cancel Edit Without Saving**

```
Reference:  Happy Path Steps 5-7
Variation:  Open edit modal, change fields, then cancel
Action:     Click "Edit", change the name, then click the "Cancel" button or the modal close button (X icon) or press Escape
Input:      N/A
Expected:   Modal closes without saving. The product detail page should still show the original (pre-edit) values.
Screenshot: true
```

**Edge Case 5: Cancel Deletion**

```
Reference:  Happy Path Steps 9-10
Variation:  Open delete confirmation, then cancel
Action:     Click Delete on the product, then click "Cancel" in the confirmation modal
Input:      N/A
Expected:   Modal closes, product still exists in the list and is accessible via its detail page.
Screenshot: false
```

**Edge Case 6: Create Subscription Product**

```
Reference:  Happy Path Step 2
Variation:  Select "Subscriptions" category to reveal recurring fields
Action:     Select "Subscriptions" from the Category dropdown
Input:      Category: Subscriptions
Expected:   A blue-highlighted section appears with two new fields: "Interval" (dropdown: Day/Week/Month/Year) and "Every" (number input). These fields are NOT visible for other categories.
Select:     Interval: "Month", Every: "1"
Validate:   Subscription fields are visible and editable
Screenshot: true
```

#### Cleanup

This workflow is **self-contained** — the product is deleted at the end. No cleanup needed.

**Cleanup strategy**: Self-contained

---

### Workflow 4: Settings — Content Management (Site Content, Process, Testimonials)

**Metadata**:

| Field            | Value                                    |
| ---------------- | ---------------------------------------- |
| **Priority**     | P1 (important)                           |
| **Tags**         | regression                               |
| **Duration**     | ~90s                                     |
| **Dependencies** | Requires services worker with CONTENT_KV |

**Description**: The user navigates to the Settings page and edits site content across three tabs (Site Content, Process, Testimonials). They make changes, save, and verify persistence.

**Preconditions**:

- The user is on the settings page at `/settings`
- The services worker is running with the `CONTENT_KV` binding available

**Test Data**:

| Record                   | Creation Method    | Identifier          | Cleanup         |
| ------------------------ | ------------------ | ------------------- | --------------- |
| Hero title (modified)    | UI (this workflow) | `[E2E TEST]` prefix | Paired teardown |
| E2E Test Step (process)  | UI (this workflow) | "E2E Test Step"     | Paired teardown |
| E2E Tester (testimonial) | UI (this workflow) | "E2E Tester"        | Paired teardown |

#### Happy Path

| Step | Action                         | Selector Hint                                                                                      | a11y | Expected Result                                                                      |
| ---- | ------------------------------ | -------------------------------------------------------------------------------------------------- | ---- | ------------------------------------------------------------------------------------ |
| 1    | Navigate to `/settings`        | URL `/settings`                                                                                    | Y    | Settings page loads with three tabs                                                  |
| 2    | Verify three tabs are visible  | `button:has-text("Site Content")`, `button:has-text("Process")`, `button:has-text("Testimonials")` | N    | Three tab buttons visible                                                            |
| 3    | Click "Site Content" tab       | Tab button                                                                                         | N    | Site Content form loads with fields for business info, hero, about, stats, nav, etc. |
| 4    | Modify a field in Site Content | e.g., `input` for hero headline                                                                    | N    | Field updates with new value                                                         |
| 5    | Click "Process" tab            | Tab button                                                                                         | N    | Process steps list loads (if any exist), with add/remove controls                    |
| 6    | Add a new process step         | `button:has-text("Add Step")`                                                                      | N    | New step row appears with title, icon, description fields                            |
| 7    | Click "Testimonials" tab       | Tab button                                                                                         | N    | Testimonials list loads, with add/remove controls                                    |
| 8    | Add a new testimonial          | `button:has-text("Add Testimonial")`                                                               | N    | New testimonial row appears with name, location, rating, text, date fields           |
| 9    | Click "Save Content"           | `button:has-text("Save Content")`                                                                  | N    | Success notification "Content saved successfully!", data persists on reload          |

#### Detailed Steps

**Step 1: Navigate to Settings**

```
Action:       Navigate to http://localhost:5174/settings
Selector:     N/A
Input:        N/A
Wait for:     The settings page to fully render with tabs
Validate:     Page heading reads "Settings", three tab buttons visible
Visual check: Clean layout with tab navigation at top, content area below
a11y check:   true
Screenshot:   true
```

**Step 2: Verify Three Tabs**

```
Action:       Locate the three tab buttons
Selector:     button:has-text("Site Content"), button:has-text("Process"), button:has-text("Testimonials")
Input:        N/A
Wait for:     All three tab buttons to be visible
Validate:     Three distinct tab buttons present with correct labels. "Site Content" tab should have active/highlighted styling by default.
Visual check: Tabs are styled as a horizontal navigation bar, active tab is highlighted with primary color underline
a11y check:   false
Screenshot:   true
```

**Step 3: Open Site Content Tab (active by default)**

```
Action:       If not already active, click the "Site Content" tab
Selector:     button:has-text("Site Content")
Input:        N/A
Wait for:     The site content form to load with fields populated
Validate:     Form sections for Business Info, Hero Section, About Section, Section Titles, Stats Bar, Navigation Links, Categories, Social Links, Order Confirmation, Other are visible
Visual check: Multiple section containers with labeled fields
a11y check:   false
Screenshot:   false
```

**Step 4: Modify a Field**

```
Action:       Change the Hero Headline field
Selector:     input associated with "Hero Headline" label
Input:        Type "[E2E TEST] " before the existing hero headline text (e.g., "[E2E TEST] Nature's Sweetest Gift, Straight from the Hive")
Wait for:     Field shows the updated text
Validate:     Input contains the modified text with "[E2E TEST]" prefix
Visual check: No visual issues with the field
a11y check:   false
Screenshot:   true
```

**Step 5: Switch to Process Tab**

```
Action:       Click the "Process" tab
Selector:     button:has-text("Process")
Input:        N/A
Wait for:     Process steps to load
Validate:     Process steps display (existing steps listed with step numbers, or an empty state)
Visual check: Tab content switches smoothly, no layout shift
a11y check:   false
Screenshot:   false
```

**Step 6: Add a Process Step**

```
Action:       Click "Add Step" button
Selector:     button:has-text("Add Step")
Input:        N/A
Wait for:     A new step row with input fields to appear
Validate:     New row appears with: Step number (auto-incremented), Title input, Icon input, Description textarea
Fill:         Title: "E2E Test Step", Icon: "Package", Description: "This is an automated E2E test step"
Visual check: New step row is properly laid out, fields are editable, remove button (trash icon) visible
a11y check:   false
Screenshot:   true
```

**Step 7: Switch to Testimonials Tab**

```
Action:       Click the "Testimonials" tab
Selector:     button:has-text("Testimonials")
Input:        N/A
Wait for:     Testimonials list to load
Validate:     Testimonials appear (existing ones listed with name, location, rating stars, text, date, or an empty state)
Visual check: Tab content switches, testimonials display with star ratings
a11y check:   false
Screenshot:   false
```

**Step 8: Add a Testimonial**

```
Action:       Click "Add Testimonial" button
Selector:     button:has-text("Add Testimonial")
Input:        N/A
Wait for:     New testimonial row to appear
Validate:     New row with fields: Name, Location, Rating (clickable star buttons 1-5), Text (textarea), Date
Fill:         Name: "E2E Tester", Location: "Automated Tests", Rating: click the 5th star, Text: "This is an automated E2E test testimonial.", Date: today's date (YYYY-MM-DD format)
Visual check: Testimonial form fields are editable and properly laid out, stars highlight on hover and show selected rating in yellow
a11y check:   false
Screenshot:   true
```

**Step 9: Save Content**

```
Action:       Click the "Save Content" button
Selector:     button:has-text("Save Content")
Input:        N/A
Wait for:     Success notification/toast to appear
Validate:     A green success banner appears with text "Content saved successfully!" and a checkmark icon. No error messages.
Visual check: Success banner shows at the top of the content area, then fades after ~3 seconds
a11y check:   false
Screenshot:   true
```

#### Edge Cases

**Edge Case 1: Save Without Changes**

```
Reference:  Happy Path Step 9
Variation:  Click "Save Content" without making any changes
Action:     Navigate to Settings, immediately click "Save Content" without modifying any fields
Input:      N/A
Expected:   Should save successfully (idempotent save) — green success notification "Content saved successfully!" appears. No errors.
Screenshot: false
```

**Edge Case 2: Empty Process Steps**

```
Reference:  Happy Path Steps 5-6
Variation:  Process tab loads with no existing steps
Action:     Switch to Process tab when no steps exist (all previous steps removed)
Input:      N/A
Expected:   Shows the "Add Step" button but no step rows. No error or crash.
Screenshot: true
```

**Edge Case 3: Invalid Rating Value**

```
Reference:  Happy Path Step 8
Variation:  Attempt to set an out-of-range rating
Action:     The rating is a set of 5 clickable star buttons (values 1-5). Verify there is no way to set a rating outside 1-5.
Input:      N/A
Expected:   Only values 1-5 are available as clickable stars. No input field exists for arbitrary numbers.
Screenshot: false
```

#### Cleanup

This workflow modifies data in KV storage. Cleanup is a **paired teardown**:

| Resource                     | Cleanup Action                                                                   | Verification                                       |
| ---------------------------- | -------------------------------------------------------------------------------- | -------------------------------------------------- |
| Hero Headline (Site Content) | Open Site Content tab, remove "[E2E TEST] " prefix from hero headline, save      | Reload page, hero headline is restored to original |
| E2E Test Step (Process)      | Open Process tab, click Remove (trash icon) on the "E2E Test Step" entry, save   | Process tab no longer shows "E2E Test Step"        |
| E2E Tester (Testimonial)     | Open Testimonials tab, click Remove (trash icon) on the "E2E Tester" entry, save | Testimonials tab no longer shows "E2E Tester"      |

**Cleanup strategy**: Paired teardown

---

### Workflow 5: Settings — Admin Configuration (localStorage)

**Metadata**:

| Field            | Value          |
| ---------------- | -------------- |
| **Priority**     | P1 (important) |
| **Tags**         | regression     |
| **Duration**     | ~45s           |
| **Dependencies** | None           |

**Description**: The user opens the "Admin Configuration" collapsible section on the Settings page and edits local configuration values stored in `localStorage['beeEpicAdminSettings']`.

**Preconditions**:

- The user is on the settings page at `/settings`

**Test Data**:

| Record                       | Creation Method    | Identifier          | Cleanup         |
| ---------------------------- | ------------------ | ------------------- | --------------- |
| Business Name (localStorage) | UI (this workflow) | `[E2E TEST]` suffix | Paired teardown |

#### Happy Path

| Step | Action                                 | Selector Hint                                                           | a11y | Expected Result                             |
| ---- | -------------------------------------- | ----------------------------------------------------------------------- | ---- | ------------------------------------------- |
| 1    | Click "Admin Configuration" to expand  | `summary:has-text("Admin Configuration")` or collapsible section header | N    | Collapsible section expands to show fields  |
| 2    | Modify a field                         | Business Name input                                                     | N    | Field updates                               |
| 3    | Click "Save Admin Settings"            | `button:has-text("Save Admin Settings")`                                | N    | Success message, data saved to localStorage |
| 4    | Reload the page and verify persistence | Refresh page, re-expand section                                         | N    | Modified field still shows updated value    |

#### Detailed Steps

**Step 1: Expand Admin Configuration**

```
Action:       Click or toggle the "Admin Configuration" collapsible section
Selector:     summary:has-text("Admin Configuration") or the details/summary element
Input:        N/A
Wait for:     The collapsible section to expand and reveal form fields
Validate:     Fields visible: Business Name, Email, Phone, Location, Stripe Publishable Key, Stripe Secret Key (password field), API URL, Allowed Origins
Visual check: Section expands, fields are labeled clearly, three subsections (Business Information, Stripe Configuration, API Configuration) each with their own heading
a11y check:   false
Screenshot:   true
```

**Step 2: Modify Business Name**

```
Action:       Edit the Business Name field
Selector:     input associated with "Business Name" label within the Admin Configuration section
Input:        Append " [E2E TEST]" to the existing business name value
Wait for:     Field shows updated text
Validate:     Input contains the modified business name with " [E2E TEST]" suffix
Visual check: No visual issues
a11y check:   false
Screenshot:   false
```

**Step 3: Save Admin Settings**

```
Action:       Click the "Save Admin Settings" button
Selector:     button:has-text("Save Admin Settings")
Input:        N/A
Wait for:     Success message to appear
Validate:     A green success banner appears with text "Admin settings saved successfully!". Validate via Playwright evaluate: localStorage.getItem('beeEpicAdminSettings') should contain the updated business name with " [E2E TEST]" suffix.
Visual check: Success message displays at the top of the Admin Configuration section, button may briefly disable
a11y check:   false
Screenshot:   true
```

**Step 4: Verify Persistence**

```
Action:       Reload the page (page.reload())
Selector:     N/A
Input:        N/A
Wait for:     Settings page to reload fully
Validate:     Expand Admin Configuration again — Business Name field still shows the modified value with " [E2E TEST]" appended
Visual check: Field shows persisted value after reload, confirming localStorage persistence
a11y check:   false
Screenshot:   true
```

#### Edge Cases

**Edge Case 1: Empty Required Fields Validation**

```
Reference:  Happy Path Step 3
Variation:  Clear all required fields and attempt to save
Action:     Clear the Business Name and API URL fields, then click "Save Admin Settings"
Input:      Empty strings in Business Name and API URL
Expected:   Red error text appears: "Business Name and API URL are required". The settings are NOT saved. The section does not collapse.
Screenshot: true
```

**Edge Case 2: Invalid URL Format**

```
Reference:  Happy Path Step 3
Variation:  Enter an invalid URL in the API URL field
Action:     Type "not-a-url" in the API URL field and click "Save Admin Settings"
Input:      "not-a-url"
Expected:   Red error text appears: "API URL must be a valid URL". Settings not saved.
Screenshot: true
```

#### Cleanup

This workflow modifies data in localStorage. Cleanup is a **paired teardown**:

| Resource                              | Cleanup Action                                                                  | Verification                                       |
| ------------------------------------- | ------------------------------------------------------------------------------- | -------------------------------------------------- |
| Business Name in beeEpicAdminSettings | Expand Admin Configuration, remove " [E2E TEST]" from Business Name, click Save | Reload page, Business Name is restored to original |

**Cleanup strategy**: Paired teardown

---

### Workflow 6: Navigation and Responsive Layout

**Metadata**:

| Field            | Value             |
| ---------------- | ----------------- |
| **Priority**     | P0 (critical)     |
| **Tags**         | smoke, regression |
| **Duration**     | ~60s              |
| **Dependencies** | None              |

**Description**: Verify that the sidebar navigation works correctly across all viewports, including the mobile hamburger menu with overlay.

**Preconditions**:

- The user is on any admin page (e.g., `/dashboard`)

**Test Data**:

| Record | Creation Method | Identifier | Cleanup    |
| ------ | --------------- | ---------- | ---------- |
| None   | N/A             | N/A        | Idempotent |

#### Happy Path

| Step | Action                                      | Selector Hint                                                                       | a11y | Expected Result                                    |
| ---- | ------------------------------------------- | ----------------------------------------------------------------------------------- | ---- | -------------------------------------------------- |
| 1    | Click "Dashboard" sidebar link              | `a:has-text("Dashboard")`                                                           | N    | Navigates to `/dashboard`, link shows active state |
| 2    | Click "Products" sidebar link               | `a:has-text("Products")`                                                            | N    | Navigates to `/products`, link shows active state  |
| 3    | Click "Settings" sidebar link               | `a:has-text("Settings")`                                                            | N    | Navigates to `/settings`, link shows active state  |
| 4    | Resize to tablet/mobile viewport (768x1024) | `page.setViewportSize({ width: 768, height: 1024 })`                                | N    | Sidebar collapses/hides, hamburger menu appears    |
| 5    | Click the hamburger menu button             | `button` with hamburger icon (three horizontal lines) or `[aria-label="Open menu"]` | N    | Sidebar slides in from the left                    |
| 6    | Click an overlay or close button            | Click the overlay area (outside the sidebar)                                        | N    | Sidebar slides back, overlay disappears            |
| 7    | Resize to desktop viewport (1280x720)       | `page.setViewportSize({ width: 1280, height: 720 })`                                | N    | Sidebar reappears, always visible                  |

#### Detailed Steps

**Step 1: Dashboard Link**

```
Action:       Click the "Dashboard" link in the sidebar
Selector:     a:has-text("Dashboard") within the sidebar navigation
Input:        N/A
Wait for:     URL to change to /dashboard
Validate:     URL is /dashboard, the Dashboard link in the sidebar has an active/highlighted state (different background color or text style from inactive links)
Visual check: Active link visually distinct (e.g., highlighted background, different color)
a11y check:   false
Screenshot:   true
```

**Step 2: Products Link**

```
Action:       Click the "Products" link in the sidebar
Selector:     a:has-text("Products") within the sidebar navigation
Input:        N/A
Wait for:     URL to change to /products
Validate:     URL is /products, Products link shows active state, Dashboard link no longer active
Visual check: Active state transitions correctly between links
a11y check:   false
Screenshot:   true
```

**Step 3: Settings Link**

```
Action:       Click the "Settings" link in the sidebar
Selector:     a:has-text("Settings") within the sidebar navigation
Input:        N/A
Wait for:     URL to change to /settings
Validate:     URL is /settings, Settings link shows active state, Products link no longer active
Visual check: Navigation works correctly
a11y check:   false
Screenshot:   true
```

**Step 4: Resize to Tablet/Mobile Viewport**

```
Action:       Resize browser to tablet dimensions: page.setViewportSize({ width: 768, height: 1024 })
Selector:     N/A
Input:        N/A
Wait for:     Layout to re-render, sidebar to collapse/hide
Validate:     Sidebar is now hidden (not visible on screen), a hamburger menu button (Menu icon) appears in the top navbar area
Visual check: Layout adapts — sidebar hidden, hamburger menu icon visible in the top-left area of the navbar
a11y check:   false
Screenshot:   true
```

**Step 5: Open Mobile Sidebar**

```
Action:       Click the hamburger menu button
Selector:     button with Menu icon (three horizontal lines) in the navbar, typically the first button in the header
Input:        N/A
Wait for:     Sidebar to slide in from the left, overlay to appear behind it
Validate:     Sidebar is now visible with all three links (Dashboard, Products, Settings), an overlay (semi-transparent backdrop) covers the main content area. A close button (X icon) appears in the sidebar header.
Visual check: Sidebar slides in smoothly, overlay darkens the background content
a11y check:   false
Screenshot:   true
```

**Step 6: Close Mobile Sidebar**

```
Action:       Click the overlay area (the backdrop behind the sidebar)
Selector:     The overlay/backdrop element (div with semi-transparent black background covering main content)
Input:        N/A
Wait for:     Sidebar to slide out, overlay to disappear
Validate:     Sidebar no longer visible, main content is fully interactive again
Visual check: Sidebar retracts smoothly, no visual glitches
a11y check:   false
Screenshot:   true
```

**Step 7: Return to Desktop Viewport**

```
Action:       Resize browser back to desktop: page.setViewportSize({ width: 1280, height: 720 })
Selector:     N/A
Input:        N/A
Wait for:     Layout to re-render, sidebar to become visible again
Validate:     Sidebar is permanently visible on the left side, hamburger menu (Menu icon) is hidden (CSS class `lg:hidden` hides it)
Visual check: Desktop layout restored — sidebar always visible, no hamburger icon in navbar
a11y check:   false
Screenshot:   true
```

#### Edge Cases

**Edge Case 1: Rapid Sidebar Toggle on Mobile**

```
Reference:  Happy Path Steps 5-6
Variation:  Rapidly click hamburger and overlay multiple times
Action:     On mobile viewport, click hamburger → immediately click overlay → immediately click hamburger again
Input:      N/A
Expected:   Sidebar should end in a consistent state (either open or closed, not stuck mid-animation). No console errors.
Screenshot: false
```

**Edge Case 2: Navigate While Sidebar is Open (Mobile)**

```
Reference:  Happy Path Steps 5-6
Variation:  On mobile, open sidebar and click a navigation link
Action:     Open sidebar (hamburger), click "Settings" link in the sidebar
Input:      N/A
Expected:   Sidebar closes, page navigates to /settings, no visual issues
Screenshot: false
```

**Edge Case 3: Very Narrow Viewport**

```
Reference:  Happy Path Step 4
Variation:  Resize to a very narrow width (320x568 — iPhone SE)
Action:     Set viewport to page.setViewportSize({ width: 320, height: 568 })
Input:      N/A
Expected:   Same mobile behavior — sidebar hidden, hamburger visible, all content still accessible. No horizontal scrollbar at 320px.
Screenshot: true
```

#### Cleanup

No data is modified in this workflow — it is read-only.

**Cleanup strategy**: Idempotent state

---

### Workflow 7: Dashboard → Product CRUD (Create from Dashboard, Edit/Delete from Detail Page)

**Metadata**:

| Field            | Value                 |
| ---------------- | --------------------- |
| **Priority**     | P0 (critical)         |
| **Tags**         | regression, slow      |
| **Duration**     | ~120s                 |
| **Dependencies** | None (self-contained) |

**Description**: Tests the full product lifecycle initiated from the Dashboard page. Navigates to Dashboard, uses the "Add New Product" quick action to create a product, verifies it in the list, views its detail, edits it from the detail page, deletes it from the detail page, and verifies it is removed from the list. This workflow follows the Self-Contained Testing Principle (§3.8) — the product it creates is always edited and then deleted.

**Preconditions**:

- The admin app is running at `http://localhost:5174`
- The services worker is running at `http://localhost:8787`

**Test Data**:

| Record                          | Creation Method    | Identifier                                   | Cleanup             |
| ------------------------------- | ------------------ | -------------------------------------------- | ------------------- |
| E2E Dashboard Product (created) | UI (this workflow) | `E2E Dashboard Product [timestamp]`          | Deleted in workflow |
| E2E Dashboard Product (edited)  | UI (this workflow) | `E2E Dashboard Product [timestamp] (edited)` | Deleted in workflow |

#### Happy Path

| Step | Action                                  | Selector Hint                                    | a11y | Expected Result                                                   |
| ---- | --------------------------------------- | ------------------------------------------------ | ---- | ----------------------------------------------------------------- |
| 1    | Navigate to `http://localhost:5174`     | URL                                              | Y    | Redirects to `/dashboard` with all stat cards visible             |
| 2    | Click "Add New Product" quick action    | `a:has-text("Add New Product")`                  | Y    | Navigates to `/products/new`, ProductFormDialog modal opens       |
| 3    | Fill the product form with valid data   | form fields                                      | N    | All required fields populated                                     |
| 4    | Submit the form                         | `button:has-text("Create Product")`              | N    | Modal closes, URL goes to `/products`, product appears in list    |
| 5    | Click the new product in the list       | link containing the product name                 | Y    | Navigates to `/products/:id`, detail page shows all fields        |
| 6    | Edit the product from the detail page   | `button:has-text("Edit")`                        | Y    | ProductFormDialog opens prefilled with existing data              |
| 7    | Change the product name and price       | Name and price fields                            | N    | Fields update with new values                                     |
| 8    | Submit the edit                         | `button:has-text("Update Product")`              | N    | Modal closes, detail page shows updated name and price            |
| 9    | Delete the product from the detail page | `button:has-text("Delete")` on detail page       | N    | Confirmation modal appears                                        |
| 10   | Confirm deletion                        | `button:has-text("Delete")` within confirm modal | N    | Modal closes, navigates to `/products`, product no longer in list |

#### Detailed Steps

**Step 1: Navigate to Dashboard**

```
Action:       Navigate to http://localhost:5174
Selector:     N/A
Input:        N/A
Wait for:     URL to change to /dashboard (automatic redirect)
Validate:     URL is http://localhost:5174/dashboard, stat cards are visible with numeric values
Visual check: Dashboard renders without console errors
a11y check:   true
Screenshot:   true
```

**Step 2: Open Create Product from Dashboard**

```
Action:       Click the "Add New Product" quick action link in the Quick Actions section
Selector:     a:has-text("Add New Product")
Input:        N/A
Wait for:     URL to change to /products/new AND the ProductFormDialog modal to appear
Validate:     URL is http://localhost:5174/products/new, modal heading reads "Add New Product"
Visual check: Modal is centered with overlay behind it, sticky "Add Product" button in navbar is visible
a11y check:   true
Screenshot:   true
```

**Step 3: Fill the Product Form**

```
Action:       Fill in all required fields with unique test data
Selector:     Various input fields in the form
Input:
  - Product Name: "E2E Dashboard Product [timestamp]" (use current timestamp for uniqueness)
  - Slug: "e2e-dashboard-product-[timestamp]"
  - Short Description: "Created from the Dashboard quick action — delete me"
  - Long Description: "This product was created via the Dashboard's 'Add New Product' quick action link for E2E testing."
  - Price (cents): 5999 (for $59.99)
  - Category: "Gift Sets"
  - Weight: "1 lb"
  - In Stock: checked (default)
  - Featured: unchecked (default)
  - Tags: add tag "e2e-test" (type "e2e-test" in the tag input and press Enter or click the + button)
Wait for:     All fields to be filled and no validation errors visible
Validate:     Form is complete, all fields show entered values
Visual check: Form looks properly filled, no overlapping labels or fields
a11y check:   false
Screenshot:   true
```

**Step 4: Submit the Form**

```
Action:       Click the submit/create button
Selector:     button:has-text("Create Product")
Input:        N/A
Wait for:     Modal to close AND URL to change to /products AND the new product to appear in the list
Validate:     No visible error messages. The new product "E2E Dashboard Product [timestamp]" appears in the product list with correct category badge and price $59.99. The total count ("Showing X of Y products") increases by 1 compared to before creation.
Visual check: Modal closes smoothly, product list shows the new entry
a11y check:   false
Screenshot:   true
```

**Step 5: View Product Detail**

```
Action:       Click on the newly created product's name or thumbnail in the list
Selector:     a or link containing "E2E Dashboard Product [timestamp]"
Input:        N/A
Wait for:     URL to change to /products/<stripe-id>
Validate:     Detail page shows:
  - Product name: "E2E Dashboard Product [timestamp]"
  - Price: $59.99
  - Category: Gift Sets
  - Short description present
  - Long description present
  - Weight: "1 lb"
  - Status badge: "In Stock"
  - Featured badge: "No"
  - Tag: "e2e-test"
  - Slug: "e2e-dashboard-product-[timestamp]"
  - Edit button visible
  - Delete button visible
Visual check: Product detail renders correctly with all fields, no console errors
a11y check:   true
Screenshot:   true
```

**Step 6: Open Edit Modal from Detail Page**

```
Action:       Click the "Edit" button on the detail page
Selector:     button:has-text("Edit")
Input:        N/A
Wait for:     ProductFormDialog modal to open, prefilled with the product's current data
Validate:     Modal heading reads "Edit Product", form fields contain the product's current values
Visual check: Prefilled form matches the product data from Step 5
a11y check:   true
Screenshot:   true
```

**Step 7: Change Name and Price**

```
Action:       Update the product name and price fields
Selector:     input corresponding to Product Name and Price
Input:
  - Product Name: "E2E Dashboard Product [timestamp] (edited)"
  - Price (cents): 6999 (for $69.99)
Wait for:     Fields to show updated values
Validate:     Product name now reads "E2E Dashboard Product [timestamp] (edited)", price shows 6999
Visual check: Fields update with new values, no validation errors
a11y check:   false
Screenshot:   true
```

**Step 8: Submit the Edit**

```
Action:       Click the save/submit button
Selector:     button:has-text("Update Product")
Input:        N/A
Wait for:     Modal to close AND the detail page to show updated values
Validate:     Product name is now "E2E Dashboard Product [timestamp] (edited)", price shows $69.99
Visual check: Updated values display correctly on the detail page
a11y check:   false
Screenshot:   true
```

**Step 9: Initiate Delete from Detail Page**

```
Action:       Click the "Delete" button on the detail page (the red button)
Selector:     button:has-text("Delete") on the detail page — NOT the Edit button
Input:        N/A
Wait for:     A confirmation modal/dialog to appear
Validate:     Confirmation modal reads "Confirm Delete" with text asking to confirm deletion of the product, and "Cancel" and "Delete" buttons
Visual check: Modal is styled consistently, properly centered, text is clear about what is being deleted
a11y check:   false
Screenshot:   true
```

**Step 10: Confirm Deletion from Detail Page**

```
Action:       Click the confirm "Delete" button in the modal
Selector:     button:has-text("Delete") within the confirmation modal (the red/danger button)
Input:        N/A
Wait for:     Modal to close AND URL to change to /products AND the product list to load without the deleted product
Validate:     URL is http://localhost:5174/products. "E2E Dashboard Product [timestamp] (edited)" no longer appears in the product list. The total count ("Showing X of Y products") should reflect the deletion.
Visual check: Product removed from list, no console errors, navigation from detail page to list is clean
a11y check:   false
Screenshot:   true
```

#### Edge Cases

**Edge Case 1: Cancel Edit from Detail Page (No Save)**

```
Reference:  Happy Path Steps 6-8
Variation:  Open edit modal from detail page, change fields, then cancel
Action:     Navigate to a product's detail page (use the freshly created product before editing), click Edit, change the name, then click "Cancel" or the modal close button (X icon) or press Escape
Input:      N/A
Expected:   Modal closes without saving. The product detail page should still show the original (pre-edit) values. The URL should remain at /products/:id (the detail page).
Screenshot: true
```

**Edge Case 2: Cancel Delete from Detail Page**

```
Reference:  Happy Path Steps 9-10
Variation:  Open delete confirmation from detail page, then cancel
Action:     On the detail page of a test product, click Delete, then click "Cancel" in the confirmation modal
Input:      N/A
Expected:   Modal closes, product still exists and is visible on its detail page. URL stays at /products/:id.
Screenshot: true
```

**Edge Case 3: Navigate Away from Detail While Edit Modal is Open**

```
Reference:  Happy Path Steps 6-7
Variation:  Open edit modal from detail page, then navigate away via sidebar
Action:     Open edit modal, click the "Dashboard" sidebar link while the modal is open
Input:      N/A
Expected:   Modal closes, browser navigates to /dashboard. No overlay remains stuck. No console errors.
Screenshot: true
```

**Edge Case 4: Delete Product that is Already Deleted (Double Click)**

```
Reference:  Happy Path Steps 9-10
Variation:  Rapidly click Delete button twice
Action:     On a product's detail page, rapidly double-click the Delete button, then confirm on the first confirmation modal
Input:      N/A
Expected:   Only one confirmation modal appears (no duplicate). After confirming, the product is deleted and navigated to /products. No console errors or 404s.
Screenshot: false
```

#### Cleanup

This workflow is **self-contained** — the product is created, edited, and then deleted at the end. No additional cleanup needed.

**Cleanup strategy**: Self-contained

---

## 5. Issue Reporting

> **Instructions for the testing agent**: When you discover an issue during test execution, you MUST ask the user how to handle it BEFORE taking action.
>
> The user has chosen: **File an issue report**. Create one file per issue in the `.issues/` directory at the project root. Name files using the pattern: `<workflow-name>-<kebab-case-description>.md`. The `.issues/` directory is git-ignored by default — these files are handoff artifacts for a coding agent.

### Option B: File an Issue Report

Create a detailed issue file in `.issues/<workflow-name>-<kebab-case-description>.md` using the following GitHub-issue-like format:

```markdown
---
title: "[Workflow Name] - [Brief issue description]"
workflow: "[Workflow Name]"
step: [Step number]
date: "[YYYY-MM-DD]"
---

## Description

[What went wrong — 2-3 sentences]

## Steps to Reproduce

1. [Step 1 from the workflow that led to the issue]
2. [Step 2]
3. [Step N — the failing step]

## Current Behavior

[What actually happened — error message, wrong state, missing element, etc.]

## Expected Behavior

[What should have happened per the plan]

## Screenshot

![Screenshot](data:image/png;base64,[Base64-encoded Playwright screenshot taken at the moment of failure])

## Browser Console Errors

[Any console.error or console.warn messages captured during the failing interaction]

## Suggested Fix

[Based on your understanding of the codebase, suggest what might be causing the issue and how to fix it. Include file paths and line numbers if known.]

## Environment

- Browser: Playwright (Chromium)
- Viewport: [viewport at time of failure, e.g. 1280x720]
- URL: [URL where the issue occurred]
- Plan Version: 4.0.0
```

---

## 6. User Prompts (for the testing agent)

The testing agent MUST ask the user these questions before executing this plan. Wait for the user's answer to each question before proceeding.

1. **Scope confirmation**: "This plan covers all workflows in the admin subproject. Which workflows would you like me to test?"
   - Options: "All of them", "Just [specific workflow]", "A few specific ones: [list them]"

2. **Issue handling**: "The user has pre-configured issue handling to 'File an issue report'. I will create detailed issue files in the `.issues/` directory for any problems I find. Is that still what you want?"

3. **Responsive testing**: "Should I run responsive checks at all breakpoints (desktop at 1280x720, tablet at 768x1024, and mobile at 375x812), or just the default desktop viewport?"

4. **Visual checks**: "Should I capture screenshots at each step for visual verification?"

5. **Accessibility**: "Should I run accessibility checks (aXe scans and keyboard navigation) at each step, or skip them?"

---

## 7. Plan Version History

| Version | Date       | Author              | Changes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ------- | ---------- | ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1.0.0   | 2026-05-14 | e2e-test-plan skill | Initial plan — 6 workflows covering Dashboard, Products List, Full Product Lifecycle, Settings Content, Settings Admin Config, and Navigation/Responsive                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| 1.1.0   | 2026-05-15 | e2e-test-plan skill | Added Workflow 7: Sales Reports Page — bar chart, date range picker, summary row, Reports sidebar link, API error and empty data edge cases                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| 2.0.0   | 2026-05-15 | code review         | Removed phantom Workflow 7 (Sales Reports) — `/reports` route, date range picker, charts, and sidebar link do not exist in the codebase. Plan reduced to 6 workflows.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| 3.0.0   | 2026-05-17 | e2e-test-plan skill | Fixed debounce timing 500ms→300ms (ProductsPage.tsx:84). Added workflow metadata (Priority, Tags, Duration, Dependencies). Added Test Data tables per workflow. Added a11y check field to all steps. Added data-testid convention, timeout conventions, retry strategy, and accessibility checks sections to Testing Configuration. Updated button selectors to match actual code (Create Product, Update Product). Added Cleanup strategy field to every workflow. Enhanced Workflow 2 with combined search+category filter step, results count verification at each filter stage, contextual empty state comparison edge case (ProductsPage.tsx:222-228), and combined filter no-results edge case. |
| 4.0.0   | 2026-05-18 | manual testing      | Added §3.8 Self-Contained Testing Principle: products created during testing must always be edited and then deleted. Added Workflow 7: Dashboard → Product CRUD (create from dashboard, edit from detail page, delete from detail page). Updated Workflow 3 description to reference Self-Contained Testing Principle. Updated metadata version and date.                                                                                                                                                                                                                                                                                                                                             |
