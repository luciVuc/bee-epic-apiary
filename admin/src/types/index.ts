/**
 * Admin-side type barrel.
 *
 * As of Plan 2, the cross-project types (`IProduct`, `IProductInput`,
 * `EProductCategory`, order types) come from `@bee-epic/shared`. The
 * admin-only `IDashboardStats` stays here. Existing imports across `admin/src/`
 * keep working unchanged.
 */

import { EUserStatus } from "@bee-epic/shared";

export * from "./order";

export { EProductCategory, EStaffRole } from "@bee-epic/shared";
export type {
  ProductCategory,
  IProduct,
  IProductInput,
} from "@bee-epic/shared";
export { EUserStatus } from "@bee-epic/shared";

/** Caller identity resolved from session cookie / bearer / dev bypass. */
export interface ICaller {
  email: string;
  role: import("@bee-epic/shared").EStaffRole;
  via: "cookie" | "bearer" | "dev";
  /**
   * Optional display name. Not populated by the server today (login /
   * whoami return only email/role/via), but downstream UI (Phase 10.13
   * UserMenu) will consume it if present — keeping the type honest.
   */
  displayName?: string;
  /**
   * Optional lifecycle status mirrored from the server user record.
   * When `DISABLED`, the caller must be treated as unauthorized regardless
   * of role — a stale probe should never leak privileged UI.
   */
  status?: EUserStatus;
}

/** Computed statistics for the dashboard page (admin-only). */
export interface IDashboardStats {
  totalProducts: number;
  inStockProducts: number;
  featuredProducts: number;
  totalCategories: number;
  honeyProducts: number;
  beeswaxProducts: number;
  giftProducts: number;
  subscriptionProducts: number;
}
