# Web E2E Testing Plan — Customer Storefront

Tests for the `web/` sub-project: a React 19 + Vite customer-facing PWA storefront.

**Executor**: AI agent with Playwright browser automation.
**Base URL**: `http://localhost:5173`
**Router**: BrowserRouter — all paths are `/...`
**Data source**: Backend API (`services/` Cloudflare Worker) — product listing, site content, testimonials, and process steps are fetched via the API. Legacy JSON files (`src/data/`) are no longer imported.
**Requires**: `services/` dev server running on port 8787 (for all data and checkout flow).

---

## Monitoring Requirements

Throughout **every test**, the agent MUST continuously monitor:

| Monitor     | What to check                                                                                                  | Fail condition                   |
| ----------- | -------------------------------------------------------------------------------------------------------------- | -------------------------------- |
| **Console** | `console.error`, `console.warn`, uncaught exceptions, unhandled promise rejections                             | Any of the above                 |
| **Network** | All API requests (checkout POST), 4xx/5xx responses, connection errors, CORS errors, timeouts                  | Any failure or unexpected status |
| **DOM**     | Error banners (`text-red-600`, `.bg-red-50`), blank screens, infinite loading spinners (>10s), missing content | Any irregularity                 |

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

npm run web:dev &                # web dev server in background

# Wait for both to be ready (poll until 200):
until curl -s -o /dev/null -w "%{http_code}" http://localhost:8787/products | grep -q 200; do sleep 1; done
until curl -s -o /dev/null -w "%{http_code}" http://localhost:5173 | grep -q 200; do sleep 1; done
```

**Clean state** (run before each test session):

```js
localStorage.removeItem("goldenHiveCart");
```

---

## Test 1: Homepage Loads

1. Navigate to `http://localhost:5173`
2. Wait for page to fully render

**Assertions**:

- Page title contains "Bee Epic Apiary"
- Hero section visible with headline "Nature's Sweetest Gift, Straight from the Hive"
- Bee emoji (🐝) present in the navbar
- Navigation links visible: Home, About, Shop, Contact
- Stats section shows: "15+ Years of Experience", "100% Raw & Natural", "California Proud", "Since 2009"
- At least one product card visible in the Featured Products section

---

## Test 2: Navigation Works (All Routes)

1. Click "Shop" → URL becomes `http://localhost:5173/products`
2. Click "About" → URL is `http://localhost:5173/about`
3. Click "Contact" → URL is `http://localhost:5173/contact`
4. Click brand logo (Home) → URL is `http://localhost:5173/`

**Assertions per route**:

- `/products`: Title "Our Products" visible, 8 product cards in grid, category filter tabs present (All, Honey, Beeswax, Gift Sets, Subscriptions)
- `/about`: "Our Story" section visible, 5 process steps listed (The Hive, Foraging, The Nectar, Sealing, Harvest)
- `/contact`: Form with name/email/message fields, email "hello@beeepicapiary.com", phone shown

---

## Test 3: Product Detail Page

1. Navigate to `http://localhost:5173/products`
2. Click "Wildflower Raw Honey" product card

**Assertions**:

- Product name "Wildflower Raw Honey" displayed
- Price "$14.00" displayed
- Description text visible
- "Add to Cart" button present
- Weight "16 oz" shown
- Tags "raw", "unfiltered", "local" visible

---

## Test 4: Category Filtering on Products Page

1. Navigate to `http://localhost:5173/products`
2. Click "Honey" → only 3 honey products shown
3. Click "Beeswax" → only 2 beeswax products shown
4. Click "Gift Sets" → 2 gift products shown
5. Click "Subscriptions" → 1 subscription product shown (Monthly Honey Club)
6. Click "All Products" → all 8 products restored

---

## Test 5: Add to Cart Flow

1. Navigate to `http://localhost:5173/products`
2. Click "Add" on "Wildflower Raw Honey"

**Assertions**:

- Cart badge in navbar shows `1`
- Cart drawer slides in from right
- Drawer shows "Wildflower Raw Honey", quantity 1, price $14.00
- Subtotal shows "$14.00"

---

## Test 6: Cart Operations (Quantity, Remove, Close)

**Precondition**: Cart has 1 item from Test 5, drawer is open.

1. Click quantity increment (+) until quantity is 3 → subtotal is "$42.00"
2. Click quantity decrement (-) until quantity is 1 → subtotal back to "$14.00"
3. Click `X` (close) → cart drawer closes
4. Click cart icon in navbar → drawer reopens
5. Click remove (trash icon) → cart shows "Your cart is empty"

---

## Test 7: Multiple Items in Cart

1. Add "Wildflower Raw Honey" → cart = 1
2. Close cart, navigate to products, add "Clover Blossom Honey" → cart badge = 2

**Assertions**:

