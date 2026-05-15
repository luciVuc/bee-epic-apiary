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
| **Version**        | `1.1.0`                                 |
| **Date**           | `2026-05-15`                            |
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

### Viewport

Default: `1280x720`. The testing agent should set this in Playwright before starting.

### Responsive Viewport Testing

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

### Authentication Detail

**No UI authentication required.** The admin subproject does not have a login page. API authentication is handled automatically by the Axios client interceptor which reads `VITE_API_SECRET_KEY` from environment variables and attaches it as a Bearer token on every request. The testing agent does not need to perform any authentication steps.

---

## 4. Workflows

---

### Workflow 1: Dashboard Page

**Description**: The user lands on the dashboard after navigating to `/`. They see summary statistics, a category chart, recent products, and quick action links. This workflow verifies all dashboard elements render correctly.

**Preconditions**:

- The admin app is running at `http://localhost:5174`
- The services worker is running at `http://localhost:8787`
- At least one product exists in the database (the testing agent should verify this during the "Create Product" workflow first, or ask the user)

#### Happy Path

| Step | Action                                | Selector Hint                                                             | Expected Result                                                                     |
| ---- | ------------------------------------- | ------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| 1    | Navigate to `http://localhost:5174`   | URL `http://localhost:5174`                                               | Page loads, URL redirects to `/dashboard`                                           |
| 2    | Wait for stat cards to load           | `text=Total Active Products` or similar stat card heading                 | 4 stat cards visible: Total Active Products, In Stock, Featured, Categories         |
| 3    | Verify "Quick Actions" section        | `text=Quick Actions` or a section heading                                 | Three action links visible: "Manage Products", "Add New Product", "Update Settings" |
| 4    | Verify category breakdown chart       | A bar chart heading or chart container                                    | Category breakdown (Honey, Beeswax, Gift Sets, Subscriptions) chart renders         |
| 5    | Verify "Recent Products" list         | `text=Recent Products` or similar heading                                 | Up to 5 product cards/rows visible with name and thumbnail                          |
| 6    | Click the first recent product        | `a:has(>> text=<first product name>)` or `.recent-products a:first-child` | Navigates to `/products/:id`                                                        |
| 7    | Go back to dashboard                  | Click browser back or sidebar Dashboard link                              | Dashboard loads correctly                                                           |
| 8    | Click "Add New Product" quick action  | `a:has-text("Add New Product")`                                           | Navigates to `/products/new`, the ProductFormDialog modal opens                     |
| 9    | Close the dialog                      | Click the dialog close button or press Escape                             | Dialog closes, back at dashboard                                                    |
| 10   | Verify "Add Product" button in navbar | `button:has-text("Add Product")` or navbar element                        | Button visible in the top navbar                                                    |

#### Detailed Steps

**Step 1: Navigate to Admin Home**

```
Action:       Navigate to http://localhost:5174
Selector:     N/A
Input:        N/A
Wait for:     URL to change to /dashboard (automatic redirect)
Validate:     URL is http://localhost:5174/dashboard
Visual check: Page renders without console errors, no broken layout
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
Screenshot:   true
```

**Step 9: Close the Dialog**

```
Action:       Close the modal without saving
Selector:     Modal close button (X icon) or press Escape key
Input:        N/A
Wait for:     Modal to disappear, URL to revert to /dashboard (or /products)
Validate:     Modal is no longer visible, dashboard content is accessible beneath
Visual check: Page returns to normal state, no remnant overlay
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

---

### Workflow 2: Products List — Browse, Search, Filter, and Paginate

**Description**: The user browses the full product catalog, searches by name/description, filters by category, and loads more products via pagination.

**Preconditions**:

- At least 11 products exist in the database (to verify pagination)
- The user is on the products page at `/products`

#### Happy Path

| Step | Action                            | Selector Hint                                  | Expected Result                                                                                      |
| ---- | --------------------------------- | ---------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| 1    | Navigate to `/products`           | URL `http://localhost:5174/products`           | Product list renders (table on desktop, cards on mobile)                                             |
| 2    | Verify product table/card columns | Table or card elements                         | Product name, slug, category badge, price, status badge, featured badge, Edit/Delete actions visible |
| 3    | Search by product name            | `input[placeholder*="Search"]` or search input | List filters to matching products                                                                    |
| 4    | Clear search, filter by category  | `select` or category dropdown                  | List filters to products in that category                                                            |
| 5    | Reset filter, scroll down         | Scroll to bottom of list                       | "Load More Products" button visible                                                                  |
| 6    | Click "Load More Products"        | `button:has-text("Load More Products")`        | Additional 10 products appended to the list                                                          |

#### Detailed Steps

**Step 1: Navigate to Products Page**

```
Action:       Navigate to http://localhost:5174/products
Selector:     N/A
Input:        N/A
Wait for:     Product table (desktop) or product cards (mobile) to render
Validate:     URL is /products, page title or heading contains "Products"
Visual check: The product listing renders without layout shift
Screenshot:   true
```

**Step 2: Verify Product Row Elements**

