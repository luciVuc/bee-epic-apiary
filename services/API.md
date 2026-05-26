# Bee Epic Apiary - Services API Documentation

Cloudflare Worker providing Stripe checkout and product management APIs.

## Base URL

```
https://your-worker.your-subdomain.workers.dev
```

## Authentication

For product creation, update, and deletion, if `API_SECRET_KEY` is set in the Cloudflare Worker environment, include the API key in the Authorization header:

```
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

## CORS

- Configured via `ALLOWED_ORIGINS` environment variable
- Set to `*` to allow all origins (development only)
- Otherwise, provide comma-separated list: `https://example.com,https://app.example.com`
- Preflight requests are handled automatically
- All responses include appropriate CORS headers

---

## Rate Limiting

- Configured via `RATE_LIMIT_KV` KV namespace binding
- Default: 100 requests per minute per IP
- Uses Cloudflare's trusted `cf.connectingIp` field to prevent IP spoofing
- Rate limiting is disabled if `RATE_LIMIT_KV` is not set

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
2. Create KV namespace: `npx wrangler kv namespace create "RATE_LIMIT_KV"`
3. Update `wrangler.jsonc` with the KV namespace ID
4. Set secrets: `npx wrangler secret put STRIPE_SECRET_KEY`
5. (Optional) Set API key: `npx wrangler secret put API_SECRET_KEY`
6. Deploy: `npm run deploy`

---

## Testing

Run tests: `npm run test`

Tests use Vitest with Cloudflare Workers pool.
