# Bee Epic Apiary - Services API Documentation

Cloudflare Worker providing Stripe checkout and product management APIs.

## Base URL

```text
https://your-worker.your-subdomain.workers.dev   (production)
http://localhost:8787                             (local dev)
```

## Authentication & Authorization (Phase 9)

All mutating admin endpoints require a caller resolved through the `bea_at` cookie session trust chain — see `services/src/utils/resolveCaller.ts`:

1. **Cookie** — `bea_at` HttpOnly `SameSite=Lax` HS256 JWT signed with `JWT_SIGNING_SECRET` (1-hour TTL). On successful verification the subject (caller email) is resolved from user KV.
2. **Bearer** — `Authorization: Bearer <API_SECRET_KEY>` (CI / scripts). Maps to OWNER role as `ci@service`.
3. **Dev** — `X-Dev-Email: <email>` header, honored only when `ENVIRONMENT=development`. Resolves as OWNER if email is in `OWNER_EMAILS`, otherwise reads the user's role from user KV (must be ACTIVE).

### Roles

Rank: `OWNER > MANAGER > EMPLOYEE > VENDOR`. Higher rank satisfies lower.

| Endpoint                                                      | Minimum role      |
| ------------------------------------------------------------- | ----------------- |
| `POST /products`, `PUT /products/:id`, `DELETE /products/:id` | `MANAGER`         |
| `POST /prices`                                                | `MANAGER`         |
| `GET /orders`, `GET /orders/:id`, `PUT /orders/:id`           | `EMPLOYEE`        |
| `PUT /settings/{site,process,testimonials,categories}`        | `MANAGER`         |
| `GET /users`, `POST /users/invite`                            | `OWNER`           |
| `PUT /users/{email}`, `DELETE /users/{email}`                 | `OWNER`           |
| `POST /users/{email}/reinvite`                                | `OWNER`           |
| `PUT /settings/auth-policy`                                   | `OWNER`           |
| `GET /settings/auth-policy`, `PUT /users/me`                  | any authenticated |

All other endpoints (`GET /products`, `GET /products/count`, `POST /checkout`, `POST /contact`, `GET /notifications/stream`, `GET /whoami`, `GET /settings/*`, all `/auth/*` public routes) are public or have their own auth model described per-route below.

### Error envelopes

All errors follow `IApiResponse<T>` shape: `{ ok: false, error: IApiError }`. Auth-related codes:

| Code                 | HTTP | Meaning                                                                                              |
| -------------------- | ---- | ---------------------------------------------------------------------------------------------------- |
| `UNAUTHORIZED`       | 401  | No caller could be resolved (or origin not in `ALLOWED_ORIGINS` for writes — returned as 403 there). |
| `FORBIDDEN`          | 403  | Caller resolved but `caller.role` does not satisfy `requiredRole`. Body carries `{ requiredRole }`.  |
| `METHOD_NOT_ALLOWED` | 405  | HTTP method not allowed for this route. Body carries `{ allowed: [...] }`.                           |
| `RATE_LIMITED`       | 429  | Too many requests. Body carries `{ retryAfter }`.                                                    |

### `GET /whoami`

Returns the resolved caller (or `null` if unauthenticated). Used by the admin panel to bootstrap UI state and to gate the Staff settings tab.

**Authentication**: Not required (always public).

**Response (200)**:

```json
{
	"ok": true,
	"data": {
		"caller": {
			"email": "owner@example.com",
			"role": "OWNER",
			"via": "jwt"
		}
	}
}
```

`via` is one of `"cookie" | "bearer" | "dev"`. `caller` is `null` when no path produced an identity.

## Endpoints

### Checkout

#### Create Checkout Session(s)

`POST /checkout`

Creates Stripe checkout sessions for one-time payments and/or subscriptions. Recurring and one-time items are automatically separated into separate sessions.

**Authentication**: Not required (public endpoint).

**Request Body**:

```json
{
	"line_items": [
		{
			"price": "price_1234567890",
			"quantity": 1
		}
	],
	"success_url": "https://example.com/success",
	"cancel_url": "https://example.com/cancel",
	"customer_email": "customer@example.com", // Optional
	"metadata": {}, // Optional
	"automatic_tax": { "enabled": false } // Optional
}
```

**Validation Rules**:

- `line_items` is required and must be a non-empty array
- Each item must have either `price` or `price_data`
- Each item must have `quantity >= 1`
- `success_url` and `cancel_url` are required and must be valid HTTP/HTTPS URLs