- Cart drawer shows 2 line items
- Subtotal = "$26.00" ($14.00 + $12.00)
- Both product names visible

---

## Test 8: Checkout Button — Empty Cart

1. Clear cart: `localStorage.removeItem("goldenHiveCart")`
2. Reload page
3. Open cart drawer

**Assertion**: "Proceed to Checkout" button is disabled.

---

## Test 9: Checkout — Mixed Subscription + Regular (Error Case)

1. Add "Wildflower Raw Honey" (HONEY) to cart
2. Add "Monthly Honey Club" (SUBSCRIPTIONS) to cart
3. Click "Proceed to Checkout"

**Assertion**: Error message "Cannot mix subscription and regular products. Please checkout separately." appears.

---

## Test 10: Checkout — Subscription Only (Redirect)

1. Clear cart
2. Add "Monthly Honey Club" to cart
3. Click "Proceed to Checkout"

**Assertion**: Browser navigates to Stripe Payment Link (`https://buy.stripe.com/test_...`).

---

## Test 11: Checkout — Regular Products (API Call)

1. Clear cart
2. Add "Wildflower Raw Honey" (qty: 1) to cart
3. Click "Proceed to Checkout"

**Assertions**:

- `POST` request made to `http://localhost:8787/checkout`
- Request body has `line_items` array with `price: "price_..."` and `quantity: 1`
- Response contains `url` pointing to `https://checkout.stripe.com/...`
- Browser navigates to Stripe Checkout URL

**Note**: Full Stripe Checkout flow cannot be automated without real card details. Test stops at redirect.

---

## Test 12: Success Page

Navigate to `http://localhost:5173/success?session_id=cs_test_abc123`

**Assertions**:

- Heading "Order Confirmed!" visible
- Cart badge shows 0 (cart cleared)
- Order ID displayed (first 12 chars of session_id)
- "Continue Shopping" and "Back to Home" buttons present
- Email contact shown

---

## Test 13: Cancel Page

Navigate to `http://localhost:5173/cancel?session=cancelled`

**Assertions**:

- Heading "Checkout Cancelled" visible
- "No charges were made. Your items are still in your cart." shown
- "Continue Shopping" and "Contact Support" buttons present

---

## Test 14: Success Modal (from URL query)

Navigate to `http://localhost:5173/?session=success`

**Assertions**:

- Success modal overlay appears with "Order Confirmed!"
- Clicking overlay closes it
- URL cleaned (no `?session=success` remains)

---

## Test 15: Contact Form

Navigate to `http://localhost:5173/contact`

**Assertions**:

- Form fields present: name, email, message
- Note: Contact form submits to `POST /contact` on the services worker. Verify form markup renders correctly.

---

## Test 16: Mobile Responsive

1. Set viewport to 375x812
2. Navigate to `http://localhost:5173`
3. Reload

**Assertions**:

- Hamburger menu button visible
- Desktop nav links hidden
- Click hamburger → mobile menu slides open
- Click a nav link → menu closes, page navigates

---

## Test 17: Cart Persistence (localStorage)

1. Add "Buckwheat Dark Honey" to cart
2. Reload the page

**Assertions**:

- Cart badge shows "1"
- Open cart → "Buckwheat Dark Honey" still present
- `localStorage.getItem("goldenHiveCart")` contains valid JSON

---

## Test 18: Footer Content

Navigate to any page (e.g., `/products`), scroll to footer.

**Assertions**:

- Business name "Bee Epic Apiary" visible
- Email link `hello@beeepicapiary.com`
- Social links: Instagram, Facebook, Etsy
- "Built with ❤️ in California" tagline

---

## Test 19: PWA Install Prompt

1. Navigate to `http://localhost:5173`
2. Trigger `beforeinstallprompt` event (via Playwright)
3. Verify "Install App" button appears bottom-right

---

## Test 20: Unknown Route

Navigate to `http://localhost:5173/nonexistent-page`

**Assertion**: App does not crash — Layout renders with empty main content or graceful fallback.

---

## Key Selectors Reference

| Element                   | Selector Hint                                            |
| ------------------------- | -------------------------------------------------------- |
| Navbar brand              | `a` containing 🐝 or business name                       |
| Nav links (desktop)       | `#nav-links a`                                           |
| Mobile menu button        | `button[aria-label="Open menu"]`                         |
| Cart icon                 | `button[aria-label*="Shopping cart"]`                    |
| Cart badge                | `span` inside cart button with item count                |
| Cart drawer               | `h2` with text "Your Cart" within slide-in panel         |
| Product grid              | Grid containing product cards                            |
| Product card "Add" button | `button` with text "Add" inside a product card           |
| Category filter buttons   | Buttons with category labels (All, Honey, Beeswax, etc.) |
| Footer                    | Footer section at page bottom                            |