```
Action:       Inspect the first product row in the table/card layout
Selector:     Table row (`tr`) or card element containing product data
Input:        N/A
Wait for:     At least one product row to be fully rendered
Validate:     Each row contains: product thumbnail + name, category badge (styled colored pill), price formatted as currency, status badge (In Stock/Out of Stock), featured badge (Yes/No or star), Edit and Delete action buttons
Visual check: Badges are properly colored and styled, thumbnails load, text is not truncated
Screenshot:   true
```

**Step 3: Search by Product Name**

```
Action:       Type a search term into the search input
Selector:     input[type="text"][placeholder*="Search"] or input[placeholder*="product"]
Input:        Type the name of a known product (e.g., first product's name)
Wait for:     500ms debounce delay, then list updates
Validate:     The list filters to show only products matching the search term. If only one matches, only that row appears.
Visual check: Search input shows the typed term, list smoothly transitions to filtered results
Screenshot:   true
```

**Step 4: Filter by Category**

```
Action:       Clear the search input, then select a category from the filter dropdown
Selector:     select element or dropdown labelled "Category" or containing category options
Input:        Select "Honey" (or another category that has products)
Wait for:     List to update after selection
Validate:     Only products in the selected category appear (check category badge on each visible product)
Visual check: Dropdown shows the selected category, list filters correctly
Screenshot:   true
```

**Step 5: Verify "Load More" Button**

```
Action:       Reset the filter to "All", then scroll to the bottom of the product list
Selector:     Scroll until button:has-text("Load More Products") is visible
Input:        N/A
Wait for:     The "Load More Products" button to be in the viewport
Validate:     Button text reads "Load More Products", it is clickable
Visual check: Button is styled consistently, visible at the bottom of the list
Screenshot:   true
```

**Step 6: Load More Products**

```
Action:       Click the "Load More Products" button
Selector:     button:has-text("Load More Products")
Input:        N/A
Wait for:     New product rows to append to the existing list (usually ~10 new items)
Validate:     The total number of products in the list increases by ~10, the button remains at the bottom (unless fewer than 10 remain)
Visual check: New products smoothly appear, no layout jump, no duplicate entries
Screenshot:   true
```

#### Edge Cases

**Edge Case 1: Empty Search Results**

```
Reference:  Happy Path Step 3
Variation:  Search term matches no products
Action:     Type an impossible search term like "xyznonexistentproduct12345"
Input:      "xyznonexistentproduct12345"
Expected:   A "No products found" or empty state message appears. The "Load More Products" button should also be hidden. No console errors.
Screenshot: true
```

**Edge Case 2: Empty Category Filter**

```
Reference:  Happy Path Step 4
Variation:  Selected category has no products
Action:     (If possible) Select a category with no products, or remove all products from a category first, then select it
Input:      N/A
Expected:   Same empty state as Edge Case 1 — empty state message, no errors
Screenshot: true
```

**Edge Case 3: Single Product Left After Filter**

```
Reference:  Happy Path Step 4
Variation:  Filter returns exactly one product
Action:     Search for a term that matches exactly one product
Input:      A unique product name
Expected:   Single product shown, "Load More Products" button should be hidden (no more pages)
Screenshot: false
```

**Edge Case 4: Rapid Search Typing**

```
Reference:  Happy Path Step 3
Variation:  Type rapidly to test debounce behavior
Action:     Type a multi-character search term quickly (e.g., "hon") and then backspace to clear within <500ms
Input:      Type "h", "o", "n", backspace, backspace, backspace rapidly
Expected:   The list should only update after the debounce period (300ms) on the final input value. No flickering or rapid re-renders on each keystroke.
Screenshot: false
```

#### Cleanup

No data is modified in this workflow — it is read-only.

---

### Workflow 3: Full Product Lifecycle (Create → View → Edit → Delete)

**Description**: A self-contained workflow that creates a new product with a unique test name, verifies it appears in the list, views its detail, edits its name and price, verifies the changes, then deletes the product. This is a self-contained workflow — it cleans up after itself.

**Preconditions**:

- The user is on the products page at `/products`

#### Happy Path

| Step | Action                                | Selector Hint                                     | Expected Result                                                      |
| ---- | ------------------------------------- | ------------------------------------------------- | -------------------------------------------------------------------- |
| 1    | Navigate to `/products/new`           | URL or click "Add Product" button                 | ProductFormDialog modal opens                                        |
| 2    | Fill the product form with valid data | form fields                                       | All required fields populated                                        |
| 3    | Submit the form                       | `button:has-text("Create")` or submit button      | Modal closes, success notification, product appears in list          |
| 4    | Click the new product in the list     | link containing the product name                  | Navigates to `/products/:id`, detail page shows all fields correctly |
| 5    | Navigate to edit page                 | `button:has-text("Edit")` or `a:has-text("Edit")` | ProductFormDialog opens prefilled with existing data                 |
| 6    | Change the product name and price     | Name and price fields                             | Fields update with new values                                        |
| 7    | Submit the edit                       | `button:has-text("Save")` or submit button        | Modal closes, detail page shows updated name and price               |
| 8    | Navigate back to products list        | Click "Back" link or sidebar Products             | Product list shows the updated name                                  |
| 9    | Delete the product                    | Click Delete button for this product              | Confirmation modal appears                                           |
| 10   | Confirm deletion                      | `button:has-text("Delete")` or confirm button     | Modal closes, product removed from list                              |

