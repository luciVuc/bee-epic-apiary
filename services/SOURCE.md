# Bee Epic Apiary - Services Source Code Documentation

This document provides comprehensive documentation for all source code in the `./services/src/` directory, including functions, classes, methods, parameters, return values, and usage examples.

## Table of Contents

1. [Entry Point](#entry-point)
   - [src/index.ts](#srcindexts)
2. [Router](#router)
   - [src/router.ts](#srcrouterts)
3. [Stripe Integration](#stripe-integration)
   - [src/stripe/index.ts](#srcstripeindexts)
   - [Checkout](#checkout)
     - [src/stripe/checkout/index.ts](#srcstripecheckoutindexts)
     - [src/stripe/checkout/stripe-checkout.ts](#srcstripecheckoutstripe-checkoutts)
   - [Product](#product)
     - [src/stripe/product/index.ts](#srcstripeproductindexts)
     - [create-product.ts](#srcstripeproductcreate-productts)
     - [get-products.ts](#srcstripeproductget-productsts)
     - [update-product.ts](#srcstripeproductupdate-productts)
     - [delete-product.ts](#srcstripeproductdelete-productts)
4. [Utilities](#utilities)
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
```

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
```

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

Handles `GET /products` and `GET /products/:id` to retrieve products.

**Dependencies**:

- `withStripeHandler` from `../../utils`
- `jsonResponse` from `../../utils`

**Handler Logic**:

1. Extracts product ID from URL if present
2. For `GET /products` (no ID):
   - Checks Cloudflare cache first (5 minute TTL)
   - Lists all products via Stripe API
   - Caches response with `Cache-Control: public, max-age=300`
3. For `GET /products/:id`:
   - Retrieves single product via Stripe API
4. Returns product(s) as response

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

#### src/stripe/product/delete-product.ts

Handles `DELETE /products/:id` to delete a product.

**Dependencies**:

- `withStripeHandler` from `../../utils`
- `jsonResponse` from `../../utils`

**Handler Logic**:

1. Extracts product ID from URL
2. Deletes product via Stripe API
3. Returns delete confirmation

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

#### `withStripeHandler(method: HttpMethod, handler: StripeHandler): (request: Request, env: Env) => Promise<Response>`

Wraps a Stripe handler function with common middleware.

**StripeHandler Type**:

```typescript
type StripeHandler = (stripe: Stripe, request: Request, env: Env, origin: string | null) => Promise<Response>;
```

**Middleware Logic**:

1. Handles CORS preflight (OPTIONS requests)
2. Validates request method matches `method`
3. Validates request origin using `isAllowedOrigin`
4. Applies rate limiting (if KV binding is available)
5. Initializes/reuses cached Stripe client
6. Calls the provided handler with Stripe client
7. Catches Stripe errors and returns appropriate error responses
