/**
 * Web-side type barrel.
 *
 * As of Plan 2, the cross-project types come from `@bee-epic/shared`.
 * Re-exported here so existing imports across `web/src/` keep working
 * unchanged. New code should import from `@bee-epic/shared` directly.
 *
 * `ICartItem` is web-only (the admin doesn't have a cart) and stays defined
 * locally.
 */

export {
  EProductCategory,
  type ProductCategory,
  type IProduct,
  type ITestimonial,
  type IProcessStep,
  type ICategory,
  type ISocialLinks,
  type INavLink,
  type ISiteContent,
} from "@bee-epic/shared";

import type { IProduct } from "@bee-epic/shared";

/** Cart line item — web-only. */
export interface ICartItem {
  product: IProduct;
  quantity: number;
}