#### Detailed Steps

**Step 1: Open Create Product Modal**

```
Action:       Navigate to http://localhost:5174/products/new
Selector:     N/A
Input:        N/A
Wait for:     The ProductFormDialog modal to appear with form fields visible
Validate:     Modal heading reads "Add New Product" or similar, form fields for Product Name, Slug, Short Description, Price, Category, Weight, In Stock, Featured, Image URLs, Thumbnail URLs, Tags are visible
Visual check: Modal is centered with overlay behind it, form is properly labeled and spaced
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
  - Price in cents: 1999 (for $19.99)
  - Category: "Honey"
  - Weight: "16 oz"
  - In Stock: checked (default)
  - Featured: unchecked (default)
  - Tags: add tag "e2e-test" (type "e2e-test" and press Enter or click Add button)
Wait for:     All fields to be filled and no validation errors visible
Validate:     Form is complete, all fields show entered values
Visual check: Form looks properly filled, no overlapping labels or fields, the tag "e2e-test" appears as a removable badge
Screenshot:   true
```

**Step 3: Submit the Form**

```
Action:       Click the submit/create button
Selector:     button:has-text("Create Product") or button[type="submit"]
Input:        N/A
Wait for:     Modal to close AND the product list to update with the new product appearing
Validate:     No visible error messages, success toast/notification may appear, the new product "E2E Test Product [timestamp]" appears in the product list
Visual check: Modal closes smoothly, product list shows the new entry with correct category badge and price
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
Screenshot:   true
```

**Step 5: Open Edit Modal**

```
Action:       Click the "Edit" button on the detail page
Selector:     button:has-text("Edit") or a:has-text("Edit")
Input:        N/A
Wait for:     ProductFormDialog modal to open, prefilled with the product's current data
Validate:     Form fields contain the product's current values, heading reads "Edit Product"
Visual check: Prefilled form matches the product data, modal displays correctly
Screenshot:   true
```

**Step 6: Change Name and Price**

```
Action:       Update the product name and price fields
Selector:     input corresponding to Product Name and Price
Input:
  - Product Name: "E2E Test Product [timestamp] (edited)"
  - Price in cents: 2999 (for $29.99)
Wait for:     Fields to show updated values
Validate:     Product name now reads "E2E Test Product [timestamp] (edited)", price shows 29.99
Visual check: Fields update with new values, no validation errors
Screenshot:   true
```

**Step 7: Submit the Edit**

```
Action:       Click the save/submit button
Selector:     button:has-text("Save") or button:has-text("Update Product") or button[type="submit"]
Input:        N/A
Wait for:     Modal to close AND the detail page to show updated values
Validate:     Product name is now "E2E Test Product [timestamp] (edited)", price shows $29.99
Visual check: Updated values display correctly on the detail page
Screenshot:   true
```

**Step 8: Return to Products List**

```
Action:       Click the "Back" link/button or the "Products" sidebar link
Selector:     a:has-text("Products") in sidebar, or a "Back" link/button on the detail page
Input:        N/A
Wait for:     URL to change to /products
Validate:     Product list shows the updated product name "E2E Test Product [timestamp] (edited)"
Visual check: Product correctly listed with updated name
Screenshot:   false
```

**Step 9: Initiate Delete**

```
Action:       Click the Delete button for the test product
Selector:     Find the row/card containing "E2E Test Product [timestamp] (edited)", then click the delete button/icon within it
Input:        N/A
Wait for:     A confirmation modal/dialog to appear
Validate:     Confirmation modal asks to confirm deletion, with "Cancel" and "Delete" buttons
Visual check: Modal is styled consistently, properly centered, text is clear about what is being deleted
Screenshot:   true
```

**Step 10: Confirm Deletion**

```
Action:       Click the confirm "Delete" button in the modal
Selector:     button:has-text("Delete") within the confirmation modal
Input:        N/A
Wait for:     Modal to close AND the product list to update (product should be gone)
Validate:     "E2E Test Product [timestamp] (edited)" no longer appears in the product list. A success message/toast may appear.
Visual check: Product smoothly removed from the list, no empty state confusion
Screenshot:   true
```

#### Edge Cases

**Edge Case 1: Missing Required Fields on Create**

```
Reference:  Happy Path Step 2-3
Variation:  Attempt to submit the form with an empty Product Name
Action:     Fill in all fields except Product Name, then click submit
Input:      Leave Product Name empty, fill everything else
Expected:   The form should show a validation error on the Product Name field (e.g., "Required" or "Product name is required"). The modal should NOT close. No console errors.
Screenshot: true
```

**Edge Case 2: Invalid Price**

```
Reference:  Happy Path Step 2
Variation:  Enter a non-numeric value in the Price field
Action:     Type "abc" in the price input
Input:      "abc"
Expected:   The field should either prevent non-numeric input or show a validation error ("Please enter a valid number"). If the browser's native number input handles it, the field should be empty or show an error.
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
Action:     Click "Edit", change the name, then click the modal close button (X icon) or press Escape
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
Expected:   Modal closes, product still exists in the list and is accessible.
Screenshot: false
```

