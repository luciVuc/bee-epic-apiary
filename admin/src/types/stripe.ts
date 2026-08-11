/**
 * Stripe response type barrel.
 *
 * As of Plan 2, the Stripe API response shapes come from `@bee-epic/shared/stripe`.
 * Re-exported here so existing imports across `admin/src/` keep working.
 */

export type {
  IStripePriceRecurring,
  IStripePriceResponse,
  IStripeProductResponse,
  IStripeProductsListResponse,
} from "@bee-epic/shared";
