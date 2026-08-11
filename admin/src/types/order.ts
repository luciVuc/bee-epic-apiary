/**
 * Order type barrel.
 *
 * As of Plan 2, the order shapes come from `@bee-epic/shared/order`.
 * Re-exported here so existing `import { IOrder, ... } from "../types/order"`
 * and `import { ... } from "../types"` imports keep working.
 */

export type {
  IOrder,
  IShippingAddress,
  IOrderUpdate,
  IOrderLineItem,
} from "@bee-epic/shared";