**Edge Case 6: Create Subscription Product**

```
Reference:  Happy Path Step 2
Variation:  Select "Subscriptions" category to reveal recurring fields
Action:     Select "Subscriptions" from the Category dropdown
Input:      Category: Subscriptions
Expected:   Two new fields appear: "Interval" (dropdown: day/week/month/year) and "Every" (number input). These fields are NOT visible for other categories.
Select:     Interval: "month", Every: "1"
Validate:   Subscription fields are visible and editable
Screenshot: true
```

#### Cleanup

This workflow is **self-contained** — the product is deleted at the end. No cleanup needed.

---

### Workflow 4: Settings — Content Management (Site Content, Process, Testimonials)

**Description**: The user navigates to the Settings page and edits site content across three tabs (Site Content, Process, Testimonials). They make changes, save, and verify persistence.

**Preconditions**:

- The user is on the settings page at `/settings`
- The services worker is running with the `CONTENT_KV` binding available

#### Happy Path

| Step | Action                         | Selector Hint                                                                                      | Expected Result                                                                      |
| ---- | ------------------------------ | -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| 1    | Navigate to `/settings`        | URL `/settings`                                                                                    | Settings page loads with three tabs                                                  |
| 2    | Verify three tabs are visible  | `button:has-text("Site Content")`, `button:has-text("Process")`, `button:has-text("Testimonials")` | Three tab buttons visible                                                            |
| 3    | Click "Site Content" tab       | Tab button                                                                                         | Site Content form loads with fields for business info, hero, about, stats, nav, etc. |
| 4    | Modify a field in Site Content | e.g., `textarea` or `input` for hero title                                                         | Field updates with new value                                                         |
| 5    | Click "Process" tab            | Tab button                                                                                         | Process steps list loads (if any exist), with add/remove controls                    |
| 6    | Add a new process step         | `button:has-text("Add Step")`                                                                      | New step row appears with title, icon, description fields                            |
| 7    | Click "Testimonials" tab       | Tab button                                                                                         | Testimonials list loads, with add/remove controls                                    |
| 8    | Add a new testimonial          | `button:has-text("Add Testimonial")`                                                               | New testimonial row appears with name, location, rating, text, date fields           |
| 9    | Click "Save Content"           | `button:has-text("Save Content")` or save button                                                   | Success notification, data persists on reload                                        |

#### Detailed Steps

**Step 1: Navigate to Settings**

```
Action:       Navigate to http://localhost:5174/settings
Selector:     N/A
Input:        N/A
Wait for:     The settings page to fully render with tabs
Validate:     Page heading/title references "Settings", tabs are visible
Visual check: Clean layout with tab navigation at top, content area below
Screenshot:   true
```

**Step 2: Verify Three Tabs**

```
Action:       Locate the three tab buttons
Selector:     button:has-text("Site Content"), button:has-text("Process"), button:has-text("Testimonials")
Input:        N/A
Wait for:     All three tab buttons to be visible
Validate:     Three distinct tab buttons present with correct labels
Visual check: Tabs are styled as a horizontal navigation bar, active tab is highlighted
Screenshot:   true
```

**Step 3: Open Site Content Tab**

```
Action:       Click the "Site Content" tab
Selector:     button:has-text("Site Content")
Input:        N/A
Wait for:     The site content form to load with fields populated from API
Validate:     Form sections for Business Info, Hero Section, About Section, Section Titles, Stats Bar, Navigation Links, Categories, Social Links, Order Confirmation, Other are visible
Visual check: Multiple collapsible sections or a scrollable form with labeled fields
Screenshot:   false
```

**Step 4: Modify a Field**

```
Action:       Change the Hero Title field
Selector:     input or textarea associated with Hero Title or heroTitle
Input:        Type "[E2E TEST] " before the existing hero title text (e.g., "[E2E TEST] Original Hero Title")
Wait for:     Field shows the updated text
Validate:     Input contains the modified text
Visual check: No visual issues with the field
Screenshot:   true
```

**Step 5: Switch to Process Tab**

```
Action:       Click the "Process" tab
Selector:     button:has-text("Process")
Input:        N/A
Wait for:     Process steps to load
Validate:     Process steps display (existing steps listed, or an empty state "No process steps yet")
Visual check: Tab content switches smoothly
Screenshot:   false
```

**Step 6: Add a Process Step**

```
Action:       Click "Add Step" button
Selector:     button:has-text("Add Step")
Input:        N/A
Wait for:     A new step row with input fields to appear
Validate:     New row appears with: Step number (auto-incremented), Title input, Icon input/select, Description textarea
Fill:         Title: "E2E Test Step", Icon: "Package" (or leaf/document check), Description: "This is an automated E2E test step"
Visual check: New step row is properly laid out, fields are editable
Screenshot:   true
```

**Step 7: Switch to Testimonials Tab**

