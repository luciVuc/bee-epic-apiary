/** Transform functions for converting between Stripe API shapes and admin UI shapes */
import type { IProduct, IProductInput, IOrder, IOrderLineItem } from "../types";
import { EProductCategory } from "../types";
import { DEFAULT_PRODUCT_IMAGE, DEFAULT_PRODUCT_THUMBNAIL } from "./constants";

import type {
  IStripeProductResponse,
  IStripePriceResponse,
} from "../types/stripe";

const DEFAULT_IMAGES = [DEFAULT_PRODUCT_IMAGE, DEFAULT_PRODUCT_THUMBNAIL];

/**
 * Transform Stripe product to admin product format
 * Stripe products don't have category, inStock, featured, etc.
 * We store these in metadata or use defaults.
 * Price is retrieved from the expanded default_price object.
 */
export function transformStripeProduct(
  stripeProduct: IStripeProductResponse,
): IProduct {
  const metadata = stripeProduct.metadata || {};

  const stripeImages = stripeProduct.images || [];
  const imageUrls =
    stripeImages.length > 0 ? stripeImages : [DEFAULT_PRODUCT_IMAGE];
  const thumbnailUrls =
    stripeImages.length > 0 ? stripeImages : [DEFAULT_PRODUCT_THUMBNAIL];

  let price = 0;
  let stripePriceId: string | undefined = undefined;
  let recurringInterval: string | undefined = undefined;
  let recurringIntervalCount: number | undefined = undefined;
  const defaultPrice = stripeProduct.default_price;
  if (defaultPrice && typeof defaultPrice === "object") {
    const priceObj = defaultPrice as IStripePriceResponse;
    price = priceObj.unit_amount || 0;
    stripePriceId = priceObj.id;
    if (priceObj.recurring) {
      recurringInterval = priceObj.recurring.interval;
      recurringIntervalCount = priceObj.recurring.interval_count || 1;
    }
  } else if (defaultPrice && typeof defaultPrice === "string") {
    stripePriceId = defaultPrice;
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
export function transformToStripeParams(
  product: Partial<IProductInput>,
): Record<string, unknown> {
  const params: Record<string, unknown> = {
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
      stripePaymentLinkId: product.stripePaymentLinkId || "",
    },
  };

  // Clean up empty values
  if (!params.description) delete params.description;
  const images = params.images as string[] | undefined;
  if (!images || images.length === 0) {
    params.images = [];
  } else {
    params.images = images.filter((url) => !DEFAULT_IMAGES.includes(url));
  }

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
): Record<string, unknown> {
  const params: Record<string, unknown> = {
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
export function transformStripeSession(
  session: Record<string, unknown>,
): IOrder {
  return {
    id: (session.id as string) || "",
    created: (session.created as number) || 0,
    customerEmail:
      ((session.customer_details as Record<string, unknown> | null)
        ?.email as string) ||
      (session.customer_email as string) ||
      null,
    customerName:
      ((session.customer_details as Record<string, unknown> | null)
        ?.name as string) || null,
    customerPhone:
      ((session.customer_details as Record<string, unknown> | null)
        ?.phone as string) || null,
    amountTotal: (session.amount_total as number) || 0,
    amountSubtotal: (session.amount_subtotal as number) || 0,
    currency: (session.currency as string) || "usd",
    status: (session.status as IOrder["status"]) || "open",
    paymentStatus:
      (session.payment_status as IOrder["paymentStatus"]) || "unpaid",
    mode: (session.mode as IOrder["mode"]) || "payment",
    metadata: (session.metadata as Record<string, string>) || {},
    url: (session.url as string) || null,
  };
}

export function transformStripeLineItem(
  item: Record<string, unknown>,
): IOrderLineItem {
  const price = item.price as Record<string, unknown> | null;
  return {
    id: (item.id as string) || "",
    description: (item.description as string) || "",
    amountTotal: (item.amount_total as number) || 0,
    amountSubtotal: (item.amount_subtotal as number) || 0,
    currency: (item.currency as string) || "usd",
    quantity: (item.quantity as number) || null,
    price: price
      ? {
          id: (price.id as string) || "",
          unitAmount: (price.unit_amount as number) || null,
          currency: (price.currency as string) || "usd",
        }
      : null,
  };
}

export function transformStripeSessionsList(
  response: { data?: Record<string, unknown>[] } | null,
): IOrder[] {
  if (!response?.data || !Array.isArray(response.data)) {
    return [];
  }
  return response.data.map(transformStripeSession);
}

export function transformStripeLineItemsList(
  items: Record<string, unknown>[] | null | undefined,
): IOrderLineItem[] {
  if (!items || !Array.isArray(items)) {
    return [];
  }
  return items.map(transformStripeLineItem);
}

export function transformStripeProductsList(
  response: { data?: IStripeProductResponse[] } | null,
): IProduct[] {
  if (!response?.data || !Array.isArray(response.data)) {
    return [];
  }
  return response.data.map(transformStripeProduct);
}
