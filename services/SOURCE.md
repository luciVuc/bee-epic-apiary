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
   - [Order](#order)
     - [src/stripe/order/index.ts](#srcstripeorderindexts)
     - [get-orders.ts](#srcstripeorderget-ordersts)
     - [update-order.ts](#srcstripeorderupdate-orderts)
     - [confirm-order.ts](#srcstripeorderconfirm-orderts)
   - [Notifications](#notifications)
     - [src/stripe/notifications/notifications-stream.ts](#srcstripenotificationsnotifications-streamts)
4. [Contact](#contact)
   - [src/contact/contact-handler.ts](#srccontactcontact-handlerts)
5. [Settings](#settings)
   - [src/settings/schemas.ts](#srcsettingsschemasts)
   - [src/settings/settings-handler.ts](#srcsettingssettings-handlerts)
6. [Auth](#auth)
   - [root (cookies.ts, readVerifiedRefreshPayload.ts)](#srcauth-root)
   - [utils/ (parsePath.ts)](#srcauthutils)
   - [crypto/](#srcauthcrypto)
   - [repo/](#srcauthrepo)
   - [policy/](#srcauthpolicy)
   - [emails/](#srcauthemails)
   - [handlers/](#srcauthhandlers)
7. [Utilities](#utilities)
   - [src/utils/index.ts](#srcutilsindexts)
   - [handleCORS.ts](#srcutilshandlecorsts)
   - [isAllowedOrigin.ts](#srcutilsisallowedorigints)
   - [isValidUrl.ts](#srcutilsisvalidurlts)
   - [jsonResponse.ts](#srcutilsjsonresponsets)
   - [rateLimiter.ts](#srcutilsratelimiterts)
   - [withStripeHandler.ts](#srcutilswithstripehandlerts)
8. [Removed / Historical](#removed--historical)

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
- `jsonResponse`, `handleCORS` from `./utils`

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
	fetch: withStripeHandler('POST', handleCreatePrice, { requiredRole: EStaffRole.MANAGER }),
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

### Order

#### src/stripe/order/index.ts

Re-exports all order-related handlers.

**Code**:

```typescript
export * from './get-orders';
export * from './update-order';
export * from './confirm-order';
```

---

#### src/stripe/order/get-orders.ts

Handles `GET /orders` and `GET /orders/:id` to retrieve Stripe Checkout Sessions with search, filter, and pagination.

**Dependencies**:

- `withStripeHandler` from `../../utils`
- `jsonResponse` from `../../utils`

**Internal Functions**:

##### `matchesSearch(session: Stripe.Checkout.Session, search: string): boolean`

Case-insensitive substring match against `customer_details.email`, `customer_email`, `customer_details.name`, and session `id`.

##### `matchesStatus(session: Stripe.Checkout.Session, status: string): boolean`

Checks if the session `status` matches (supports `'ALL'` to skip filtering).

##### `matchesPaymentStatus(session: Stripe.Checkout.Session, paymentStatus: string): boolean`

Checks if the session `payment_status` matches (supports `'ALL'` to skip filtering).

##### `matchesOrderStatus(session: Stripe.Checkout.Session, orderStatus: string): boolean`

Checks if `metadata.order_status` matches the filter (supports `'ALL'` to skip filtering).

##### `fetchCappedSessions(stripe: Stripe, max?: number): Promise<Stripe.Checkout.Session[]>`

Fetches all Stripe Checkout Sessions by paginating through all pages, capped at `max` sessions (default 1000).

##### `paginateArray<T>(items: T[], limit: number, startingAfter?: string): { data: T[], hasMore: boolean, lastId: string | null }`

Client-side pagination of an in-memory array by cursor (item ID).

**Handler Logic**:

1. Extracts order ID from URL if present
2. For `GET /orders/:id` (single order):
   - Retrieves session via `stripe.checkout.sessions.retrieve` with `customer` and `payment_intent` expansion
   - Fetches line items via `stripe.checkout.sessions.listLineItems`
   - Returns combined session + line items response
3. For `GET /orders` (list):
   - Parses `search`, `status`, `payment_status`, `order_status`, `limit`, and `starting_after` query params
   - If any filter is active: fetches all sessions via `fetchCappedSessions`, filters in-memory using match functions, then paginates with `paginateArray`
   - Otherwise: fetches all sessions via `fetchCappedSessions` and paginates
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

#### src/stripe/order/order-template.ts

Shared HTML and plain-text email template for order notifications.

**Exported Interfaces**:

```typescript
export interface IOrderTemplateData {
	sessionId: string;
	customerName: string;
	customerEmail: string;
	amountTotal: string;
	orderLink: string;
	businessName: string;
}
```

**Exported Functions**:

##### `buildOrderNotificationHtml(data: IOrderTemplateData): string`

Returns a full HTML email document with a branded header ("New Order Placed"), order ID (clickable link if `orderLink` is provided), customer info, total, and a "View Order in Admin" CTA button.

##### `buildOrderNotificationText(data: IOrderTemplateData): string`

Returns a plain-text version of the notification suitable for the `text` field of `env.EMAIL.send()`.

##### `buildOrderNotificationMarkdown(data: IOrderTemplateData): string`

Returns a Markdown version of the notification with linked order ID and "View Order in Admin Dashboard" link.

---

#### src/stripe/order/confirm-order.ts

Handles `POST /orders/confirm` to confirm a paid Stripe Checkout Session and trigger notifications.

**Dependencies**:

- `withStripeHandler` from `../../utils`
- `jsonResponse` from `../../utils`
- `buildOrderNotificationHtml`, `buildOrderNotificationText` from `./order-template`

**Internal Functions**:

##### `sendOrderNotificationEmail(sessionId: string, session: Stripe.Checkout.Session, env: Env): Promise<void>`

Sends an email notification to the admin. If `formsparkFormId` is set in the `site` content KV, the notification is POSTed to Formspark with the rendered HTML template as the `html` field. Otherwise, it is sent via the Cloudflare Email Service binding (`env.EMAIL.send()`) using both the HTML and text templates. Errors are logged but do not fail the response.

**Handler Logic**:

1. Validates `sessionId` in request body
2. Retrieves the Stripe Checkout Session and verifies `payment_status === 'paid'`
3. Updates Stripe session metadata with `order_status: 'new'`
4. Calls `NotificationHub.notify({ type: 'new-order', orderId: sessionId })` on the `default` DO instance — the hub persists the event in its SQLite storage and fans it out to every connected admin SSE client (consumed by `notifications-stream.ts`)
5. Sends admin notification email via `sendOrderNotificationEmail` (routes through Formspark if `formsparkFormId` is set in site content, otherwise through Cloudflare Email Service)
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

### Notifications

#### src/notifications/notification-hub.ts

The `NotificationHub` Durable Object — single-tenant, single-instance (name `default`). Persists every broadcast event in its SQLite storage (`new_sqlite_classes: ["NotificationHub"]` migration), supports SSE `Last-Event-ID` replay, and broadcasts to every connected admin SSE client.

**Persistence**:

- Table `notifications(id TEXT PRIMARY KEY, ts INTEGER NOT NULL, type TEXT NOT NULL, payload TEXT NOT NULL)` with index on `ts`
- Each `id` is `${ts}-${counter}` (zero-padded, lexicographically sortable)
- `payload` stores everything except `id`/`ts`/`type` as JSON

**Replay window**: read fresh from `CONTENT_KV.site.notificationReplayHours` on each fetch and each eviction. Clamped to 1–24 hours; defaults to 1 if unset or invalid.

**Eviction** (runs on every `notify`):

- Age: rows older than the configured window are deleted
- Count: at most `MAX_EVENTS = 500` rows are kept; the rest are deleted oldest-first

**Public methods**:

- `notify(input: INotificationEventInput): Promise<void>` — appends an event, evicts, broadcasts to live writers. Caller passes the typed event minus `id`/`ts`; the hub stamps both.
- `fetch(request: Request): Promise<Response>` — opens a new SSE connection. Honors `Last-Event-ID` header (and `?lastEventId=` query parameter as fallback). Replays missed events within the window, then emits `event: connected`, then streams live.
- `alarm(): Promise<void>` — heartbeat every 30s; cleans dead writers.

**Event types** (`src/notifications/types.ts`): `INotificationEvent` discriminated union with `new-order`, `order-status-changed`, `product-updated`, `product-deleted` variants.

#### src/stripe/notifications/notifications-stream.ts

Thin pass-through that delegates to `NotificationHub` and adds CORS + cache headers. Forwards the `Last-Event-ID` header explicitly so the DO can replay missed events on reconnect. Sets `Cache-Control: no-cache, no-store` and `X-Accel-Buffering: no` so intermediaries don't buffer the stream.

**Dependencies**:

- `env.NOTIFICATION_HUB` DO binding
- `env.ALLOWED_ORIGINS`

---

## Contact

### src/contact/contact-handler.ts

Handles `POST /contact` to receive contact form submissions and deliver them as emails. Supports two delivery backends selected by site content configuration.

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
6. Reads site content from `CONTENT_KV` (`site` key)
7. **If `formsparkFormId` is set** (and not `"REPLACE_ME"`): POSTs the form data to `https://submit-form.com/{formId}` with `Accept: application/json` header and `_email.subject` for the email subject, then returns the result
8. **Otherwise** (Cloudflare Email Service path):
   - Reads the admin email from site content
   - Sends an email via `env.EMAIL.send()` with the form data:
     - **To**: Admin email from site settings
     - **From**: `contact@<admin-domain>` with business name
     - **Reply-To**: The submitter's email
     - **Subject**: `Contact Form: <subject>`
     - **Body**: Name, email, subject, and message (HTML + plain text)
9. Returns `{ success: true }` on success, or appropriate error

---

## Settings

### src/settings/schemas.ts

Zod validation schemas for settings data.

**Exported**:

- `categorySchema`: Zod array schema validating `{ id: string, label: string }[]`

### src/settings/settings-handler.ts

Handles `GET` and `PUT` requests for content settings stored in Cloudflare KV (`CONTENT_KV`).

**Supported Types**: `site`, `process`, `testimonials`, `categories`
(Note: `site` content includes contact info fields; contact form and order notification emails are sent via Formspark if `formsparkFormId` is configured, otherwise via Cloudflare Email Service)

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

### src/utils/resolveCaller.ts

Cookie-session caller identity resolution. The canonical entry point for all admin-route auth (Phase 9).

**Exported Types**:

```typescript
export interface ICaller {
	email: string;
	role: EStaffRole; // OWNER | MANAGER | EMPLOYEE | VENDOR (from @bee-epic/shared)
	via: 'cookie' | 'bearer' | 'dev';
}
```

**Exported Functions**:

#### `resolveCaller(request: Request, env: Env): Promise<ICaller | null>`

Resolves the caller identity using a three-path trust chain, evaluated in order (cookie → bearer → dev):

1. **Cookie** — `bea_at` HttpOnly `SameSite=Lax` HS256 JWT signed with `env.JWT_SIGNING_SECRET` (1-hour TTL). On successful verification the subject (caller email) is resolved from user KV.
2. **Bearer** — `Authorization: Bearer <env.API_SECRET_KEY>` returns `{ email: 'ci@service', role: OWNER, via: 'bearer' }`. Intended for CI / scripts.
3. **Dev** — `X-Dev-Email: <email>` header, honored only when `env.ENVIRONMENT === 'development'`. Resolves as OWNER if email is in `OWNER_EMAILS`, otherwise reads the user's role from user KV (must be ACTIVE). Never honored in production.

Returns `null` when none of the paths produce an identity.

#### `roleSatisfies(actual: EStaffRole, required: EStaffRole): boolean`

Returns `true` when `actual` rank ≥ `required` rank. Rank: `OWNER > MANAGER > EMPLOYEE > VENDOR`.

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
type StripeHandler = (stripe: Stripe, request: Request, env: Env, origin: string | null, caller?: ICaller) => Promise<Response>;
```

**Options**:

```typescript
interface IWithStripeHandlerOptions {
	requiredRole?: EStaffRole; // Minimum role required to call this endpoint. Omit for public routes.
}
```

**Middleware Logic**:

1. Handles CORS preflight (OPTIONS requests)
2. Validates request method matches `method`
3. Validates request origin using `isAllowedOrigin`
4. If `requiredRole` is set, calls `resolveCaller(request, env)` and checks `roleSatisfies(caller.role, requiredRole)`. Returns `UNAUTHORIZED` if no caller resolved, `FORBIDDEN.requiredRole` if rank too low.
5. Applies rate limiting (if KV binding is available)
6. Initializes/reuses cached Stripe client (lazy singleton)
7. Calls the provided handler with Stripe client (and the resolved `caller` as the 5th arg)
8. Catches Stripe errors and returns appropriate error responses

---

## Auth

The `services/src/auth/` tree implements the full cookie-session authentication system (Phase 9). It is organized into five subdirectories, plus two root-level modules and a `utils/` subdirectory.

### src/auth/ (root)

Root-level auth modules:

- **`cookies.ts`** — `setCookie(name, value, options)` and `clearCookie(name, options)` helpers that produce `Set-Cookie` header strings for `bea_at` (HttpOnly, `SameSite=Lax`). Encapsulates cookie attribute defaults so callers do not need to repeat them.
- **`readVerifiedRefreshPayload.ts`** — `readVerifiedRefreshPayload(request, env)` verifies the refresh-family cookie, checks the family has not been invalidated in KV, and returns the decoded payload (or throws a typed `REFRESH_FAMILY_INVALIDATED` error).

### src/auth/utils/

Shared utility helpers for the auth subsystem:

- **`parsePath.ts`** — `parsePath(pathname)` splits a URL pathname into its route family and sub-segments; used by the router to extract dynamic path parameters (e.g. email from `/users/{email}`) without a full regex sweep.

### src/auth/crypto/

Cryptographic primitives. Actual files on disk:

- **`jwt.ts`** — `signJwt(payload, secret)` and `verifyJwt(token, secret)` using the Web Crypto API (HS256). No external JWT library.
- **`passwordHash.ts`** — `hashPassword(plain)` (Argon2-style scrypt via Web Crypto) and `verifyPassword(plain, hash)` constant-time comparison.
- **`tokens.ts`** — `generateUrlSafeToken(byteLength?)` produces a cryptographically random base64url token suitable for invite and reset links.

### src/auth/repo/

KV-backed data access for auth entities. Actual files on disk:

- **`userRepo.ts`** — CRUD for user records stored in `CONTENT_KV`. Fields: `email`, `role`, `status`, `passwordHash`, `displayName`, `lastSeenAt`.
- **`inviteRepo.ts`** — stores and retrieves invite tokens (KV key `invite:<token>`), enforces expiry.
- **`resetRepo.ts`** — stores and retrieves password-reset tokens (KV key `reset:<token>`), enforces expiry.
- **`refreshFamilyRepo.ts`** — tracks refresh-family identifiers in KV; `invalidateFamily(familyId)` revokes all tokens in a family (used by `changePassword` and `logout`).
- **`policyRepo.ts`** — reads and writes the auth policy object from `CONTENT_KV` (key `auth-policy`). Merges partials onto defaults.

### src/auth/policy/

Password and request policy. Actual files on disk:

- **`validatePassword.ts`** — `validatePassword(plain, policy)` returns `{ ok: boolean, reasons: string[] }`. Checks minimum length, uppercase, number, special-character requirements from the stored policy, and optionally checks the Have I Been Pwned (HIBP) k-anonymity API.
- **`truncateIp.ts`** — `truncateIp(ip)` masks the last octet of IPv4 (or last 64 bits of IPv6) for privacy-safe rate-limit keys.

### src/auth/emails/

Transactional email builders. Actual files on disk:

- **`from.ts`** — `buildFromAddress(env)` constructs the `From` header address from site content KV.
- **`greeting.ts`** — `buildGreeting(displayName?)` returns a personalized greeting line.
- **`sendInvite.ts`** — `sendInvite(email, token, env)` sends the invite email containing the accept-invite link.
- **`sendReset.ts`** — `sendReset(email, token, env)` sends the password-reset email containing the complete-reset link.
- **`sendPasswordChanged.ts`** — `sendPasswordChanged(email, env)` sends a confirmation that the password was changed; includes a link to request a reset if the change was unauthorized.

### src/auth/handlers/

Route handlers wired to `/auth/*` and `/users/*`. One file per logical endpoint. Actual files on disk:

- **`login.ts`** — `POST /auth/login`. Verifies credentials, signs `bea_at` cookie, returns caller.
- **`logout.ts`** — `POST /auth/logout`. Clears `bea_at` cookie, invalidates refresh family.
- **`refresh.ts`** — `POST /auth/refresh`. Verifies refresh-family cookie, reissues `bea_at`.
- **`acceptInvite.ts`** — `POST /auth/accept-invite`. Validates invite token, sets password, activates user, signs cookie.
- **`requestReset.ts`** — `POST /auth/request-reset`. Always-200; sends reset email if address is known.
- **`completeReset.ts`** — `POST /auth/complete-reset`. Validates reset token, updates password hash.
- **`changePassword.ts`** — `POST /auth/change-password`. Validates current password, updates hash, invalidates refresh families, sends confirmation email.
- **`bootstrapOwner.ts`** — `POST /auth/bootstrap-owner`. Gated by `bootstrapAvailable`; creates the first OWNER user.
- **`listUsers.ts`** — `GET /users`. Returns all users (OWNER only).
- **`inviteUser.ts`** — `POST /users/invite`. Creates INVITED user, sends invite email (OWNER only).
- **`updateUser.ts`** — `PUT /users/{email}`. Partial update of role/status; guards against demoting the last OWNER (OWNER only).
- **`deleteUser.ts`** — `DELETE /users/{email}`. Hard-deletes user record; guards against deleting the last OWNER (OWNER only).
- **`reinviteUser.ts`** — `POST /users/{email}/reinvite`. Re-sends invite email with a fresh token (OWNER only).
- **`updateMe.ts`** — `PUT /users/me`. Allows any authenticated user to update self-editable fields (e.g. `displayName`).
- **`policyHandlers.ts`** — `GET /settings/auth-policy` (any authenticated) and `PUT /settings/auth-policy` (OWNER). Reads and writes the auth policy via `policyRepo`.

---

## Removed / Historical

The following modules were present in earlier phases of this codebase and have since been deleted or rewritten:

- **`services/src/utils/resolveCaller.ts` (pre-Phase 9)** — Previously implemented a three-path chain of Dev → Cloudflare edge JWT (verified with an external npm JWT library against the team JWKS endpoint) → Bearer. Rewritten in Phase 9 to Cookie → Bearer → Dev using HS256 Web Crypto — no external JWT library, no JWKS, and the legacy `*_TEAM_DOMAIN` / `*_AUD` env vars are no longer used.
- **`src/settings/` — staff module** (deleted) — The `staff.ts` module within the settings package handled the staff-list content GET and PUT routes. Deleted in Phase 3–9 as part of the migration from a flat staff-list KV model to the per-user KV model in `src/auth/repo/userRepo.ts`.