```
Action:       Click the "Testimonials" tab
Selector:     button:has-text("Testimonials")
Input:        N/A
Wait for:     Testimonials list to load
Validate:     Testimonials appear (existing ones listed, or empty state)
Visual check: Tab content switches, testimonials display with name, location, rating, text, date
Screenshot:   false
```

**Step 8: Add a Testimonial**

```
Action:       Click "Add Testimonial" button
Selector:     button:has-text("Add Testimonial")
Input:        N/A
Wait for:     New testimonial row to appear
Validate:     New row with fields: Name, Location, Rating (1-5 dropdown or input), Text (textarea), Date
Fill:         Name: "E2E Tester", Location: "Automated Tests", Rating: 5, Text: "This is an automated E2E test testimonial.", Date: today's date
Visual check: Testimonial form fields are editable and properly laid out
Screenshot:   true
```

**Step 9: Save Content**

```
Action:       Click the "Save Content" button
Selector:     button:has-text("Save Content")
Input:        N/A
Wait for:     Success notification/toast to appear
Validate:     A success message like "Content saved successfully" appears. No error messages.
Visual check: Success toast shows briefly, then fades
Screenshot:   true
```

#### Edge Cases

**Edge Case 1: Save Without Changes**

```
Reference:  Happy Path Step 9
Variation:  Click "Save Content" without making any changes
Action:     Navigate to Settings, immediately click "Save Content"
Input:      N/A
Expected:   Should save successfully (idempotent save) — success notification appears. No errors.
Screenshot: false
```

**Edge Case 2: Empty Process Steps**

```
Reference:  Happy Path Steps 5-6
Variation:  Process tab loads with no existing steps
Action:     Switch to Process tab when no steps exist
Input:      N/A
Expected:   Shows "No process steps yet" or "Add your first step" empty state. The "Add Step" button should still be available.
Screenshot: true
```

**Edge Case 3: Invalid Rating Value**

```
Reference:  Happy Path Step 8
Variation:  Enter a rating outside the 1-5 range
Action:     In the testimonial rating field, try to enter 0 or 6
Input:      0 or 6
Expected:   The field should reject values outside 1-5 (either prevent input or show validation error). If it's a dropdown, the option should not exist.
Screenshot: false
```

#### Cleanup

This workflow modifies data in KV storage. Cleanup is a **paired teardown**:

| Resource                  | Cleanup Action                                                             | Verification                                    |
| ------------------------- | -------------------------------------------------------------------------- | ----------------------------------------------- |
| Hero Title (Site Content) | Open Site Content tab, remove "[E2E TEST] " prefix from hero title, save   | Reload page, hero title is restored to original |
| E2E Test Step (Process)   | Open Process tab, click Remove/Delete on the "E2E Test Step" entry, save   | Process tab no longer shows "E2E Test Step"     |
| E2E Test Testimonial      | Open Testimonials tab, click Remove/Delete on the "E2E Tester" entry, save | Testimonials tab no longer shows "E2E Tester"   |

**Cleanup strategy**: Paired teardown

---

### Workflow 5: Settings — Admin Configuration (localStorage)

**Description**: The user opens the "Admin Configuration" section on the Settings page and edits local configuration values stored in `localStorage['beeEpicAdminSettings']`.

**Preconditions**:

- The user is on the settings page at `/settings`

#### Happy Path

| Step | Action                                 | Selector Hint                                                          | Expected Result                             |
| ---- | -------------------------------------- | ---------------------------------------------------------------------- | ------------------------------------------- |
| 1    | Click "Admin Configuration" to expand  | `button:has-text("Admin Configuration")` or collapsible section header | Collapsible section expands to show fields  |
| 2    | Modify a field                         | e.g., Business Name input                                              | Field updates                               |
| 3    | Click "Save Admin Settings"            | `button:has-text("Save Admin Settings")`                               | Success message, data saved to localStorage |
| 4    | Reload the page and verify persistence | Refresh page, re-expand section                                        | Modified field still shows updated value    |

#### Detailed Steps

**Step 1: Expand Admin Configuration**

```
Action:       Click or toggle the "Admin Configuration" collapsible section
Selector:     button:has-text("Admin Configuration") or summary/details element or section heading
Input:        N/A
Wait for:     The collapsible section to expand and reveal form fields
Validate:     Fields visible: Business Name, Email, Phone, Location, Stripe Publishable Key, Stripe Secret Key (password), API URL, Allowed Origins
Visual check: Section expands with smooth animation, fields are labeled clearly
Screenshot:   true
```

**Step 2: Modify Business Name**

```
Action:       Edit the Business Name field
Selector:     input associated with Business Name or businessName
Input:        Append " [E2E TEST]" to the existing business name
Wait for:     Field shows updated text
Validate:     Input contains the modified business name
Visual check: No visual issues
Screenshot:   false
```

**Step 3: Save Admin Settings**

```
Action:       Click the "Save Admin Settings" button
Selector:     button:has-text("Save Admin Settings")
Input:        N/A
Wait for:     Success message to appear (e.g., "Settings saved")
Validate:     A success notification/message appears. Check localStorage via browser: localStorage.getItem('beeEpicAdminSettings') should contain the updated business name.
Visual check: Success message displays, button may briefly disable
Screenshot:   true
```

