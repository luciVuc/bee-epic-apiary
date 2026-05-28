# Admin E2E Testing Plan — Admin Panel

Tests for the `admin/` sub-project: a React 18 + Vite admin panel for Stripe product CRUD.

**Executor**: AI agent with Playwright browser automation.
**Base URL**: `http://localhost:5174`
**Router**: BrowserRouter (standard paths)
**API**: Vite proxy `/api` → `http://localhost:8787` (rewrites `/api` prefix)
**Auth**: Bearer token `VITE_API_SECRET_KEY=dev-api-key-change-me` sent with every request
**Stripe**: Real Stripe test mode — created products are real Stripe resources
**Requires**: `services/` dev server running on port 8787

---

## Monitoring Requirements

Throughout **every test**, the agent MUST continuously monitor:

| Monitor     | What to check                                                                                                                                                 | Fail condition                   |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- |
| **Console** | `console.error`, `console.warn`, uncaught exceptions, unhandled promise rejections                                                                            | Any of the above                 |
| **Network** | All API requests (GET/POST/PUT/DELETE to `/api/products*`, `/api/prices`, `/api/products/count`), 4xx/5xx responses, connection errors, CORS errors, timeouts | Any failure or unexpected status |
| **DOM**     | Error banners (`.bg-red-50`, `.text-red-700`), blank screens, infinite loading spinners (>10s), unexpected modals, missing data rows                          | Any irregularity                 |

**On any failure**: Log the error details (console message, request URL, status code, DOM snapshot), take a screenshot, then halt the test suite.

---

## Setup

The agent MUST first ensure the services API is running on port 8787:

```bash
# Kill any existing process on port 8787 and restart cleanly
pkill -f "wrangler dev" || true
lsof -ti:8787 | xargs kill -9 2>/dev/null || true
sleep 2
```

Then start both servers:

```bash
# From project root:
npx wrangler dev --port 8787 &   # services API in background
sleep 5

npm run admin:dev &              # admin dev server in background

# Wait for both to be ready:
until curl -s -o /dev/null -w "%{http_code}" http://localhost:8787/products | grep -q 200; do sleep 1; done
until curl -s -o /dev/null -w "%{http_code}" http://localhost:5174 | grep -q 200; do sleep 1; done
```

**Preconditions**:

- `services/.dev.vars` has `STRIPE_SECRET_KEY` set to a valid Stripe test key
- `admin/.env` has `VITE_API_SECRET_KEY=dev-api-key-change-me`

**Clean state** (run before each test session):

```js
localStorage.removeItem("beeEpicAdminSettings");
```

**Preconditions**:

- `services/.dev.vars` has `STRIPE_SECRET_KEY` set to a valid Stripe test key
- `admin/.env` has `VITE_API_SECRET_KEY=dev-api-key-change-me`

**Clean state** (run before each test session):

```js
localStorage.removeItem("beeEpicAdminSettings");
```

---

## Test 1: Dashboard Page

Navigate to `http://localhost:5174/dashboard`. Wait for API calls to complete.

**Assertions**:

- Heading "Dashboard" visible
- 4 stat cards: "Total Active Products", "In Stock", "Featured", "Categories"
- "Products by Category" chart with category breakdown bars
- "Quick Actions": "Manage Products", "Add New Product", "Update Settings" links
- "Recent Products" section shows up to 5 product rows (name, price, category, status)
- "Add Product" button in header

---

## Test 2: Products List Page

Navigate to `http://localhost:5174/products`. Wait for list to load.

**Assertions**:

- Heading "Products Management" visible
- "Add Product" button present
- Search input and category filter dropdown visible
- Desktop: product table with columns — Product (thumbnail + name/slug), Category, Price, Status, Featured, Actions (Edit/Delete)
- Each row shows category badge, stock status badge, featured badge if applicable
- "Showing X of Y products" text visible
- "Load More Products" button visible (if >10 products)

---

## Test 3: Product Search & Filter

Navigate to `http://localhost:5174/products`.

