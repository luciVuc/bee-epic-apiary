import type { IProduct } from "../types";
import { EProductCategory } from "../types";
import type {
  IStripePriceResponse,
  IStripeProductResponse,
} from "@bee-epic/shared";

/** Fallback image when a Stripe product has no images */
const DEFAULT_PRODUCT_IMAGE = `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect fill="%23fef3c7" width="100" height="100"/><text x="50" y="55" text-anchor="middle" font-size="40">🍯</text></svg>`;
const DEFAULT_PRODUCT_THUMBNAIL = DEFAULT_PRODUCT_IMAGE;

/**
 * Transform a Stripe Product object (with expanded default_price) into the app's IProduct shape.
 * Metadata fields mapped: slug, longDescription, category, inStock, featured, weight, tags, stripePaymentLinkId
 *
 * Returns `null` when `default_price` is a bare string (unexpanded). The
 * storefront then drops the product from the catalog rather than rendering
 * "$0.00" for it — review #14. (The admin panel still renders these, since
 * staff need to see them to fix the underlying Stripe data.)
 */
export function transformStripeProduct(
  stripeProduct: IStripeProductResponse,
): IProduct | null {
  const metadata = stripeProduct.metadata || {};
  const stripeImages = stripeProduct.images || [];
  const imageUrls =
    stripeImages.length > 0 ? stripeImages : [DEFAULT_PRODUCT_IMAGE];
  const thumbnailUrls =
    stripeImages.length > 0 ? stripeImages : [DEFAULT_PRODUCT_THUMBNAIL];

  let price = 0;
  let stripePriceId: string | undefined = undefined;
  const defaultPrice = stripeProduct.default_price;
  if (defaultPrice && typeof defaultPrice === "object") {
    const priceObj = defaultPrice as IStripePriceResponse;
    price = priceObj.unit_amount || 0;
    stripePriceId = priceObj.id;
  } else if (defaultPrice && typeof defaultPrice === "string") {
    // Unexpanded price — caller forgot `expand[]=data.default_price`, or
    // Stripe omitted the expansion. Either way the storefront can't show a
    // real price; drop the product.
    console.warn(
      `Product ${stripeProduct.id} has unexpanded default_price; dropping from storefront`,
    );
    return null;
  } else if (!defaultPrice) {
    // No price set at all — same outcome: not sellable.
    console.warn(
      `Product ${stripeProduct.id} has no default_price; dropping from storefront`,
    );
    return null;
  }

  const rawCategory = metadata.category;
  const category =
    rawCategory &&
    Object.values(EProductCategory).includes(rawCategory as EProductCategory)
      ? (rawCategory as EProductCategory)
      : EProductCategory.HONEY;

  return {
    id: stripeProduct.id,
    name: stripeProduct.name,
    slug: metadata.slug || stripeProduct.id,
    description: stripeProduct.description || "",
    longDescription: metadata.longDescription || "",
    price,
    stripePriceId,
    stripePaymentLinkId: metadata.stripePaymentLinkId || undefined,
    category,
    imageUrls,
    thumbnailUrls,
    inStock: metadata.inStock !== "false",
    featured: metadata.featured === "true",
    weight: metadata.weight || "",
    tags: metadata.tags ? metadata.tags.split(",") : [],
  };
}

/** Transform a Stripe products list response into an array of IProduct */
export function transformStripeProductsList(
  response: { data?: IStripeProductResponse[] } | null,
): IProduct[] {
  if (!response?.data || !Array.isArray(response.data)) {
    return [];
  }
  // .filter(Boolean) drops null returns from transformStripeProduct (products
  // with unexpanded or missing default_price); the cast preserves the
  // narrowed IProduct[] type since TS doesn't track Boolean()-filtering.
  return response.data
    .map(transformStripeProduct)
    .filter(Boolean) as IProduct[];
}
