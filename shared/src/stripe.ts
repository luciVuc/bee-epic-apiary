/**
 * Stripe API response shapes — the JSON the services worker passes through
 * from Stripe to the admin and web clients. These are subsets of the official
 * Stripe types kept narrow so admin and web don't pull in `stripe-node`.
 *
 * Used by:
 *   - admin/src/utils/transform.ts (axios responses)
 *   - web/src/utils/transform.ts (fetch responses)
 *
 * Kept type-only on purpose: no Zod schemas here because the services worker
 * trusts Stripe's API contract; clients receive whatever the worker forwarded.
 */

/** Recurring-price details on a Stripe Price (e.g. monthly subscription). */
export interface IStripePriceRecurring {
  interval: string;
  interval_count: number;
}

/** A single Stripe Price object as returned by `prices.retrieve` / `prices.list`. */
export interface IStripePriceResponse {
  id: string;
  product: string;
  unit_amount: number;
  currency: string;
  recurring: IStripePriceRecurring | null;
  lookup_key: string | null;
  type: string;
}

/** A single Stripe Product object as returned by `products.retrieve` / `products.list`. */
export interface IStripeProductResponse {
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

/** Paginated list response wrapping `IStripeProductResponse[]` (Stripe's standard list shape). */
export interface IStripeProductsListResponse {
  data: IStripeProductResponse[];
  has_more: boolean;
  first_id: string | null;
  last_id: string | null;
}
