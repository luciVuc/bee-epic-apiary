/** Recurring billing interval from a Stripe Price */
export interface IStripePriceRecurring {
  interval: string;
  interval_count: number;
}

/** Shape of a Stripe Price object returned from the API */
export interface IStripePriceResponse {
  id: string;
  product: string;
  unit_amount: number;
  currency: string;
  recurring: IStripePriceRecurring | null;
  lookup_key: string | null;
  type: string;
}

/** Shape of a Stripe Product object returned from the API */
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

/** Shape of a paginated Stripe Product list response */
export interface IStripeProductsListResponse {
  data: IStripeProductResponse[];
  has_more: boolean;
  first_id: string | null;
  last_id: string | null;
}
