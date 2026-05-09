import type { IProduct, IProductInput } from "../types";
import { EProductCategory } from "../types";

const DEFAULT_IMAGE = "/images/products/default.svg";
const DEFAULT_THUMBNAIL = "/images/products/default-thumbnail.svg";

/**
 * Transform Stripe product to admin product format
 * Stripe products don't have category, inStock, featured, etc.
 * We store these in metadata or use defaults.
 * Price is retrieved from the expanded default_price object.
 */
export function transformStripeProduct(stripeProduct: any): IProduct {
  const metadata = stripeProduct.metadata || {};

  // Use Stripe images or default placeholder
  const stripeImages = stripeProduct.images || [];
  const imageUrls = stripeImages.length > 0 ? stripeImages : [DEFAULT_IMAGE];
  const thumbnailUrls =
    stripeImages.length > 0 ? stripeImages : [DEFAULT_THUMBNAIL];

  // Get price from expanded default_price (Stripe returns unit_amount in cents)
  let price = 0;
  let stripePriceId: string | undefined = undefined;
  let recurringInterval: string | undefined = undefined;
  let recurringIntervalCount: number | undefined = undefined;
  if (
    stripeProduct.default_price &&
    typeof stripeProduct.default_price === "object"
  ) {
    const defaultPrice = stripeProduct.default_price as any;
    price = defaultPrice.unit_amount || 0;
    stripePriceId = defaultPrice.id;
    if (defaultPrice.recurring) {
      recurringInterval = defaultPrice.recurring.interval;
      recurringIntervalCount = defaultPrice.recurring.interval_count || 1;
    }
  } else if (
    stripeProduct.default_price &&
    typeof stripeProduct.default_price === "string"
  ) {
    stripePriceId = stripeProduct.default_price;
  }

  return {
    id: stripeProduct.id,
    name: stripeProduct.name,
    slug: metadata.slug || stripeProduct.id,
    description: stripeProduct.description || "",
    longDescription: metadata.longDescription || "",
    price: price,
    stripePriceId: stripePriceId,
    stripePaymentLinkId: metadata.stripePaymentLinkId || undefined,
    category: (metadata.category as EProductCategory) || EProductCategory.HONEY,
    imageUrls: imageUrls,
    thumbnailUrls: thumbnailUrls,
    inStock: metadata.inStock !== "false",
    featured: metadata.featured === "true",
    weight: metadata.weight || "",
    tags: metadata.tags ? metadata.tags.split(",") : [],
    recurringInterval,
    recurringIntervalCount,
  };
}

/**
 * Transform admin product to Stripe product create/update params
 * Note: Price is NOT included in metadata - it's created as a separate Stripe Price object
 */
export function transformToStripeParams(product: Partial<IProductInput>) {
  const params: any = {
    name: product.name,
    description: product.description,
    images: product.imageUrls || [],
    metadata: {
      slug: product.slug || "",
      longDescription: product.longDescription || "",
      category: product.category || EProductCategory.HONEY,
      inStock: product.inStock?.toString() || "true",
      featured: product.featured?.toString() || "false",
      weight: product.weight || "",
      tags: product.tags?.join(",") || "",
    },
  };

  // Clean up empty values
  if (!params.description) delete params.description;
  if (!params.images || params.images.length === 0) delete params.images;

  return params;
}

/**
 * Create params for Stripe Price creation
 */
export function transformToStripePriceParams(
  productId: string,
  price: number,
  currency: string = "usd",
  lookupKey?: string,
  recurringInterval?: string,
  recurringIntervalCount?: number,
): any {
  const params: any = {
    product: productId,
    unit_amount: price,
    currency: currency,
    lookup_key: lookupKey || undefined,
  };
  if (recurringInterval) {
    params.recurring = {
      interval: recurringInterval,
      interval_count: recurringIntervalCount || 1,
    };
  }
  return params;
}

/**
 * Transform Stripe products list response
 */
export function transformStripeProductsList(response: any): IProduct[] {
  if (!response || !response.data || !Array.isArray(response.data)) {
    return [];
  }
  return response.data.map(transformStripeProduct);
}