**Step 4: Verify Persistence**

```
Action:       Reload the page (page.reload())
Selector:     N/A
Input:        N/A
Wait for:     Settings page to reload fully
Validate:     Expand Admin Configuration again — Business Name field still shows the modified value with "[E2E TEST]" appended
Visual check: Field shows persisted value after reload
Screenshot:   true
```

#### Edge Cases

**Edge Case 1: Empty Required Fields Validation**

```
Reference:  Happy Path Step 3
Variation:  Clear all required fields and attempt to save
Action:     Clear the Business Name, Email, Phone, Location, and API URL fields, then click Save
Input:      Empty strings in all fields
Expected:   Validation errors appear on required fields. The settings are NOT saved. The section should not collapse.
Screenshot: true
```

**Edge Case 2: Invalid URL Format**

```
Reference:  Happy Path Step 3
Variation:  Enter an invalid URL in the API URL field
Action:     Type "not-a-url" in the API URL field and click Save
Input:      "not-a-url"
Expected:   Validation error on the URL field ("Please enter a valid URL" or similar). Settings not saved.
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

**Description**: Verify that the sidebar navigation works correctly across all viewports, including the mobile hamburger menu with overlay.

**Preconditions**:

- The user is on any admin page (e.g., `/dashboard`)

#### Happy Path

| Step | Action                                      | Selector Hint                                                                       | Expected Result                                    |
| ---- | ------------------------------------------- | ----------------------------------------------------------------------------------- | -------------------------------------------------- |
| 1    | Click "Dashboard" sidebar link              | `a:has-text("Dashboard")`                                                           | Navigates to `/dashboard`, link shows active state |
| 2    | Click "Products" sidebar link               | `a:has-text("Products")`                                                            | Navigates to `/products`, link shows active state  |
| 3    | Click "Settings" sidebar link               | `a:has-text("Settings")`                                                            | Navigates to `/settings`, link shows active state  |
| 4    | Resize to tablet/mobile viewport (768x1024) | `page.setViewportSize({ width: 768, height: 1024 })`                                | Sidebar collapses/hides, hamburger menu appears    |
| 5    | Click the hamburger menu button             | `button` with hamburger icon (three horizontal lines) or `[aria-label="Open menu"]` | Sidebar slides in from the left                    |
| 6    | Click an overlay or close button            | Click the overlay area (outside the sidebar)                                        | Sidebar slides back, overlay disappears            |
| 7    | Resize to desktop viewport (1280x720)       | `page.setViewportSize({ width: 1280, height: 720 })`                                | Sidebar reappears, always visible                  |

#### Detailed Steps

**Step 1: Dashboard Link**

```
Action:       Click the "Dashboard" link in the sidebar
Selector:     a:has-text("Dashboard") within the sidebar navigation
Input:        N/A
Wait for:     URL to change to /dashboard
Validate:     URL is /dashboard, the Dashboard link in the sidebar has an active/highlighted state (different background color or text style from inactive links)
Visual check: Active link visually distinct (e.g., highlighted background, different color)
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
Screenshot:   true
```

**Step 4: Resize to Tablet/Mobile Viewport**

```
Action:       Resize browser to tablet dimensions: page.setViewportSize({ width: 768, height: 1024 })
Selector:     N/A
Input:        N/A
Wait for:     Layout to re-render, sidebar to collapse/hide
Validate:     Sidebar is now hidden (not visible on screen), a hamburger menu button appears in the navbar or top-left area
Visual check: Layout adapts — sidebar hidden, hamburger icon visible
Screenshot:   true
```

**Step 5: Open Mobile Sidebar**

```
Action:       Click the hamburger menu button
Selector:     button with three horizontal lines icon, or [aria-label*="menu" i], or a button adjacent to where the sidebar was
Input:        N/A
Wait for:     Sidebar to slide in from the left, overlay to appear behind it
Validate:     Sidebar is now visible with all three links (Dashboard, Products, Settings), an overlay (semi-transparent backdrop) covers the main content area
Visual check: Sidebar slides in smoothly, overlay darkens the background content
Screenshot:   true
```

**Step 6: Close Mobile Sidebar**

```
Action:       Click the overlay area (the backdrop behind the sidebar)
Selector:     The overlay/backdrop element (div with semi-transparent background covering main content)
Input:        N/A
Wait for:     Sidebar to slide out, overlay to disappear
Validate:     Sidebar no longer visible, main content is fully interactive again
Visual check: Sidebar retracts smoothly, no visual glitches
Screenshot:   true
```

**Step 7: Return to Desktop Viewport**

```
Action:       Resize browser back to desktop: page.setViewportSize({ width: 1280, height: 720 })
Selector:     N/A
Input:        N/A
Wait for:     Layout to re-render, sidebar to become visible again
Validate:     Sidebar is permanently visible on the left side, hamburger menu is hidden
Visual check: Desktop layout restored — sidebar always visible, no hamburger icon
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
Action:     Open sidebar (hamburger), click "Settings" link
Input:      N/A
Expected:   Sidebar closes, page navigates to /settings, no visual issues
Screenshot: false
```

**Edge Case 3: Very Narrow Viewport**

```
Reference:  Happy Path Step 4
Variation:  Resize to a very narrow width (320x568 — iPhone SE)
Action:     Set viewport to 320x568
Input:      N/A
Expected:   Same mobile behavior — sidebar hidden, hamburger visible, all content still accessible. No horizontal scrollbar at 320px.
Screenshot: true
```

#### Cleanup

No data is modified in this workflow — it is read-only.

---

### Workflow 7: Sales Reports Page

**Description**: The user navigates to the Sales Reports page and views daily sales data. They select a date range using the date range picker, observe the bar chart update, and verify the summary row (total revenue, order count) reflects the selected period.

**Preconditions**:

- The admin app is running at `http://localhost:5174`
- The services worker is running at `http://localhost:8787`
- At least a few orders exist in the system across different dates (so the chart and summary show non-zero data)

