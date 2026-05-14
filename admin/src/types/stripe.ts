export interface StripePriceRecurring {
  interval: string;
  interval_count: number;
}

export interface StripePriceResponse {
  id: string;
  product: string;
  unit_amount: number;
  currency: string;
  recurring: StripePriceRecurring | null;
  lookup_key: string | null;
  type: string;
}

export interface StripeProductResponse {
  id: string;
  name: string;
  description: string | null;
  images: string[];
  metadata: Record<string, string>;
  default_price: string | StripePriceResponse | null;
  active: boolean;
  created: number;
  updated: number;
}

export interface StripeProductsListResponse {
  data: StripeProductResponse[];
  has_more: boolean;
  first_id: string | null;
  last_id: string | null;
}
