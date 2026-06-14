# Bee Epic Apiary - Services API Documentation

Cloudflare Worker providing Stripe checkout and product management APIs.

## Base URL

```text
https://your-worker.your-subdomain.workers.dev   (production)
http://localhost:8787                             (local dev)
```

## Authentication

For product creation, update, and deletion, if `API_SECRET_KEY` is set in the Cloudflare Worker environment, include the API key in the Authorization header:

```text
Authorization: Bearer <your-api-secret-key>
```

If `API_SECRET_KEY` is not set, authentication is disabled (suitable for development).

### Error Responses for Authentication

| Status Code | Message                                                    | Description                                    |
| ----------- | ---------------------------------------------------------- | ---------------------------------------------- |
| 401         | `Missing authorization header`                             | No Authorization header provided               |
| 401         | `Invalid authorization header format. Use: Bearer <token>` | Header is not in `Bearer <token>` format       |
| 403         | `Invalid API key`                                          | Provided token does not match `API_SECRET_KEY` |

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

**Authentication**: Required (if `API_SECRET_KEY` is set).

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

**Authentication**: Required (if `API_SECRET_KEY` is set).

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

| Parameter  | Type   | Description                                                     |
| ---------- | ------ | --------------------------------------------------------------- |
| `search`   | string | Filter count by search term (case-insensitive)                  |
| `category` | string | Filter count by metadata.category (use `ALL` to show all)       |
| `tag`      | string | Filter count by metadata.tags (comma-separated, case-sensitive) |

**Response**:

```json
{
	"total": 42
}
```

---

#### Delete Product

`DELETE /products/:id`

**Authentication**: Required (if `API_SECRET_KEY` is set).

Deletes a product.

**Response**: Stripe delete confirmation object

---

### Prices

#### Create Price

`POST /prices`

**Authentication**: Required (if `API_SECRET_KEY` is set).

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

**Authentication**: Required (if `API_SECRET_KEY` is set).

**Query Parameters**:

| Parameter        | Type   | Description                                                                          |
| ---------------- | ------ | ------------------------------------------------------------------------------------ |
| `search`         | string | Filter by customer email, name, or session ID (case-insensitive substring match)     |
| `status`         | string | Filter by session status (`open`, `complete`, `expired`, or `ALL` for all)           |
| `payment_status` | string | Filter by payment status (`paid`, `unpaid`, `no_payment_required`, or `ALL` for all) |
| `limit`          | number | Number of orders per page (default: 10)                                              |
| `starting_after` | string | Cursor for pagination — session ID to start after                                    |

When filter parameters are active, the API uses Stripe's Search API for server-side filtering with client-side name/ID fallback. Without filters, cursor-based pagination via Stripe's list API is used.

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

**Authentication**: Required (if `API_SECRET_KEY` is set).

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

**Authentication**: Required (if `API_SECRET_KEY` is set).

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
3. Writes a notification to `CONTENT_KV` with 24h TTL (consumed by SSE stream)
4. Sends admin notification email via Cloudflare Email Service

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

Sends a contact form submission as an email to the site admin via Cloudflare Email Service.

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

---

### Notifications

#### Order Notifications Stream (SSE)

`GET /notifications/stream`

Provides a Server-Sent Events (SSE) stream for real-time order notifications consumed by the admin panel.

**Authentication**: Not required.

**Response**: SSE text/event-stream with the following events:

| Event       | Data                 | Description                     |
| ----------- | -------------------- | ------------------------------- |
| `connected` | `{}`                 | Initial connection confirmation |
| `new-order` | `{ sessionId, ... }` | New order notification from KV  |
| `heartbeat` | `{}`                 | Keep-alive every 30 seconds     |

The stream polls `CONTENT_KV` every 5 seconds for keys with prefix `notifications:`.

---

## Settings

### Get Settings

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

### Update Settings

`PUT /settings/:type`

**Authentication**: Required (if `API_SECRET_KEY` is set).

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

## CORS

- Configured via `ALLOWED_ORIGINS` environment variable
- Set to `*` to allow all origins (development only)
- Otherwise, provide comma-separated list: `https://example.com,https://app.example.com`
- Preflight requests are handled automatically
- All responses include appropriate CORS headers

---

## Rate Limiting

- Configured via `RATE_LIMIT_KV` KV namespace binding
- Default: 100 requests per minute per IP (configurable via `RATE_LIMIT_MAX` and `RATE_LIMIT_WINDOW` vars in `wrangler.jsonc`)
- Uses Cloudflare's trusted `cf.connectingIp` field to prevent IP spoofing
- Rate limiting is disabled if `RATE_LIMIT_KV` binding is not configured

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
| Status Code | Description |
|-------------|-------------|
| 400 | Bad Request (validation error) |
| 401 | Unauthorized (missing/invalid auth) |
| 403 | Forbidden (invalid origin or API key) |
| 404 | Not Found |
| 405 | Method Not Allowed |
| 429 | Rate Limit Exceeded |
| 500 | Internal Server Error |

---

## Environment Variables

See [AGENTS.md](./AGENTS.md#environment-variables) for full details.

---

## Setup

1. Install dependencies: `npm install`
2. Create KV namespaces:
   ```bash
   npx wrangler kv namespace create "RATE_LIMIT_KV"
   npx wrangler kv namespace create "CONTENT_KV"
   ```
3. Update `wrangler.jsonc` with the KV namespace IDs
4. Set secrets: `npx wrangler secret put STRIPE_SECRET_KEY` and `npx wrangler secret put ALLOWED_ORIGINS`
5. (Optional) Set API key: `npx wrangler secret put API_SECRET_KEY`
6. Deploy: `npm run deploy`

---

## Testing

Run tests: `npm run test`

Tests use Vitest with Cloudflare Workers pool.