**Response**:

```json
{
  "sessions": ["https://checkout.stripe.com/pay/cs_..."],
  "message": "Single checkout session created" | "Multiple checkout sessions created"
}
```

---

### Products

#### List All Products

`GET /products`

Returns a list of all Stripe products. Response is cached for 5 minutes.

**Authentication**: Not required.

**Query Parameters**:

| Parameter        | Type   | Description                                                                   |
| ---------------- | ------ | ----------------------------------------------------------------------------- |
| `search`         | string | Filter products whose name, description, or metadata match (case-insensitive) |
| `category`       | string | Filter products by metadata.category (use `ALL` to show all)                  |
| `tag`            | string | Filter products by metadata.tags (comma-separated, case-sensitive)            |
| `limit`          | number | Number of products per page (default: 10)                                     |
| `starting_after` | string | Cursor for pagination — product ID to start after                             |
| `expand[]`       | string | Fields to expand (e.g., `expand[]=data.default_price`)                        |

**Response**: Stripe API response with added `total_count` field (see [Stripe Products List](https://stripe.com/docs/api/products/list))

---

#### Get Single Product

`GET /products/:id`

Returns a single product by ID.

**Authentication**: Not required.

**Response**: Stripe Product object (see [Stripe Product Retrieve](https://stripe.com/docs/api/products/retrieve))

---

#### Create Product

`POST /products`

**Authentication**: Required — minimum role `MANAGER`.

Creates a new Stripe product.

**Request Body**: Stripe ProductCreateParams (see [Stripe Product Create](https://stripe.com/docs/api/products/create))

```json
{
	"name": "My Product",
	"description": "Product description",
	"images": ["https://example.com/image.png"], // URLs validated
	"url": "https://example.com/product" // URL validated
}
```

**Validation Rules**:

- `name` is required and must be a non-empty string
- URLs in `images` and `url` are validated

**Response**: Stripe Product object

---

#### Update Product

`PUT /products/:id`

**Authentication**: Required — minimum role `MANAGER`.

Updates an existing product.

**Request Body**: Stripe ProductUpdateParams (see [Stripe Product Update](https://stripe.com/docs/api/products/update))

**Validation Rules**:

- URLs in `images` and `url` are validated

**Response**: Stripe Product object

---

#### Get Product Count

`GET /products/count`

Returns the total count of active products, optionally filtered by search, category, or tag.

**Authentication**: Not required.

**Query Parameters**:

| Parameter  | Type   | Description                                                                  |
| ---------- | ------ | ---------------------------------------------------------------------------- |
| `search`   | string | Filter count by search term (case-insensitive)                               |
| `category` | string | Filter count by metadata.category (use `ALL` to show all)                    |
| `tag`      | string | Filter count by metadata.tags (comma-separated, exact match, case-sensitive) |

**Response**:

```json
{
	"total": 42
}
```

---

#### Delete Product

`DELETE /products/:id`

**Authentication**: Required — minimum role `MANAGER`.

Deletes a product.

**Response**: Stripe delete confirmation object

---

### Prices

#### Create Price

`POST /prices`

**Authentication**: Required — minimum role `MANAGER`.

Creates a new Stripe Price for an existing product.

**Request Body**:

```json
{
	"product": "prod_1234567890",
	"unit_amount": 2000,
	"currency": "usd",
	"lookup_key": "premium_monthly",
	"nickname": "Premium Monthly"
}
```

**Validation Rules**:

- `product` is required and must be a non-empty string
- `unit_amount` is required and must be > 0
- `currency` is required

**Response**: Stripe Price object (201 status)

---

### Orders (Checkout Sessions)

#### List Orders

`GET /orders`

Returns a paginated list of Stripe Checkout Sessions with optional search and filter support.

**Authentication**: Required — minimum role `EMPLOYEE`.

**Query Parameters**:

| Parameter        | Type   | Description                                                                          |
| ---------------- | ------ | ------------------------------------------------------------------------------------ |
| `search`         | string | Filter by customer email, name, or session ID (case-insensitive substring match)     |
| `status`         | string | Filter by session status (`open`, `complete`, `expired`, or `ALL` for all)           |
| `payment_status` | string | Filter by payment status (`paid`, `unpaid`, `no_payment_required`, or `ALL` for all) |
| `order_status`   | string | Filter by `metadata.order_status` (e.g., `new`, `pending`, `fulfilled`, or `ALL`)    |
| `limit`          | number | Number of orders per page (default: 10)                                              |
| `starting_after` | string | Cursor for pagination — session ID to start after                                    |

When any filter is active, the API fetches all sessions (capped at 1000) and filters server-side in memory. Without filters, cursor-based pagination via Stripe's list API is used.

**Response**:

```json
{
  "data": [{ "id": "cs_test_...", "object": "checkout.session", ... }],
  "has_more": false,
  "total_count": 42
}
```

---

#### Get Single Order

`GET /orders/:id`

Returns a single Stripe Checkout Session with expanded line items.

**Authentication**: Required — minimum role `EMPLOYEE`.

**Response**:

```json
{
  "session": { "id": "cs_test_...", ... },
  "line_items": [{ "id": "li_...", ... }]
}
```

---

#### Update Order

`PUT /orders/:id`

Updates a Stripe Checkout Session's metadata and/or collected information (shipping details).

**Authentication**: Required — minimum role `EMPLOYEE`.

**Request Body**:

```json
{
	"metadata": {
		"order_status": "pending",
		"description": "Special instructions",
		"customer_name": "Jane Doe"
	},
	"collected_information": {
		"shipping_details": {
			"name": "Jane Doe",
			"address": {
				"line1": "123 Main St",
				"city": "Springfield",
				"state": "IL",
				"postal_code": "62701",
				"country": "US"
			}
		}
	}
}
```

**Notes**:

- `metadata` updates work for all session types (hosted, embedded, custom)
- `collected_information` updates only apply to embedded/custom sessions
- For 4xx Stripe errors, the raw Stripe error message is surfaced; 5xx errors return a generic message

**Response**: Updated Stripe Checkout Session object

---

#### Confirm Order

`POST /orders/confirm`

Confirms a paid Stripe Checkout Session, triggers a real-time notification via SSE, and sends an order notification email to the admin.

**Authentication**: Not required (public, called by Stripe redirect on success).

**Request Body**:

```json
{
	"sessionId": "cs_test_..."
}
```

**Validation Rules**:

- `sessionId` is required and must be a non-empty string

**Handler Logic**:

1. Retrieves the Stripe Checkout Session and verifies `payment_status === 'paid'`
2. Updates Stripe session metadata with `order_status: 'new'`
3. Calls `NotificationHub.notify({ type: 'new-order', orderId: sessionId })` on the single `default` instance — the hub persists the event in its SQLite storage and broadcasts it to every connected admin SSE client
4. Sends admin notification email (via Formspark if `formsparkFormId` is configured in site content, otherwise via Cloudflare Email Service)

**Response**:

```json
{
	"success": true
}
```

**Error Responses**:

| Status Code | Message                         |
| ----------- | ------------------------------- |
| 400         | `Missing sessionId`             |
| 400         | `Session not found`             |
| 400         | `Session payment not completed` |
| 500         | `Failed to confirm order`       |

---

### Contact

#### Submit Contact Form

`POST /contact`

Sends a contact form submission as an email to the site admin. The email delivery method depends on site configuration: if `formsparkFormId` is set in the site content (KV), the submission is forwarded to Formspark; otherwise, it is sent via Cloudflare Email Service (`env.EMAIL.send()`).

**Authentication**: Not required (public endpoint).

**Rate Limited**: Yes (same limits as other endpoints).

**Request Body**:

```json
{
	"name": "Jane Doe",
	"email": "jane@example.com",
	"subject": "general",
	"message": "I'd like to learn more about your honey.",
	"_gotcha": ""
}
```

**\_gotcha Field**: Honeypot for spam prevention. Real users send an empty string; bots often fill hidden fields. If populated, the server silently accepts the request without sending email.

**Response**:

```json
{
	"success": true
}
```

**Error Responses**:

| Status Code | Message                        |
| ----------- | ------------------------------ |
| 400         | `Missing required fields: ...` |
| 429         | `Rate limit exceeded`          |
| 500         | `Site content not configured`  |
| 500         | `Contact email not configured` |
| 500         | `Failed to send message`       |
| 500         | `Failed to send via Formspark` |

---

### Notifications

#### Admin Notifications Stream (SSE)

`GET /notifications/stream`

Provides a Server-Sent Events (SSE) stream for real-time admin notifications consumed by the admin panel. Backed by a single Durable Object (`NotificationHub`, instance name `default`) that persists every broadcast event in SQLite storage and replays missed events on reconnect.

**Authentication**: Requires a resolved caller. The `bea_at` cookie is sent automatically when `{ withCredentials: true }` is used — the worker validates it directly via the cookie trust chain.

**Reconnect / replay**: The hub honors the standard SSE `Last-Event-ID` header (browsers send it automatically when a previous response emitted `id:` lines). On reconnect, the hub replays every persisted event with a greater id, bounded by the replay window (`ISiteContent.notificationReplayHours`, configurable 1–24, default 1). Without a `Last-Event-ID`, the full window is replayed — handles cold reconnects after redeploy or DO eviction. As a fallback for tooling that can't set headers, the query parameter `?lastEventId=...` is also accepted.

**Eviction**: Events are evicted on every write by both age (the configured replay window) and count (the newest 500 are kept).

**Response**: SSE `text/event-stream` with the following events:

| Event                   | Data shape                                                                  | Description                                           |
| ----------------------- | --------------------------------------------------------------------------- | ----------------------------------------------------- |
| `connected`             | `{}`                                                                        | Emitted once after the initial replay completes       |
| `new-order`             | `{ id, ts, type: "new-order", orderId }`                                    | New paid order (from the Stripe webhook)              |
| `order-status-changed`  | `{ id, ts, type: "order-status-changed", orderId, prevStatus, nextStatus }` | Admin or another staff member changed `order_status`  |
| `product-updated`       | `{ id, ts, type: "product-updated", productId }`                            | Product was edited via the admin API                  |
| `product-deleted`       | `{ id, ts, type: "product-deleted", productId }`                            | Product was archived (soft-deleted) via the admin API |
| `: heartbeat` (comment) | n/a                                                                         | Keep-alive emitted every 30 seconds                   |

Each data event also carries an SSE `id:` line whose value is `${ts}-${counter}` (zero-padded, lexicographically sortable).

---

## Auth

All `/auth/*` endpoints use the standard `IApiResponse<T>` envelope. Rate-limit budget unless stated: standard rate-limit budget (100 req/min per IP).

### Login

`POST /auth/login`

**Role**: Public.

**Request Body**:

```json
{ "email": "owner@example.com", "password": "s3cr3t" }
```

**Success (200)**:

```json
{ "ok": true, "data": { "caller": { "email": "...", "role": "OWNER", "status": "ACTIVE" } } }
```

Sets `bea_at` HttpOnly `SameSite=Lax` cookie (1-hour TTL).

**Error codes**: `INVALID_CREDENTIALS` (401), `ACCOUNT_DISABLED` (403), `RATE_LIMITED` (429), `VALIDATION_ERROR` (400).

---

### Logout

`POST /auth/logout`

**Role**: Authenticated (any).

**Request Body**: none.

**Success (204)**: Sets `Set-Cookie: bea_at=; Max-Age=0` to clear the session.

**Error codes**: `UNAUTHORIZED` (401).

**Rate-limit budget**: Standard rate-limit budget.

---

### Refresh

`POST /auth/refresh`

**Role**: Authenticated (refresh-family cookie required).

**Request Body**: none.

**Success (200)**: Reissues `bea_at` cookie.

```json
{ "ok": true, "data": { "caller": { "email": "...", "role": "OWNER", "status": "ACTIVE" } } }
```

**Error codes**: `UNAUTHORIZED` (401), `REFRESH_FAMILY_INVALIDATED` (401).

**Rate-limit budget**: Standard rate-limit budget.

---

### Accept Invite

`POST /auth/accept-invite`

**Role**: Public (token-gated).

**Request Body**:

```json
{ "token": "<url-safe-token>", "password": "NewStr0ng!" }
```

**Success (200)**:

```json
{ "ok": true, "data": { "caller": { "email": "...", "role": "EMPLOYEE", "status": "ACTIVE" } } }
```

Sets `bea_at` cookie. Activates the user account.

**Error codes**: `INVALID_TOKEN` (400), `EXPIRED_TOKEN` (400), `WEAK_PASSWORD` (400, body includes `{ reasons: string[] }`), `VALIDATION_ERROR` (400).

**Rate-limit budget**: Standard rate-limit budget.

---

### Request Password Reset

`POST /auth/request-reset`

**Role**: Public.

**Request Body**:

```json
{ "email": "user@example.com" }
```

**Success (200)**: Always `{ "ok": true }` — no user enumeration. A reset email is sent if the address is known.

**Error codes**: None surfaced (always 200).

**Rate-limit budget**: Standard rate-limit budget.

---

### Complete Password Reset

`POST /auth/complete-reset`

**Role**: Public (token-gated).

**Request Body**:

```json
{ "token": "<url-safe-token>", "password": "NewStr0ng!" }
```

**Success (200)**:

```json
{ "ok": true }
```

**Error codes**: `INVALID_TOKEN` (400), `EXPIRED_TOKEN` (400), `WEAK_PASSWORD` (400, body includes `{ reasons: string[] }`).

**Rate-limit budget**: Standard rate-limit budget.

---

### Change Password

`POST /auth/change-password`

**Role**: Authenticated (any).

**Request Body**:

```json
{ "currentPassword": "OldPass1!", "newPassword": "NewStr0ng!" }
```

**Success (200)**:

```json
{ "ok": true }
```

All refresh-family tokens for the caller are invalidated. A `passwordChanged` email is sent.

**Error codes**: `INVALID_CREDENTIALS` (401), `WEAK_PASSWORD` (400, body includes `{ reasons: string[] }`).

**Rate-limit budget**: Standard rate-limit budget.

---

### Bootstrap Owner

`POST /auth/bootstrap-owner`

**Role**: Gated server-side by `bootstrapAvailable` (disabled once any OWNER user exists).

**Request Body**:

```json
{ "email": "owner@example.com" }
```

**Success (200)**:

```json
{ "ok": true, "data": { "caller": { "email": "...", "role": "OWNER", "status": "ACTIVE" } } }
```

**Error codes**: `BOOTSTRAP_DISABLED` (403).

**Rate-limit budget**: Standard rate-limit budget.

---

## Users

All `/users/*` endpoints use the standard `IApiResponse<T>` envelope.

### List Users

`GET /users`

**Role**: `OWNER`.

**Request**: No body.

**Success (200)**:

```json
{ "ok": true, "data": { "users": [{ "email": "...", "role": "MANAGER", "status": "ACTIVE" }] } }
```

**Error codes**: `UNAUTHORIZED` (401), `FORBIDDEN` (403).

**Rate-limit budget**: Standard rate-limit budget.

---

### Invite User

`POST /users/invite`

**Role**: `OWNER`.

**Request Body**:

```json
{ "email": "new@example.com", "role": "EMPLOYEE" }
```

**Success (201)**:

```json
{ "ok": true, "data": { "user": { "email": "...", "role": "EMPLOYEE", "status": "INVITED" } } }
```

Sends an invite email with a time-limited token link.

**Error codes**: `UNAUTHORIZED` (401), `FORBIDDEN` (403), `USER_ALREADY_EXISTS` (409), `VALIDATION_ERROR` (400).

**Rate-limit budget**: Standard rate-limit budget.

---

### Update User

`PUT /users/{email}`

**Role**: `OWNER`.

**Request Body** (partial update):

```json
{ "role": "MANAGER" }
```

or `{ "status": "DISABLED" }`.

**Success (200)**:

```json
{ "ok": true, "data": { "user": { "email": "...", "role": "MANAGER", "status": "ACTIVE" } } }
```

**Error codes**: `UNAUTHORIZED` (401), `FORBIDDEN` (403), `USER_NOT_FOUND` (404), `CANNOT_DEMOTE_LAST_OWNER` (409), `VALIDATION_ERROR` (400).

**Rate-limit budget**: Standard rate-limit budget.

---

### Delete User

`DELETE /users/{email}`

**Role**: `OWNER`.

**Request**: No body.

**Success (200)**:

```json
{ "ok": true }
```

**Error codes**: `UNAUTHORIZED` (401), `FORBIDDEN` (403), `USER_NOT_FOUND` (404), `CANNOT_DELETE_LAST_OWNER` (409).

**Rate-limit budget**: Standard rate-limit budget.

---

### Re-invite User

`POST /users/{email}/reinvite`

**Role**: `OWNER`.

**Request**: No body.

**Success (200)**:

```json
{ "ok": true }
```

Re-sends the invite email with a fresh token. Only valid for users with status `INVITED`.

**Error codes**: `UNAUTHORIZED` (401), `FORBIDDEN` (403), `USER_NOT_FOUND` (404), `USER_NOT_INVITED` (409).

**Rate-limit budget**: Standard rate-limit budget.

---

### Update Current User

`PUT /users/me`

**Role**: Any authenticated caller.

**Request Body** (partial update — only self-editable fields):

```json
{ "displayName": "Jane Doe" }
```

**Success (200)**:

```json
{ "ok": true, "data": { "user": { "email": "...", "role": "EMPLOYEE", "status": "ACTIVE", "displayName": "Jane Doe" } } }
```

**Error codes**: `UNAUTHORIZED` (401), `VALIDATION_ERROR` (400).

**Rate-limit budget**: Standard rate-limit budget.

---

## Settings

### Get Content Settings

`GET /settings/:type`

Returns content settings for the specified type.

**Types**: `site`, `process`, `testimonials`, `categories`

**Authentication**: Not required.

**Response**: JSON object with settings data.

**Error Responses**:

| Status Code | Message                   |
| ----------- | ------------------------- |
| 404         | `Content type not found`  |
| 500         | `Failed to read settings` |

---

### Update Content Settings

`PUT /settings/:type`

**Authentication**: Required — minimum role `MANAGER`.

Updates content settings for the specified type.

**Types**: `site`, `process`, `testimonials`, `categories`

**Request Body**: JSON object matching the settings type schema. For `categories`, the body is validated against a Zod schema (`{ id: string, label: string }[]`).

**Validation Rules**:

- `categories` type is validated with Zod — each entry must have `id` and `label` strings

**Response**: Updated settings JSON object

**Error Responses**:

| Status Code | Message                   |
| ----------- | ------------------------- |
| 400         | `Validation failed: ...`  |
| 404         | `Content type not found`  |
| 500         | `Failed to save settings` |

---

### Get Auth Policy

`GET /settings/auth-policy`

**Role**: Any authenticated caller.

**Request**: No body.

**Success (200)**:

```json
{
	"ok": true,
	"data": {
		"policy": {
			"minPasswordLength": 8,
			"requireUppercase": true,
			"requireNumber": true,
			"requireSpecial": false,
			"hibpCheck": true
		}
	}
}
```

**Error codes**: `UNAUTHORIZED` (401).

**Rate-limit budget**: Standard rate-limit budget.

---

### Update Auth Policy

`PUT /settings/auth-policy`

**Role**: `OWNER`.

**Request Body**: Partial policy object — any combination of:

```json
{
	"minPasswordLength": 10,
	"requireUppercase": true,
	"requireNumber": true,
	"requireSpecial": true,
	"hibpCheck": false
}
```

**Success (200)**:

```json
{ "ok": true, "data": { "policy": { ... } } }
```

**Error codes**: `UNAUTHORIZED` (401), `FORBIDDEN` (403), `VALIDATION_ERROR` (400).

**Rate-limit budget**: Standard rate-limit budget.

## CORS

- Configured via `ALLOWED_ORIGINS` environment variable
- Set to `*` to allow all origins (development only)
- Otherwise, provide comma-separated list: `https://example.com,https://app.example.com`
- Preflight requests are handled automatically
- All responses include appropriate CORS headers

---

## Rate Limiting

- Configured via `RATE_LIMITER` Durable Object namespace binding
- Default: 100 requests per minute per IP (configurable via `RATE_LIMIT_MAX` and `RATE_LIMIT_WINDOW` vars in `wrangler.jsonc`)
- Uses Cloudflare's trusted `cf.connectingIp` field to prevent IP spoofing
- Rate limiting is disabled if `RATE_LIMITER` binding is not configured
- Uses a Durable Object for atomic counting (no race conditions under concurrent requests)

**Rate Limit Exceeded Response**:

```json
{
	"error": "Rate limit exceeded"
}
```

Status Code: 429

---

## Error Responses

All errors return JSON:

```json
{
	"error": "Error message"
}
```

**Status Codes**:

| Status Code | Description                           |
| ----------- | ------------------------------------- |
| 400         | Bad Request (validation error)        |
| 401         | Unauthorized (missing/invalid auth)   |
| 403         | Forbidden (invalid origin or API key) |
| 404         | Not Found                             |
| 405         | Method Not Allowed                    |
| 429         | Rate Limit Exceeded                   |
| 500         | Internal Server Error                 |

---

## Environment Variables

See [AGENTS.md](./AGENTS.md#environment-variables) for full details.

---

## Setup

1. Install dependencies: `npm install`
2. Create KV namespace for content:
   ```bash
   npx wrangler kv namespace create "CONTENT_KV"
   ```
3. Update `wrangler.jsonc` with the KV namespace ID
4. Set secrets: `npx wrangler secret put STRIPE_SECRET_KEY` and `npx wrangler secret put ALLOWED_ORIGINS`
5. (Optional) Set API key: `npx wrangler secret put API_SECRET_KEY`
6. Deploy: `npm run deploy`

---

## Testing

Run tests: `npm run test`

Tests use Vitest with Cloudflare Workers pool.