#### Happy Path

| Step | Action                                          | Selector Hint                                              | Expected Result                                                                                          |
| ---- | ----------------------------------------------- | ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| 1    | Navigate to `/reports`                          | URL `http://localhost:5174/reports`                        | Page loads with a heading "Sales Reports", date range picker, bar chart area, and summary section        |
| 2    | Verify the date range picker                    | `input[type="date"]` or date picker inputs                 | Two date inputs visible: Start Date and End Date, defaulting to a reasonable range (e.g., last 30 days)  |
| 3    | Verify the bar chart renders                    | A chart container or canvas/svg element                    | Bar chart of daily sales renders with date labels on x-axis and revenue on y-axis                        |
| 4    | Verify the summary row                          | Section or row with "Total Revenue" and "Orders"           | Total revenue (formatted as currency) and total order count are displayed for the selected period        |
| 5    | Change the start date                           | Click the Start Date input and select an earlier date      | Date input shows the new date, chart re-renders with updated data for the new range, summary row updates |
| 6    | Change the end date                             | Click the End Date input and select a date closer to today | Date input shows the new date, chart updates, summary row updates                                        |
| 7    | Verify the "Reports" link exists in the sidebar | `a:has-text("Reports")` within the sidebar navigation      | Sidebar contains a Reports link that navigates to `/reports` and shows active state                      |

#### Detailed Steps

**Step 1: Navigate to Sales Reports Page**

```
Action:       Navigate to http://localhost:5174/reports
Selector:     N/A
Input:        N/A
Wait for:     The page to fully render — heading, date picker, chart area, and summary section all visible
Validate:     URL is /reports, page heading contains "Sales Reports"
Visual check: Page has a clean layout: date range picker at the top, chart in the middle, summary row below or alongside the chart
Screenshot:   true
```

**Step 2: Verify Date Range Picker**

```
Action:       Locate the date range picker inputs
Selector:     Two adjacent date input fields — typically input[type="date"] or a custom date picker component
Input:        N/A
Wait for:     Both date inputs to be visible and populated with default values
Validate:     Two inputs present: Start Date and End Date. End Date defaults to today (or current date). Start Date defaults to 30 days prior.
Visual check: Date inputs are properly labeled, display the date in a readable format (YYYY-MM-DD or localized), and are aligned horizontally
Screenshot:   true
```

**Step 3: Verify Bar Chart**

```
Action:       Locate the bar chart area
Selector:     A chart container element — may be a div, canvas, or SVG element containing bar representations
Input:        N/A
Wait for:     Chart to render with visible bars and axis labels
Validate:     Bars are present (one per day in the selected range), x-axis shows dates, y-axis shows revenue amounts. No "No data" or empty state error visible (assuming data exists).
Visual check: Bars are evenly spaced, axis labels are readable and not overlapping, bars have consistent styling/colors
Screenshot:   true
```

**Step 4: Verify Summary Row**

```
Action:       Locate the summary row/section below or beside the chart
Selector:     A section, div, or row containing "Total Revenue" and "Orders" labels and their values
Input:        N/A
Wait for:     Summary values to be populated
Validate:     Total Revenue is displayed as a currency amount (e.g., "$1,234.56"). Orders displays an integer count (e.g., "42"). Both values are greater than 0 if data exists.
Visual check: Summary values are styled prominently (larger font, perhaps a different background), labels are clear
Screenshot:   true
```

**Step 5: Change Start Date**

```
Action:       Click the Start Date input and select an earlier date (e.g., 60 days ago)
Selector:     input[type="date"] associated with "Start Date" or the first date input in the date range picker
Input:        A date string 60 days before the current date (e.g., "2026-03-16" if today is 2026-05-15)
Wait for:     The chart area to show a loading indicator (brief spinner or skeleton) then re-render with updated bars
Validate:     The date range now spans ~60 days. The chart shows more bars (one per day). The Total Revenue and Orders values in the summary row have updated to reflect the wider range.
Visual check: Chart smoothly transitions to the new data, no layout shift, loading indicator appears and disappears
Screenshot:   true
```

**Step 6: Change End Date**