1. Type "honey" in search → only honey products shown (Wildflower, Clover, Buckwheat)
2. Clear search, select "BEESWAX" filter → only beeswax products
3. Select "ALL" → all products restored

---

## Test 4: Create a New Product

Navigate to `http://localhost:5174/products/new`. Wait for "Add New Product" dialog modal.

**Fill form**:

```text
Product Name:       E2E Test Honey
Slug:               e2e-test-honey
Short Description:  Created by automated E2E test
Long Description:   This product was created as part of an end-to-end test.
Price (cents):      2500
Category:           HONEY
Weight:             16 oz
In Stock:           ✓ (checked)
Featured:           ✓ (checked)
Image URLs:         https://via.placeholder.com/400
Thumbnail URLs:     https://via.placeholder.com/100
Tags:               e2e, test, automated
```

Click "Create Product".

**Assertions**:

- Modal closes
- Product list refreshes — "E2E Test Honey" appears
- No error banner visible
- Behind the scenes: `POST /api/products` → `POST /api/prices` → `PUT /api/products/:id` all return 200

---

## Test 5: View Product Detail

On the products list, click "E2E Test Honey" name link. URL becomes `http://localhost:5174/products/prod_XXXXX`.

**Assertions**:

- Product name "E2E Test Honey" visible
- Price "$25.00" displayed
- Category "HONEY" shown
- Stock status "In Stock" (green badge)
- Featured shows "Yes" with star icon
- Description text visible
- "Edit" and "Delete" buttons present
- Stripe Price ID displayed

---

## Test 6: Edit a Product

From the product detail page, click "Edit". URL becomes `http://localhost:5174/products/prod_XXXXX/edit`. Edit dialog pre-fills with existing data.

**Make changes**:

```text
Product Name:     E2E Test Honey (Updated)
Price (cents):    3000
In Stock:         ✓ (keep checked)
Featured:         ✗ (uncheck)
```

Click "Update Product".

**Assertions**:

- Modal closes
- Detail page shows updated name "E2E Test Honey (Updated)"
- Price is "$30.00"
- Featured shows "No"
- No error banner

---

## Test 7: Delete a Product

Navigate to products list. Find "E2E Test Honey (Updated)". Click its trash icon.

**Assertions**:

- Confirmation dialog: "Are you sure you want to delete 'E2E Test Honey (Updated)'?"
- Click "Delete" (red button)
- Dialog closes, product removed from list
- `DELETE /api/products/prod_XXXXX` returns 200
- "E2E Test Honey (Updated)" no longer visible
- Total count decremented by 1

---

## Test 8: Delete — Cancel Action

1. Click Delete on any product
2. Confirmation dialog appears
3. Click "Cancel"

**Assertion**: Dialog closes, product still visible, no API call made.

---

## Test 9: Settings Page

Navigate to `http://localhost:5174/settings`.

**Assertions**:

- Heading "Settings" visible
- "Business Information": Business Name = "Bee Epic Apiary", Email = "hello@beeepicapiary.com", Phone, Location
- "Stripe Configuration": Publishable Key field, Secret Key (password) field
- "API Configuration": API URL = "http://localhost:8787", Allowed Origins pre-filled
- "Save Settings" button

---

## Test 10: Settings — Save and Persist

1. Change Business Name to "E2E Test Apiary"
2. Change Email to "e2e@test.com"
3. Click "Save Settings"

**Assertions**:

- Green success banner: "Settings saved successfully!"
- Banner auto-disappears after ~3 seconds
- Reload page → Business Name still "E2E Test Apiary" (persisted in localStorage)
- Restore original values after test

---

## Test 11: Settings — Validation

1. Clear Business Name → click Save → error "Business Name and API URL are required"
2. Fill Business Name back, clear API URL → click Save → same validation error
3. Set API URL to "not-a-url" → click Save → error "API URL must be a valid URL"

---

## Test 12: Navigation (Sidebar)

Navigate through sidebar links:

