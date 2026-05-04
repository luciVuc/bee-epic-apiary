Here's a Cloudflare Worker function in TypeScript for creating and updating products in the Stripe Products catalog:

```typescript
import Stripe from "stripe";

interface Env {
  STRIPE_SECRET_KEY: string;
}

interface CreateProductRequest {
  name: string;
  description?: string;
  images?: string[];
  metadata?: Record<string, string>;
  tax_code?: string;
  unit_label?: string;
  url?: string;
  shippable?: boolean;
}

interface UpdateProductRequest {
  id: string;
  name?: string;
  description?: string;
  images?: string[];
  metadata?: Record<string, string>;
  tax_code?: string;
  unit_label?: string;
  url?: string;
  shippable?: boolean;
  active?: boolean;
}

interface CreatePriceRequest {
  product_id: string;
  unit_amount: number;
  currency: string;
  recurring?: {
    interval: "day" | "week" | "month" | "year";
    interval_count?: number;
  };
  lookup_key?: string;
  nickname?: string;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const stripe = new Stripe(env.STRIPE_SECRET_KEY);
    const url = new URL(request.url);
    const path = url.pathname;

    try {
      switch (request.method) {
        case "POST":
          if (path === "/products") {
            return await createProduct(request, stripe);
          } else if (path === "/prices") {
            return await createPrice(request, stripe);
          }
          break;

        case "PUT":
          if (path.startsWith("/products/")) {
            return await updateProduct(request, stripe, path);
          }
          break;

        case "GET":
          if (path === "/products") {
            return await listProducts(request, stripe);
          } else if (path.startsWith("/products/")) {
            return await getProduct(stripe, path);
          }
          break;

        case "DELETE":
          if (path.startsWith("/products/")) {
            return await deleteProduct(stripe, path);
          }
          break;

        default:
          return new Response("Method not allowed", { status: 405 });
      }

      return new Response("Not found", { status: 404 });
    } catch (error: any) {
      console.error("Error:", error);
      return new Response(
        JSON.stringify({
          error: error.message || "Internal server error",
        }),
        {
          status: error.statusCode || 500,
          headers: { "Content-Type": "application/json" },
        },
      );
    }
  },
};

async function createProduct(
  request: Request,
  stripe: Stripe,
): Promise<Response> {
  const data: CreateProductRequest = await request.json();

  const product = await stripe.products.create({
    name: data.name,
    description: data.description,
    images: data.images,
    metadata: data.metadata || {},
    tax_code: data.tax_code,
    unit_label: data.unit_label,
    url: data.url,
    shippable: data.shippable,
  });

  return new Response(JSON.stringify(product), {
    status: 201,
    headers: { "Content-Type": "application/json" },
  });
}

async function updateProduct(
  request: Request,
  stripe: Stripe,
  path: string,
): Promise<Response> {
  const productId = path.split("/")[2];
  const data: Omit<UpdateProductRequest, "id"> = await request.json();

  const product = await stripe.products.update(productId, {
    name: data.name,
    description: data.description,
    images: data.images,
    metadata: data.metadata,
    tax_code: data.tax_code,
    unit_label: data.unit_label,
    url: data.url,
    shippable: data.shippable,
    active: data.active,
  });

  return new Response(JSON.stringify(product), {
    headers: { "Content-Type": "application/json" },
  });
}

async function listProducts(
  request: Request,
  stripe: Stripe,
): Promise<Response> {
  const url = new URL(request.url);
  const limit = parseInt(url.searchParams.get("limit") || "10");
  const active = url.searchParams.get("active");

  const params: Stripe.ProductListParams = {
    limit: Math.min(limit, 100), // Cap at 100
  };

  if (active !== null) {
    params.active = active === "true";
  }

  const products = await stripe.products.list(params);

  return new Response(JSON.stringify(products), {
    headers: { "Content-Type": "application/json" },
  });
}

async function getProduct(stripe: Stripe, path: string): Promise<Response> {
  const productId = path.split("/")[2];

  const product = await stripe.products.retrieve(productId);

  return new Response(JSON.stringify(product), {
    headers: { "Content-Type": "application/json" },
  });
}

async function deleteProduct(stripe: Stripe, path: string): Promise<Response> {
  const productId = path.split("/")[2];

  const deletedProduct = await stripe.products.del(productId);

  return new Response(JSON.stringify(deletedProduct), {
    headers: { "Content-Type": "application/json" },
  });
}

async function createPrice(
  request: Request,
  stripe: Stripe,
): Promise<Response> {
  const data: CreatePriceRequest = await request.json();

  const priceParams: Stripe.PriceCreateParams = {
    product: data.product_id,
    unit_amount: data.unit_amount,
    currency: data.currency,
    lookup_key: data.lookup_key,
    nickname: data.nickname,
  };

  if (data.recurring) {
    priceParams.recurring = {
      interval: data.recurring.interval,
      interval_count: data.recurring.interval_count || 1,
    };
  }

  const price = await stripe.prices.create(priceParams);

  return new Response(JSON.stringify(price), {
    status: 201,
    headers: { "Content-Type": "application/json" },
  });
}
```

Usage examples:

Create a product:

```sh
curl -X POST https://your-worker.workers.dev/products \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Premium Subscription",
    "description": "Access to all premium features",
    "images": ["https://example.com/image.jpg"],
    "metadata": {"category": "subscription"}
  }'
```

Update a product:

```sh
curl -X PUT https://your-worker.workers.dev/products/prod_123 \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Updated Product Name",
    "active": true
  }'
```

Create a price for the product:

```sh
curl -X POST https://your-worker.workers.dev/prices \
  -H "Content-Type: application/json" \
  -d '{
    "product_id": "prod_123",
    "unit_amount": 2000,
    "currency": "usd",
    "recurring": {
      "interval": "month"
    },
    "lookup_key": "premium_monthly"
  }'
```

List products:

```sh
curl "https://your-worker.workers.dev/products?limit=20&active=true"
```

Key features:

• Full CRUD operations for products (Create, Read, Update, Delete)
• Price creation with support for one-time and recurring pricing
• Query parameters for filtering and pagination
• Error handling with proper HTTP status codes
• Type safety with TypeScript interfaces
• Metadata support for custom product attributes

Environment setup: Add your Stripe secret key to your wrangler.toml:

```
[env.production.vars]
STRIPE_SECRET_KEY = "sk_live_..."

[env.development.vars]
STRIPE_SECRET_KEY = "sk_test_..."
```

This worker provides a complete REST API for managing your Stripe product catalog through Cloudflare Workers.
