/** Transform functions for converting between Stripe API shapes and admin UI shapes */
import { z } from "zod";
import { OrderSchema } from "@bee-epic/shared";
import type { IProduct, IProductInput, IOrder, IOrderLineItem } from "../types";
import { EProductCategory } from "../types";
import { DEFAULT_PRODUCT_IMAGE, DEFAULT_PRODUCT_THUMBNAIL } from "./constants";

import type {
  IStripeProductResponse,
  IStripePriceResponse,
} from "../types/stripe";

const DEFAULT_IMAGES = [DEFAULT_PRODUCT_IMAGE, DEFAULT_PRODUCT_THUMBNAIL];

/**
 * Lenient Zod schema describing the subset of Stripe Checkout Session fields
 * we read in transformStripeSession. `.loose()` (Zod 4's replacement for
 * `.passthrough()`) keeps everything else Stripe sends so unknown fields
 * don't drop on the floor — important because Stripe extends the schema
 * over time and we don't want a new field to fail validation.
 *
 * Replaces the chain of `as Record<string, unknown>` casts that used to do
 * the same job at the type-system level only, with no runtime check
 * (review M4). Now a misshapen response produces a clear error at the
 * transform boundary instead of silently coercing to "" / 0 / "open" /
 * "unpaid" / "payment".
 */
const StripeAddressSchema = z
  .object({
    line1: z.string().nullish(),
    line2: z.string().nullish(),
    city: z.string().nullish(),
    state: z.string().nullish(),
    postal_code: z.string().nullish(),
    country: z.string().nullish(),
  })
  .loose();

const StripeCustomerDetailsSchema = z
  .object({
    email: z.string().nullish(),
    name: z.string().nullish(),
    phone: z.string().nullish(),
  })
  .loose();

const StripeShippingDetailsSchema = z
  .object({
    address: StripeAddressSchema.nullish(),
  })
  .loose();

const StripeSessionSchema = z
  .object({
    id: z.string().optional(),
    created: z.number().optional(),
    customer_details: StripeCustomerDetailsSchema.nullish(),
    customer_email: z.string().nullish(),
    customer_name: z.string().nullish(),
    customer_phone: z.string().nullish(),
    amount_total: z.number().nullish(),
    amount_subtotal: z.number().nullish(),
    currency: z.string().nullish(),
    status: z.string().nullish(),
    payment_status: z.string().nullish(),
    mode: z.string().nullish(),
    metadata: z.record(z.string(), z.string()).nullish(),
    url: z.string().nullish(),
    shipping_details: StripeShippingDetailsSchema.nullish(),
  })
  .loose();

type IStripeSession = z.infer<typeof StripeSessionSchema>;

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

  // Validate metadata.category against the known enum. Stripe metadata is a
  // freeform string and the previous cast silently created phantom categories
  // (typos, removed enum values) that the admin grid couldn't filter on
  // (review I11). Default to HONEY and warn when normalization happens.
  const validCategories = Object.values(EProductCategory) as string[];
  const rawCategory = metadata.category;
  const category: EProductCategory =
    rawCategory && validCategories.includes(rawCategory)
      ? (rawCategory as EProductCategory)
      : EProductCategory.HONEY;
  if (rawCategory && rawCategory !== category) {
    console.warn(
      `Unknown product category "${rawCategory}", defaulting to ${EProductCategory.HONEY}`,
      { productId: stripeProduct.id },
    );
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
    category,
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

function extractShippingAddress(session: IStripeSession): {
  line1: string | null;
  line2: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  country: string | null;
} | null {
  const address = session.shipping_details?.address;
  if (!session.shipping_details || !address) return null;
  const hasAnyField =
    address.line1 ||
    address.line2 ||
    address.city ||
    address.state ||
    address.postal_code ||
    address.country;
  if (!hasAnyField) return null;
  return {
    line1: address.line1 || null,
    line2: address.line2 || null,
    city: address.city || null,
    state: address.state || null,
    postalCode: address.postal_code || null,
    country: address.country || null,
  };
}

/**
 * Transform Stripe session to admin order format. Validates the input
 * with StripeSessionSchema (Zod) and the output with OrderSchema so a
 * regression in either direction is caught at the boundary (review M4).
 */
export function transformStripeSession(
  session: Record<string, unknown>,
): IOrder {
  const parsed = StripeSessionSchema.parse(session);
  const metadata = parsed.metadata ?? {};
  const result: IOrder = {
    id: parsed.id || "",
    created: parsed.created || 0,
    customerEmail:
      parsed.customer_details?.email || parsed.customer_email || null,
    customerName:
      parsed.customer_details?.name || metadata.customer_name || null,
    customerPhone:
      parsed.customer_details?.phone || metadata.customer_phone || null,
    amountTotal: parsed.amount_total || 0,
    amountSubtotal: parsed.amount_subtotal || 0,
    currency: parsed.currency || "usd",
    status: (parsed.status as IOrder["status"]) || "open",
    paymentStatus:
      (parsed.payment_status as IOrder["paymentStatus"]) || "unpaid",
    mode: (parsed.mode as IOrder["mode"]) || "payment",
    metadata,
    url: parsed.url || null,
    orderStatus: metadata.order_status || null,
    description: metadata.description || null,
    shippingAddress: extractShippingAddress(parsed),
  };
  // Parse the output against the admin contract — catches transform-side
  // bugs (renamed field, wrong default) before the result flows into
  // the rest of the app.
  return OrderSchema.parse(result);
}

export function transformStripeLineItem(
  item: Record<string, unknown>,
): IOrderLineItem {
  const price = item.price as Record<string, unknown> | null;
  const product =
    price && typeof price.product === "object" && price.product !== null
      ? (price.product as Record<string, unknown>)
      : null;

  const imageUrls: string[] =
    product?.images && Array.isArray(product.images)
      ? (product.images as string[])
      : [];

  return {
    id: (item.id as string) || "",
    description: (item.description as string) || "",
    amountTotal: (item.amount_total as number) || 0,
    amountSubtotal: (item.amount_subtotal as number) || 0,
    currency: (item.currency as string) || "usd",
    quantity: (item.quantity as number) || null,
    productId: product
      ? (product.id as string)
      : price
        ? (price.product as string) || null
        : null,
    imageUrls,
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
