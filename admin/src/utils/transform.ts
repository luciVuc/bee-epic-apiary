import type { IProduct, IProductInput } from "../types";
import { EProductCategory } from "../types";

const DEFAULT_IMAGE = "/images/products/default.svg";
const DEFAULT_THUMBNAIL = "/images/products/default-thumbnail.svg";

/**
 * Transform Stripe product to admin product format
 * Stripe products don't have category, inStock, featured, etc.
 * We store these in metadata or use defaults
 */
export function transformStripeProduct(stripeProduct: any): IProduct {
  const metadata = stripeProduct.metadata || {};

  // Use Stripe images or default placeholder
  const stripeImages = stripeProduct.images || [];
  const imageUrls = stripeImages.length > 0 ? stripeImages : [DEFAULT_IMAGE];
  const thumbnailUrls =
    stripeImages.length > 0 ? stripeImages : [DEFAULT_THUMBNAIL];

  return {
    id: stripeProduct.id,
    name: stripeProduct.name,
    slug: metadata.slug || stripeProduct.id,
    description: stripeProduct.description || "",
    longDescription: metadata.longDescription || "",
    price: metadata.price ? parseInt(metadata.price) : 0,
    stripePriceId: stripeProduct.default_price || undefined,
    stripePaymentLinkId: metadata.stripePaymentLinkId || undefined,
    category: (metadata.category as EProductCategory) || EProductCategory.HONEY,
    imageUrls: imageUrls,
    thumbnailUrls: thumbnailUrls,
    inStock: metadata.inStock !== "false",
    featured: metadata.featured === "true",
    weight: metadata.weight || "",
    tags: metadata.tags ? metadata.tags.split(",") : [],
  };
}

/**
 * Transform admin product to Stripe product create/update params
 */
export function transformToStripeParams(product: Partial<IProductInput>) {
  const params: any = {
    name: product.name,
    description: product.description,
    images: product.imageUrls || [],
    metadata: {
      slug: product.slug || "",
      longDescription: product.longDescription || "",
      price: product.price?.toString() || "0",
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
 * Transform Stripe products list response
 */
export function transformStripeProductsList(response: any): IProduct[] {
  if (!response || !response.data || !Array.isArray(response.data)) {
    return [];
  }
  return response.data.map(transformStripeProduct);
}