1. Start at `http://localhost:5174/dashboard` → Dashboard link is active/highlighted
2. Click "Products" → URL `http://localhost:5174/products`, Products link active
3. Click "Settings" → URL `http://localhost:5174/settings`, Settings link active
4. Click "Dashboard" → URL `http://localhost:5174/dashboard`, Dashboard link active

---

## Test 13: Dashboard Stats Update After CRUD

1. Note current "Total Active Products" count (N)
2. Create a new product (see Test 4)
3. Navigate back to Dashboard → count shows N+1
4. Delete the new product
5. Refresh Dashboard → count back to N

---

## Test 14: API Error Handling

1. Stop services: `pkill -f "wrangler dev"`
2. Navigate to products page
3. **Assertion**: Red error banner appears ("Network Error" or "Request failed")
4. Restart services: `npm run services:dev`
5. Reload products page
6. **Assertion**: Products load successfully, no error banner

---

## Test 15: Mobile Responsive

Set viewport to 375x812, navigate to `http://localhost:5174/dashboard`.

**Assertions**:

- Sidebar hidden by default (`-translate-x-full`)
- Hamburger/menu button visible in navbar
- Click menu → sidebar slides in
- Click overlay → sidebar slides out
- Product cards use mobile card layout (not desktop table)
- Single-column layout

---

## Test 16: Empty State — No Search Results

1. Navigate to products
2. Search for "zzzzz_impossible_product_name_99999"

**Assertions**:

- "No products found" message with "Try adjusting your search or filter" text
- "Add Product" button still visible

---

## Test 17: Subscription Product Creation (Recurring)

Navigate to `http://localhost:5174/products/new`.

**Fill form**:

```text
Name:       E2E Subscription Test
Slug:       e2e-subscription-test
Description: E2E test subscription
Price:      1500
Category:   SUBSCRIPTIONS
Weight:     "1 month"
```

**Verify**: Recurring fields (Interval, Every) appear when SUBSCRIPTIONS is selected.
Set Interval="month", Every=1. Add placeholder image URLs. Click "Create Product".

**Assertions**:

- Product created successfully
- Detail page shows "Subscription" badge
- "every 1 month" recurring info visible
- Price "$15.00"

**Cleanup**: Delete this subscription product after test.

---

## Test 18: Pagination / Load More

**Precondition**: More than 10 products exist in Stripe (or set `limit` lower).

1. Navigate to products page
2. Initial batch loads (up to 10 items)
3. Click "Load More Products"

**Assertions**:

- Additional products appended to list
- "Showing X of Y products" count updates
- Scroll position preserved

---

## Test 19: Dashboard Quick Action Links

1. On Dashboard, click "Manage Products" → navigates to `http://localhost:5174/products`
2. Back to Dashboard, click "Add New Product" → opens "Add New Product" dialog
3. Close dialog, click "Update Settings" → navigates to `http://localhost:5174/settings`

---

## Key Selectors Reference

| Element                 | Selector Hint                                         |
| ----------------------- | ----------------------------------------------------- |
| Sidebar Dashboard link  | `a` with text "Dashboard"                             |
| Sidebar Products link   | `a` with text "Products"                              |
| Sidebar Settings link   | `a` with text "Settings"                              |
| Add Product button      | `button` or `a` with text "Add Product"               |
| Search input            | `input[placeholder="Search products..."]`             |
| Category filter         | `select` next to filter icon                          |
| Product rows (desktop)  | `table tbody tr`                                      |
| Product cards (mobile)  | `div` with product card layout in `md:hidden`         |
| Delete button           | `button` containing Trash2 icon or text "Delete"      |
| Edit button             | `button` containing Edit icon or text "Edit"          |
| "Load More" button      | `button` with text "Load More Products"               |
| Settings Save button    | `button` with text "Save Settings"                    |
| Dashboard stat cards    | `div` containing stat title and value                 |
| Product Form Dialog     | Modal overlay with form inputs (`ProductFormDialog`)  |
| Delete confirmation     | Fixed overlay with "Confirm Delete" heading           |
| Settings success banner | Green banner with text "Settings saved successfully!" |
| Error banner            | Red banner with `AlertCircle` icon                    |
