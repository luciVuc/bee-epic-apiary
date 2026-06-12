# Bee Epic Apiary - Services Source Code Documentation

This document provides comprehensive documentation for all source code in the `./services/src/` directory, including functions, classes, methods, parameters, return values, and usage examples.

## Table of Contents

1. [Entry Point](#entry-point)
   - [src/index.ts](#srcindexts)
2. [Router](#router)
   - [src/router.ts](#srcrouterts)
3. [Stripe Integration](#stripe-integration)
   - [src/stripe/index.ts](#srcstripeindexts)
   - [Price](#price)
     - [src/stripe/price/index.ts](#srcstripepriceindexts)
     - [create-price.ts](#srcstripepricecreate-pricets)
   - [Checkout](#checkout)
     - [src/stripe/checkout/index.ts](#srcstripecheckoutindexts)
     - [src/stripe/checkout/stripe-checkout.ts](#srcstripecheckoutstripe-checkoutts)
   - [Product](#product)
     - [src/stripe/product/index.ts](#srcstripeproductindexts)
     - [shared.ts](#srcstripeproductsharedts)
     - [create-product.ts](#srcstripeproductcreate-productts)
     - [get-products.ts](#srcstripeproductget-productsts)
     - [get-products-count.ts](#srcstripeproductget-products-countts)
     - [update-product.ts](#srcstripeproductupdate-productts)
     - [delete-product.ts](#srcstripeproductdelete-productts)
4. [Contact](#contact)
   - [src/contact/contact-handler.ts](#srccontactcontact-handlerts)
5. [Settings](#settings)
   - [src/settings/schemas.ts](#srcsettingsschemasts)
   - [src/settings/settings-handler.ts](#srcsettingssettings-handlerts)
6. [Utilities](#utilities)
   - [src/utils/index.ts](#srcutilsindexts)
   - [auth.ts](#srcutilsauthts)
   - [handleCORS.ts](#srcutilshandlecorsts)
   - [isAllowedOrigin.ts](#srcutilsisallowedorigints)
   - [isValidUrl.ts](#srcutilsisvalidurlts)
   - [jsonResponse.ts](#srcutilsjsonresponsets)
   - [rateLimiter.ts](#srcutilsratelimiterts)
   - [withStripeHandler.ts](#srcutilswithstripehandlerts)

---

## Entry Point

### src/index.ts

Exports the Cloudflare Worker's `fetch` handler, which routes all incoming requests to the router.

**Code**:

```typescript
import router from './router';

export default {
	fetch: router,
} satisfies ExportedHandler<Env>;
```

**Details**:

- Imports the `router` function from `./router.ts`
- Exports a default object with a `fetch` method, which satisfies the `ExportedHandler<Env>` interface for Cloudflare Workers
- All incoming requests are passed to the `router` function

---

## Router

### src/router.ts

Handles all incoming request routing, method validation, CORS preflight, and authentication for protected routes.

**Dependencies**:

- `checkoutHandler` from `./stripe/checkout/stripe-checkout`
- `createProductHandler`, `getProductsHandler`, `updateProductHandler`, `deleteProductHandler` from `./stripe/product`
- `jsonResponse`, `handleCORS`, `checkAuth` from `./utils`

**Exported Function**:

#### `router(request: Request, env: Env): Promise<Response>`

Routes incoming requests to the appropriate handler based on pathname and HTTP method.

**Parameters**:

- `request`: Incoming HTTP request
- `env`: Cloudflare Worker environment variables and bindings

**Returns**: Promise resolving to an HTTP response

**Routing Logic**:

1. **`/checkout` (POST)**: Routes to `checkoutHandler`
2. **`/products` (POST, GET, OPTIONS)**:
   - `POST`: Requires authentication, routes to `createProductHandler`
   - `GET`: Routes to `getProductsHandler`
   - `OPTIONS`: Routes to `createProductHandler` for CORS preflight
3. **`/products/:id` (PUT, DELETE, GET, OPTIONS)**:
   - `PUT`, `DELETE`: Require authentication, route to respective handlers
   - `GET`: Routes to `getProductsHandler`
   - `OPTIONS`: Handles CORS preflight with allowed methods `PUT, DELETE, GET, OPTIONS`
4. **Unknown routes**: Return 404 Not Found

---

## Stripe Integration

### src/stripe/index.ts

Re-exports all Stripe-related modules for easy importing.

**Code**:

```typescript
export * from './checkout';
export * from './product';
export * from './price';
```

---

### Price

#### src/stripe/price/index.ts

Re-exports the price handler.

**Code**:

```typescript
export * from './create-price';
```

#### src/stripe/price/create-price.ts

Handles `POST /prices` to create a new Stripe Price for a product.

**Dependencies**:

- `withStripeHandler`, `jsonResponse` from `../../utils`

**Exported Object**:

```typescript
export default {
	fetch: withStripeHandler('POST', handleCreatePrice, { requireAuth: true }),
} satisfies ExportedHandler<Env>;
```

**Handler Logic**:

1. Parses request body as `Stripe.PriceCreateParams`
2. Validates `product` (required string), `unit_amount` (required, > 0), `currency` (required), `lookup_key` (optional string)
3. Creates price via Stripe API
4. Returns created price object with 201 status

---

### Checkout

#### src/stripe/checkout/index.ts

Re-exports the checkout handler.

**Code**:

```typescript
export * from './stripe-checkout';
```

#### src/stripe/checkout/stripe-checkout.ts

Handles `POST /checkout` requests to create Stripe Checkout sessions.

**Dependencies**:

- `withStripeHandler` from `../../utils`
- `isValidUrl`, `jsonResponse` from `../../utils`

**Exported Object**:

```typescript
export default {
	fetch: withStripeHandler('POST', async (stripe, request, env, origin) => {
		// ... handler logic
	}),
} satisfies ExportedHandler<Env>;
```

**Handler Logic**:

1. Parses request body as `Stripe.Checkout.SessionCreateParams`
2. Validates required fields (`line_items`, `success_url`, `cancel_url`)
3. Validates URLs in `success_url` and `cancel_url`
4. Validates each line item (has `price`/`price_data`, `quantity >= 1`)
5. Fetches price details to separate recurring and one-time items
6. Creates separate Stripe Checkout sessions for recurring (subscription mode) and one-time (payment mode) items
7. Returns array of session URLs

---

### Product

#### src/stripe/product/index.ts

Re-exports all product-related handlers.

**Code**:

```typescript
export * from './create-product';
export * from './update-product';
export * from './delete-product';
export * from './get-products';
export * from './get-products-count';
```

#### src/stripe/product/shared.ts

Shared helper functions used across multiple product handlers.

**Exported Functions**:

##### `fetchAllActiveProducts(stripe: Stripe, expand?: string[]): Promise<Stripe.Product[]>`

Fetches ALL active products from Stripe by paginating through all pages (100 items per page).

**Parameters**:

- `stripe`: Stripe client instance
- `expand`: Optional array of fields to expand

**Returns**: Complete array of all active Stripe products

##### `matchesSearch(product: Stripe.Product, search: string): boolean`

Checks if a product matches a search query (case-insensitive). Searches name, description, longDescription metadata, and tags metadata.

**Parameters**:

- `product`: Stripe product object
- `search`: Search string

**Returns**: `true` if product matches the search query

##### `matchesCategory(product: Stripe.Product, category: string): boolean`

Checks if a product belongs to a given category (read from metadata.category).

**Parameters**:

- `product`: Stripe product object
- `category`: Category string (or "ALL" to match everything)

**Returns**: `true` if product matches the category

##### `matchesTag(product: Stripe.Product, tag: string): boolean`

Checks if a product has a given tag in its comma-separated tags metadata (case-sensitive, trims whitespace).

**Parameters**:

- `product`: Stripe product object
- `tag`: Tag string to match

**Returns**: `true` if product has the tag

##### `paginateArray<T>(items: T[], limit: number, startingAfter?: string): { data: T[], hasMore: boolean, lastId: string | null }`

Paginates an already-filtered array in-memory (used after search/filter operations).

**Parameters**:

- `items`: Full array of items
- `limit`: Number of items per page
- `startingAfter`: Cursor ID for pagination

**Returns**: Paginated slice with hasMore flag and lastId cursor

#### src/stripe/product/create-product.ts

Handles `POST /products` to create a new Stripe product.

**Dependencies**:

- `withStripeHandler` from `../../utils`
- `jsonResponse`, `isValidUrl` from `../../utils`

**Handler Logic**:

1. Parses request body as `Stripe.ProductCreateParams`
2. Validates `name` is present, non-empty string
3. Validates URLs in `url` and `images` fields using `isValidUrl`
4. Creates product via Stripe API
5. Returns created product

#### src/stripe/product/get-products.ts

Handles `GET /products` and `GET /products/:id` to retrieve products with search, filter, and pagination.

**Dependencies**:

- `withStripeHandler` from `../../utils`
- `jsonResponse` from `../../utils`
- `fetchAllActiveProducts`, `matchesSearch`, `matchesCategory`, `matchesTag`, `paginateArray` from `./shared`

**Handler Logic**:

1. Extracts product ID from URL if present
2. For `GET /products/:id` (single product):
   - Retrieves product via Stripe API with optional expand params
   - Returns 404 if product is not active
3. For `GET /products` (list):
   - Parses `search`, `category`, `tag`, `limit`, and `starting_after` query params
   - If search, category, or tag filter is active: fetches all active products, filters in-memory using `matchesSearch`, `matchesCategory`, and `matchesTag`, then paginates
   - Otherwise: fetches from Stripe with cursor-based pagination, computes total_count by fetching full list
4. Returns products list with `has_more`, `total_count`, and `lastId`

#### src/stripe/product/update-product.ts

Handles `PUT /products/:id` to update an existing product.

**Dependencies**:

- `withStripeHandler` from `../../utils`
- `jsonResponse`, `isValidUrl` from `../../utils`

**Handler Logic**:

1. Extracts product ID from URL
2. Parses request body as `Stripe.ProductUpdateParams`
3. Validates update data is not empty
4. Validates URLs in `url` and `images` fields using `isValidUrl`
5. Updates product via Stripe API
6. Returns updated product

---

#### src/stripe/order/get-orders.ts

Handles `GET /orders` and `GET /orders/:id` to retrieve Stripe Checkout Sessions with search, filter, and pagination.

**Dependencies**:

- `withStripeHandler` from `../../utils`
- `jsonResponse` from `../../utils`

**Internal Functions**:

##### `matchesSearch(session: Stripe.Checkout.Session, search: string): boolean`

Case-insensitive substring match against `customer_details.email`, `customer_email`, `customer_details.name`, and session `id`.

##### `buildSearchQuery(search: string, status: string, paymentStatus: string): string`

Constructs a Stripe Search API query string from the given filter parameters. Escapes single quotes in search terms to prevent query injection.

##### `searchAllMatchingSessions(stripe: Stripe, query: string, max?: number): Promise<Stripe.Checkout.Session[]>`

Fetches sessions matching the Search API query, paginating automatically up to `max` sessions (default 1000). Uses `stripe.checkout.sessions.search()` with `page` tokens for cursor-based pagination.

##### `paginateArray<T>(items: T[], limit: number, startingAfter?: string): { data: T[], hasMore: boolean, lastId: string | null }`

Client-side pagination of an in-memory array by cursor (item ID). Used to slice Search API results into requested page sizes.

**Handler Logic**:

1. Extracts order ID from URL if present
2. For `GET /orders/:id` (single order):
   - Retrieves session via `stripe.checkout.sessions.retrieve` with `customer` and `payment_intent` expansion
   - Fetches line items via `stripe.checkout.sessions.listLineItems`
   - Returns combined session + line items response
3. For `GET /orders` (list):
   - Parses `search`, `status`, `payment_status`, `limit`, and `starting_after` query params
   - If any filter is active: builds Search API query, fetches matching sessions server-side, applies client-side name/ID fallback filter, then paginates
   - Otherwise: fetches from Stripe with cursor-based pagination via `list()`
4. Returns orders list with `data`, `has_more`, and `total_count`

#### src/stripe/order/update-order.ts

Handles `PUT /orders/:id` to update a Stripe Checkout Session's metadata and collected information.

**Dependencies**:

- `withStripeHandler` from `../../utils`
- `jsonResponse` from `../../utils`

**Handler Logic**:

1. Extracts order ID from URL
2. Parses request body for `metadata` and `collected_information` fields
3. Updates session via `stripe.checkout.sessions.update()`
4. For 4xx Stripe errors, passes through the Stripe error message; for 5xx returns generic message
5. Returns updated session object

---

#### src/stripe/order/confirm-order.ts

Handles `POST /orders/confirm` to confirm a paid Stripe Checkout Session and trigger notifications.

**Dependencies**:

- `withStripeHandler` from `../../utils`
- `jsonResponse` from `../../utils`

**Internal Functions**:

##### `sendOrderNotificationEmail(sessionId: string, session: Stripe.Checkout.Session, env: Env): Promise<void>`

Sends an email notification to the admin (from `site` content KV) via the Cloudflare Email Service binding (`env.EMAIL.send()`). Includes session ID, customer details, total amount, and a link to the admin dashboard (if `ADMIN_BASE_URL` is configured). Errors are logged but do not fail the response.

**Handler Logic**:

1. Validates `sessionId` in request body
2. Retrieves the Stripe Checkout Session and verifies `payment_status === 'paid'`
3. Updates Stripe session metadata with `order_status: 'new'`
4. Writes a notification to `CONTENT_KV` under `notifications:{sessionId}` with 24h TTL (consumed by `notifications-stream.ts` SSE endpoint)
5. Sends admin notification email via `sendOrderNotificationEmail`
6. Returns `{ success: true }`

---

#### src/stripe/product/get-products-count.ts

Handles `GET /products/count` to retrieve the total product count with optional search/filter.

**Dependencies**:

- `withStripeHandler` from `../../utils`
- `jsonResponse` from `../../utils`
- `fetchAllActiveProducts`, `matchesSearch`, `matchesCategory`, `matchesTag` from `./shared`

**Handler Logic**:

1. Parses `search`, `category`, and `tag` query params
2. Fetches all active products via `fetchAllActiveProducts`
3. Filters in-memory by search, category, and/or tag if applicable
4. Returns `{ total: number }`

---

#### src/stripe/product/delete-product.ts

Handles `DELETE /products/:id` to archive a product (Stripe does not support hard deletion).

**Dependencies**:

- `withStripeHandler` from `../../utils`
- `jsonResponse` from `../../utils`

**Handler Logic**:

1. Extracts product ID from URL
2. Verifies the product exists (returns 404 if resource_missing)
3. If already archived, returns early with a message
4. Clears `default_price` to avoid price archiving conflicts
5. Deactivates all active prices for the product
6. Sets `active: false` on the product (archives it)
7. Returns archived product with list of archived price IDs

---

---

#### src/stripe/notifications/notifications-stream.ts

Handles `GET /notifications/stream` to provide a Server-Sent Events (SSE) stream for real-time order notifications to the admin UI.

**Dependencies**:

- `withStripeHandler` from `../../utils`

**Handler Logic**:

1. Sets up an SSE `ReadableStream` with CORS headers
2. Sends an initial `event: connected` message
3. Polls `CONTENT_KV` every 5 seconds for keys with prefix `notifications:`
4. Emits `event: new-order` for notifications newer than `lastCheck`
5. Sends `event: heartbeat` every 30 seconds to keep the connection alive
6. Cleans up when the client disconnects

---

## Contact

### src/contact/contact-handler.ts

Handles `POST /contact` to receive contact form submissions and send them as emails via Cloudflare Email Service.

**Dependencies**:

- `handleCORS` from `../utils`
- `jsonResponse` from `../utils`
- `RateLimiter` from `../utils`

**Handler Logic**:

1. Handles CORS preflight (`OPTIONS`) and validates method (`POST` only)
2. Applies KV-based rate limiting to prevent spam
3. Parses JSON body with fields: `name`, `email`, `subject`, `message`, `_gotcha`
4. Checks the `_gotcha` honeypot — silently succeeds if filled (bot detected)
5. Validates all required fields are present
6. Reads the admin email from `CONTENT_KV` (`site` key)
7. Sends an email via `env.EMAIL.send()` with the form data:
   - **To**: Admin email from site settings
   - **From**: `contact@<admin-domain>` with business name
   - **Reply-To**: The submitter's email
   - **Subject**: `Contact Form: <subject>`
   - **Body**: Name, email, subject, and message (HTML + plain text)
8. Returns `{ success: true }` on success, or appropriate error

---

## Settings

### src/settings/schemas.ts

Zod validation schemas for settings data.

**Exported**:

- `categorySchema`: Zod array schema validating `{ id: string, label: string }[]`

### src/settings/settings-handler.ts

Handles `GET` and `PUT` requests for content settings stored in Cloudflare KV (`CONTENT_KV`).

**Supported Types**: `site`, `process`, `testimonials`, `categories`
(Note: `site` content includes contact info fields; contact form emails are sent via Cloudflare Email Service)

**Handler Logic**:

1. Parses the settings type from the URL path (`/settings/:type`)
2. **GET**: Reads value from `CONTENT_KV`, parses JSON, and returns it
3. **PUT**: Validates origin and auth, validates body (Zod for `categories` type), stores JSON in `CONTENT_KV`
4. Returns appropriate error responses for missing content, invalid JSON, or validation failures

---

## Utilities

### src/utils/index.ts

Re-exports all utility modules for easy importing.

**Code**:

```typescript
export * from './isValidUrl';
export * from './isAllowedOrigin';
export * from './handleCORS';
export * from './jsonResponse';
export * from './withStripeHandler';
export * from './rateLimiter';
export * from './auth';
```

---

### src/utils/auth.ts

Optional API key authentication middleware for protecting endpoints.

**Exported Function**:

#### `checkAuth(request: Request, env: Env): AuthResult`

Validates the `Authorization` header against `API_SECRET_KEY` env var.

**Parameters**:

- `request`: Incoming HTTP request
- `env`: Cloudflare Worker environment variables

**Returns**: `AuthResult` object with:

- `authenticated`: Boolean indicating if request is authenticated
- `error`: Optional `Response` object if authentication fails

**Types**:

```typescript
export interface AuthResult {
	authenticated: boolean;
	error?: Response;
}
```

---

### src/utils/handleCORS.ts

Handles CORS preflight requests and generates CORS headers.

**Exported Types**:

```typescript
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'OPTIONS';
```

**Exported Function**:

#### `handleCORS(request: Request, env: Env, allowedMethod: HttpMethod): Response`

Generates a CORS preflight response for the given request.

**Parameters**:

- `request`: Incoming HTTP request (expects `Origin` header)
- `env`: Cloudflare Worker environment variables
- `allowedMethod`: HTTP method allowed for the route

**Returns**: 204 No Content response with CORS headers

---

### src/utils/isAllowedOrigin.ts

Validates if a request origin is allowed based on `ALLOWED_ORIGINS` env var.

**Exported Function**:

#### `isAllowedOrigin(origin: string | null, env: Env): boolean`

Checks if the given origin is in the allowed list.

**Parameters**:

- `origin`: Request origin header value (may be null)
- `env`: Cloudflare Worker environment variables

**Returns**: `true` if origin is allowed, `false` otherwise

---

### src/utils/isValidUrl.ts

Validates if a string is a valid HTTP/HTTPS URL.

**Exported Function**:

#### `isValidUrl(url: string): boolean`

Checks if the given string is a valid URL with `http:` or `https:` protocol.

**Parameters**:

- `url`: String to validate

**Returns**: `true` if valid, `false` otherwise

---

### src/utils/jsonResponse.ts

Creates standardized JSON HTTP responses with optional CORS headers.

**Exported Function**:

#### `jsonResponse(data: object, status: number, origin?: string | null, env?: Env): Response`

Creates a JSON response with appropriate headers.

**Parameters**:

- `data`: Object to serialize as JSON
- `status`: HTTP status code
- `origin`: Optional request origin (for CORS headers)
- `env`: Optional Cloudflare Worker environment variables (for CORS)

**Returns**: `Response` object

---

### src/utils/rateLimiter.ts

KV-based rate limiter for Cloudflare Workers.

**Exported Types**:

```typescript
export interface RateLimiterOptions {
	maxRequests: number;
	windowSeconds: number;
}

export interface RateLimiterResult {
	allowed: boolean;
	remaining: number;
	resetTime: number;
}
```

**Exported Class**:

#### `RateLimiter`

Rate limiter using Cloudflare KV to track request counts.

**Constructor**:

```typescript
constructor(kv: KVNamespace, options: RateLimiterOptions)
```

**Methods**:

##### `check(key: string): Promise<RateLimiterResult>`

Checks if a request with the given key is allowed.

---

### src/utils/withStripeHandler.ts

Wrapper function for Stripe handlers that centralizes CORS, rate limiting, origin validation, and Stripe initialization.

**Dependencies**:

- `handleCORS`, `isAllowedOrigin`, `jsonResponse`, `RateLimiter` from `.`

**Constants**:

- `RATE_LIMIT_MAX`: 100 (max requests per minute)
- `RATE_LIMIT_WINDOW`: 60 (window size in seconds)

**Exported Function**:

#### `withStripeHandler(method: HttpMethod, handler: StripeHandler, options?: IWithStripeHandlerOptions): (request: Request, env: Env) => Promise<Response>`

Wraps a Stripe handler function with common middleware.

**StripeHandler Type**:

```typescript
type StripeHandler = (stripe: Stripe, request: Request, env: Env, origin: string | null) => Promise<Response>;
```

**Options**:

```typescript
interface IWithStripeHandlerOptions {
	requireAuth?: boolean; // If true, API key authentication is required
}
```

**Middleware Logic**:

1. Handles CORS preflight (OPTIONS requests)
2. Validates request method matches `method`
3. Validates request origin using `isAllowedOrigin`
4. Applies optional authentication via `checkAuth` (if `requireAuth: true`)
5. Applies rate limiting (if KV binding is available)
6. Initializes/reuses cached Stripe client (lazy singleton)
7. Calls the provided handler with Stripe client
8. Catches Stripe errors and returns appropriate error responses
