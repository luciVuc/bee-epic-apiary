import { z } from "zod";

/**
 * Typed event union broadcast by the NotificationHub Durable Object over SSE.
 *
 * Each event carries:
 *  - `id`: unique, sortable identifier (`${ts}-${counter}`, both zero-padded).
 *    Used as the SSE `id:` line and matched against incoming `Last-Event-ID`
 *    headers on reconnect.
 *  - `ts`: ms-epoch timestamp; used for age-based eviction.
 *  - `type`: discriminator for the rest of the payload.
 *
 * Originally defined in `services/src/notifications/types.ts` during Plan 1;
 * promoted here in Plan 2 so admin (and any future client) can subscribe with
 * the same type definitions.
 */

/**
 * Discriminator: every event type the hub broadcasts.
 *
 * A real enum (rather than a literal-union type) so consumers can refer to
 * `ENotificationType.NEW_ORDER` instead of hand-typing the string in five
 * different files. The string values are the wire format — they appear in
 * SSE `event:` lines and in JSON payloads, so changing them is a breaking
 * protocol change.
 */
export enum ENotificationType {
  NEW_ORDER = "new-order",
  ORDER_STATUS_CHANGED = "order-status-changed",
  PRODUCT_UPDATED = "product-updated",
  PRODUCT_DELETED = "product-deleted",
}

export const NewOrderEventSchema = z.object({
  id: z.string(),
  ts: z.number().int().nonnegative(),
  type: z.literal(ENotificationType.NEW_ORDER),
  orderId: z.string(),
});
export type INewOrderEvent = z.infer<typeof NewOrderEventSchema>;

export const OrderStatusChangedEventSchema = z.object({
  id: z.string(),
  ts: z.number().int().nonnegative(),
  type: z.literal(ENotificationType.ORDER_STATUS_CHANGED),
  orderId: z.string(),
  prevStatus: z.string().nullable(),
  nextStatus: z.string(),
});
export type IOrderStatusChangedEvent = z.infer<
  typeof OrderStatusChangedEventSchema
>;

export const ProductUpdatedEventSchema = z.object({
  id: z.string(),
  ts: z.number().int().nonnegative(),
  type: z.literal(ENotificationType.PRODUCT_UPDATED),
  productId: z.string(),
});
export type IProductUpdatedEvent = z.infer<typeof ProductUpdatedEventSchema>;

export const ProductDeletedEventSchema = z.object({
  id: z.string(),
  ts: z.number().int().nonnegative(),
  type: z.literal(ENotificationType.PRODUCT_DELETED),
  productId: z.string(),
});
export type IProductDeletedEvent = z.infer<typeof ProductDeletedEventSchema>;

/** Discriminated union of every event the hub broadcasts. */
export const NotificationEventSchema = z.discriminatedUnion("type", [
  NewOrderEventSchema,
  OrderStatusChangedEventSchema,
  ProductUpdatedEventSchema,
  ProductDeletedEventSchema,
]);
export type INotificationEvent = z.infer<typeof NotificationEventSchema>;

/**
 * Shape callers pass to `NotificationHub.notify(...)`. The hub stamps
 * `id` and `ts` itself, so callers must not provide them.
 */
export type INotificationEventInput =
  | Omit<INewOrderEvent, "id" | "ts">
  | Omit<IOrderStatusChangedEvent, "id" | "ts">
  | Omit<IProductUpdatedEvent, "id" | "ts">
  | Omit<IProductDeletedEvent, "id" | "ts">;

/**
 * Runtime parser for `INotificationEventInput`. The hub uses this to validate
 * caller-supplied payloads before stamping `id`/`ts` and persisting them —
 * a bad input shape used to corrupt the SQLite row and break SSE replay; now
 * it drops the event and logs the parse error instead.
 *
 * Mirrors `NotificationEventSchema` minus the hub-stamped fields.
 */
export const NotificationEventInputSchema = z.discriminatedUnion("type", [
  NewOrderEventSchema.omit({ id: true, ts: true }),
  OrderStatusChangedEventSchema.omit({ id: true, ts: true }),
  ProductUpdatedEventSchema.omit({ id: true, ts: true }),
  ProductDeletedEventSchema.omit({ id: true, ts: true }),
]);
