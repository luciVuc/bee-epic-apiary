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

## Endpoints

### Checkout

#### Create Checkout Session(s)

`POST /checkout`

Creates Stripe checkout sessions for one-time payments and/or subscriptions.

**Request Body:**

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

**Validation:**

- `line_items` is required and must be a non-empty array
- Each item must have either `price` or `price_data`
- Each item must have `quantity >= 1`
- `success_url` and `cancel_url` are required and must be valid URLs

**Response:**

```json
{
	"sessions": ["https://checkout.stripe.com/pay/cs_..."],
	"message": "Single checkout session created"
}
```

Note: If you mix recurring and one-time items, multiple sessions will be created.

---

### Products

#### List All Products

`GET /products`

Returns a list of all Stripe products. Response is cached for 5 minutes.

**Response:** Stripe API response (see [Stripe Products List](https://stripe.com/docs/api/products/list))

---

#### Get Single Product

`GET /products/:id`

Returns a single product by ID.

**Response:** Stripe Product object (see [Stripe Product Retrieve](https://stripe.com/docs/api/products/retrieve))

---

#### Create Product

`POST /products`

**Authentication:** Required (if `API_SECRET_KEY` is set)

Creates a new Stripe product.

**Request Body:** Stripe ProductCreateParams (see [Stripe Product Create](https://stripe.com/docs/api/products/create))

```json
{
	"name": "My Product",
	"description": "Product description",
	"images": ["https://example.com/image.png"], // URLs validated
	"url": "https://example.com/product" // URL validated
}
```

**Validation:**

- `name` is required and must be a non-empty string
- URLs in `images` and `url` are validated

---

#### Update Product

`PUT /products/:id`

**Authentication:** Required (if `API_SECRET_KEY` is set)

Updates an existing product.

**Request Body:** Stripe ProductUpdateParams (see [Stripe Product Update](https://stripe.com/docs/api/products/update))

**Validation:**

- URLs in `images` and `url` are validated

---

#### Delete Product

`DELETE /products/:id`

**Authentication:** Required (if `API_SECRET_KEY` is set)

Deletes a product.

**Response:** Stripe delete confirmation

---

## CORS

- Configured via `ALLOWED_ORIGINS` environment variable
- Set to `*` to allow all origins (development only)
- Otherwise, provide comma-separated list: `https://example.com,https://app.example.com`
- Preflight requests are handled automatically

---

## Rate Limiting

- Configured via `RATE_LIMIT_KV` KV namespace binding
- Default: 100 requests per minute per IP
- Uses Cloudflare's trusted `cf.connectingIp` field

---

## Error Responses

All errors return JSON:

```json
{
	"error": "Error message"
}
```

**Status Codes:**

- `400` - Bad Request (validation error)
- `401` - Unauthorized (missing/invalid auth)
- `403` - Forbidden (invalid origin or API key)
- `404` - Not Found
- `405` - Method Not Allowed
- `429` - Rate Limit Exceeded
- `500` - Internal Server Error

---

## Environment Variables

| Variable            | Required | Description                            |
| ------------------- | -------- | -------------------------------------- |
| `STRIPE_SECRET_KEY` | Yes      | Stripe secret key                      |
| `ALLOWED_ORIGINS`   | Yes      | Comma-separated allowed origins or `*` |
| `API_SECRET_KEY`    | No       | API key for product CRUD operations    |
| `RATE_LIMIT_KV`     | No       | KV namespace for rate limiting         |

Set secrets using: `npx wrangler secret put STRIPE_SECRET_KEY`

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