```
Action:       Click the End Date input and select a date closer to the start date (e.g., narrow to a 7-day range)
Selector:     input[type="date"] associated with "End Date" or the second date input
Input:        A date string 7 days after the start date (e.g., if start is 2026-03-16, set end to 2026-03-23)
Wait for:     Chart to re-render with fewer bars
Validate:     The date range now spans only ~7 days. The chart shows ~7 bars. Summary row values are lower and reflect only that 7-day period.
Visual check: Chart updates correctly, no console errors, no duplicate or overlapping bars
Screenshot:   true
```

**Step 7: Verify "Reports" Sidebar Link**

```
Action:       Click the "Reports" link in the sidebar navigation
Selector:     a:has-text("Reports")
Input:        N/A
Wait for:     URL to remain at /reports (already there)
Validate:     The Reports link in the sidebar shows an active/highlighted state (different background or color from inactive links like Dashboard, Products, Settings)
Visual check: Active link visually distinct, consistent with how other active sidebar links are styled
Screenshot:   true
```

#### Edge Cases

**Edge Case 1: No Sales Data in Selected Range**

```
Reference:  Happy Path Steps 3-4
Variation:  The selected date range has zero orders
Action:     Set the date range to a period far in the past (e.g., 2010-01-01 to 2010-01-31) where no orders exist
Input:      Start: "2010-01-01", End: "2010-01-31"
Expected:   The chart shows a "No data for this period" or empty state message (no bars). The summary row shows $0.00 total revenue and 0 orders. No console errors or blank page. The page should not be blank.
Screenshot: true
```

**Edge Case 2: Invalid Date Range (End Before Start)**

```
Reference:  Happy Path Steps 5-6
Variation:  Set the End Date to a date before the Start Date
Action:     Set Start Date to "2026-05-15", End Date to "2026-05-01"
Input:      Start: "2026-05-15", End: "2026-05-01"
Expected:   The UI should show a validation error or automatically swap the dates. Alternatively, the API should return an empty dataset. The page should not crash or show a blank white screen. No console errors.
Screenshot: true
```

**Edge Case 3: Single Day Range**

```
Reference:  Happy Path Steps 5-6
Variation:  Set both start and end date to the same day
Action:     Set Start Date and End Date to the same day (e.g., today)
Input:      Start and End both set to today's date
Expected:   Chart shows one bar for that single day (or a "no data" state if no orders on that day). Summary shows revenue and orders for that single day. No console errors.
Screenshot: true
```

**Edge Case 4: API Failure on Reports Endpoint**

```
Reference:  Happy Path Step 1
Variation:  The services worker returns an error from GET /reports/sales
Action:     Stop the services worker (or simulate API failure), then navigate to /reports
Input:      N/A
Expected:   The page shows an error message or banner indicating the report data could not be loaded. The chart area may show an error state. The page should not be completely blank.
Screenshot: true
```

**Edge Case 5: Very Long Date Range**

```
Reference:  Happy Path Steps 5-6
Variation:  Select a very wide date range spanning multiple years
Action:     Set Start Date to 5 years ago, End Date to today
Input:      Start: 5 years before today, End: today
Expected:   The chart renders with many bars (potentially aggregated by month or week instead of daily to avoid overcrowding). The summary row shows totals for the full range. No performance degradation or page unresponsiveness. No console errors.
Screenshot: true
```

#### Cleanup

No data is modified in this workflow — it is read-only.

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
```

[Any console.error or console.warn messages captured during the failing interaction]

```

## Suggested Fix

[Based on your understanding of the codebase, suggest what might be causing the issue and how to fix it. Include file paths and line numbers if known.]

## Environment

- Browser: Playwright (Chromium)
- Viewport: [viewport at time of failure, e.g. 1280x720]
- URL: [URL where the issue occurred]
- Plan Version: 1.1.0
```

---

## 6. User Prompts (for the testing agent)

The testing agent MUST ask the user these questions before executing this plan. Wait for the user's answer to each question before proceeding.

1. **Scope confirmation**: "This plan covers all workflows in the admin subproject. Which workflows would you like me to test?"
   - Options: "All of them", "Just [specific workflow]", "A few specific ones: [list them]"

2. **Issue handling**: "The user has pre-configured issue handling to 'File an issue report'. I will create detailed issue files in the `.issues/` directory for any problems I find. Is that still what you want?"

3. **Responsive testing**: "Should I run responsive checks at all breakpoints (desktop at 1280x720, tablet at 768x1024, and mobile at 375x812), or just the default desktop viewport?"

4. **Visual checks**: "Should I capture screenshots at each step for visual verification?"

---

## 7. Plan Version History

| Version | Date       | Author              | Changes                                                                                                                                                  |
| ------- | ---------- | ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1.0.0   | 2026-05-14 | e2e-test-plan skill | Initial plan — 6 workflows covering Dashboard, Products List, Full Product Lifecycle, Settings Content, Settings Admin Config, and Navigation/Responsive |
| 1.1.0   | 2026-05-15 | e2e-test-plan skill | Added Workflow 7: Sales Reports Page — bar chart, date range picker, summary row, Reports sidebar link, API error and empty data edge cases              |
