import { z } from "zod";

/**
 * Product types — single source of truth for the product shape that flows
 * between Stripe, the services worker, the admin panel, and the storefront.
 *
 * Why `category` is typed as plain `string` instead of `EProductCategory`:
 * the canonical store is Stripe product metadata (a string), and the merchant
 * can edit the category enum from the admin Settings tab. The enum below is
 * a convenience for the default-template tenant; consumers should treat the
 * field as a free-form string and validate against the live category list.
 */

/** Default product category keys. Tenants can override the live category list via `/settings/categories`. */
export enum EProductCategory {
  HONEY = "HONEY",
  BEESWAX = "BEESWAX",
  GIFTS = "GIFTS",
  SUBSCRIPTIONS = "SUBSCRIPTIONS",
}

/**
 * Union of the default category keys, derived from `EProductCategory`.
 *
 * Intentionally an "internal escape hatch" — exported so legacy code paths
 * that need to enumerate the compile-time-known keys can avoid hand-typing
 * a parallel union (and drifting). Callers should NOT use this as the
 * authoritative type for `IProduct.category`: the live category list comes
 * from `/settings/categories` (CONTENT_KV) and tenants can add/remove
 * entries at runtime, so a runtime category check needs to consult that
 * list, not this static union (review M7).
 */
export type ProductCategory = keyof typeof EProductCategory;

/** Full product shape used by both admin and storefront, transformed from Stripe. */
export const ProductSchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
  description: z.string(),
  /** Optional long-form description; transform layers default to "". */
  longDescription: z.string().optional(),
  /** Price in cents. Defaults to 0 when no default_price is set on the Stripe product. */
  price: z.number().int().nonnegative(),
  stripePriceId: z.string().optional(),
  stripePaymentLinkId: z.string().optional(),
  /** Free-form category string. Validate against the live `/settings/categories` list. */
  category: z.string(),
  imageUrls: z.array(z.string()),
  thumbnailUrls: z.array(z.string()),
  inStock: z.boolean(),
  featured: z.boolean(),
  weight: z.string(),
  tags: z.array(z.string()),
  /** Stripe recurring billing interval (when the product has a recurring price). */
  recurringInterval: z.string().optional(),
  recurringIntervalCount: z.number().int().positive().optional(),
});

export type IProduct = z.infer<typeof ProductSchema>;

/** Input shape for creating/updating a product — same as IProduct minus the assigned id. */
export const ProductInputSchema = ProductSchema.omit({ id: true });

export type IProductInput = z.infer<typeof ProductInputSchema>;

/**
 * Payload accepted by `PUT /products/:id`. Allow-listed against Stripe's
 * `Product.update` params subset that the worker exposes; unknown fields are
 * rejected so a future Stripe API addition can't be smuggled through this
 * endpoint without a deliberate code change (review I14).
 */
export const ProductUpdateRequestSchema = z
  .object({
    name: z.string().min(1).max(200).optional(),
    description: z.string().max(2000).nullable().optional(),
    active: z.boolean().optional(),
    images: z.array(z.string().url()).max(8).optional(),
    metadata: z.record(z.string(), z.string()).optional(),
    /** Must be a Stripe Price id (`price_…`). */
    default_price: z
      .string()
      .regex(/^price_[A-Za-z0-9]+$/)
      .optional(),
    /** Stripe-listed top-level shipping URL on the product (used for shipping label generation). */
    url: z.string().url().optional(),
  })
  .strict();

export type IProductUpdateRequest = z.infer<typeof ProductUpdateRequestSchema>;
