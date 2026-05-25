import type { IProduct } from "../types";
import { EProductCategory } from "../types";

interface IStripePriceRecurring {
  interval: string;
  interval_count: number;
}

interface IStripePriceResponse {
  id: string;
  product: string;
  unit_amount: number;
  currency: string;
  recurring: IStripePriceRecurring | null;
  lookup_key: string | null;
  type: string;
}

interface IStripeProductResponse {
  id: string;
  name: string;
  description: string | null;
  images: string[];
  metadata: Record<string, string>;
  default_price: string | IStripePriceResponse | null;
  active: boolean;
  created: number;
  updated: number;
}

/** Fallback image when a Stripe product has no images */
const DEFAULT_PRODUCT_IMAGE = `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect fill="%23fef3c7" width="100" height="100"/><text x="50" y="55" text-anchor="middle" font-size="40">🍯</text></svg>`;
const DEFAULT_PRODUCT_THUMBNAIL = DEFAULT_PRODUCT_IMAGE;

/**
 * Transform a Stripe Product object (with expanded default_price) into the app's IProduct shape.
 * Metadata fields mapped: slug, longDescription, category, inStock, featured, weight, tags, stripePaymentLinkId
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
  const defaultPrice = stripeProduct.default_price;
  if (defaultPrice && typeof defaultPrice === "object") {
    const priceObj = defaultPrice as IStripePriceResponse;
    price = priceObj.unit_amount || 0;
    stripePriceId = priceObj.id;
  } else if (defaultPrice && typeof defaultPrice === "string") {
    stripePriceId = defaultPrice;
  }

  return {
    id: stripeProduct.id,
    name: stripeProduct.name,
    slug: metadata.slug || stripeProduct.id,
    description: stripeProduct.description || "",
    longDescription: metadata.longDescription || "",
    price,
    stripePriceId,
    stripePaymentLinkId: metadata.stripePaymentLinkId || undefined,
    category: (metadata.category as EProductCategory) || EProductCategory.HONEY,
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
  return response.data.map(transformStripeProduct);
}
