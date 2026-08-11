import { z } from "zod";

/**
 * Order types — the shape the admin consumes for Stripe Checkout Sessions
 * after the services worker's transform layer normalizes them.
 *
 * Today only `admin/` uses these directly. Web reads order-confirmation
 * messages from KV (ISiteContent) rather than fetching the full order.
 * Hoisting these to shared/ anyway so a future mobile or fulfillment client
 * can consume the same shape.
 */

/**
 * Postal address attached to an order's shipping_details. All fields are
 * nullable because Stripe Checkout can capture partial addresses (e.g.
 * digital orders may have country only).
 */
export const ShippingAddressSchema = z.object({
  line1: z.string().nullable(),
  line2: z.string().nullable(),
  city: z.string().nullable(),
  state: z.string().nullable(),
  postalCode: z.string().nullable(),
  country: z.string().nullable(),
});

export type IShippingAddress = z.infer<typeof ShippingAddressSchema>;

/**
 * Fulfillment states stamped onto an order's Stripe metadata.order_status.
 *
 * Closed enum so `PUT /orders/:id` can refuse arbitrary strings — without this
 * the admin (or anyone with a valid bearer token) could write any value into
 * the field, and downstream filters / counts would treat unknown values as
 * if they were real states (review I15).
 */
export enum EOrderFulfillmentStatus {
  NEW = "new",
  PENDING = "pending",
  FULFILLED = "fulfilled",
}

export const OrderFulfillmentStatusSchema = z.nativeEnum(
  EOrderFulfillmentStatus,
);

export const OrderSchema = z.object({
  id: z.string(),
  created: z.number(),
  customerEmail: z.string().nullable(),
  customerName: z.string().nullable(),
  customerPhone: z.string().nullable(),
  amountTotal: z.number(),
  amountSubtotal: z.number(),
  currency: z.string(),
  status: z.enum(["open", "complete", "expired"]),
  paymentStatus: z.enum(["paid", "unpaid", "no_payment_required"]),
  mode: z.enum(["payment", "setup", "subscription"]),
  metadata: z.record(z.string(), z.string()),
  url: z.string().nullable(),
  orderStatus: z.string().nullable(),
  description: z.string().nullable(),
  shippingAddress: ShippingAddressSchema.nullable(),
});

export type IOrder = z.infer<typeof OrderSchema>;

/**
 * Body accepted by `PUT /orders/:id` (path id excluded). Strict — unknown
 * fields are rejected so a future Stripe API addition can't be smuggled
 * through this endpoint without a deliberate code change (review I14).
 *
 * `metadata.order_status`, when present, must be one of `EOrderFulfillmentStatus`
 * — admin filters/counts treat unknown values as real states, so freeform
 * writes corrupt the dashboard (review I15).
 */
export const OrderUpdateRequestSchema = z
  .object({
    metadata: z
      .record(z.string(), z.string())
      .refine(
        (m) =>
          m.order_status === undefined ||
          OrderFulfillmentStatusSchema.safeParse(m.order_status).success,
        {
          message: `metadata.order_status must be one of: ${Object.values(EOrderFulfillmentStatus).join(", ")}`,
          path: ["order_status"],
        },
      )
      .optional(),
    collected_information: z
      .object({
        shipping_details: z
          .object({
            name: z.string().optional(),
            address: z
              .object({
                line1: z.string().optional(),
                line2: z.string().optional(),
                city: z.string().optional(),
                state: z.string().optional(),
                postal_code: z.string().optional(),
                country: z.string().optional(),
              })
              .strict()
              .optional(),
          })
          .strict()
          .optional(),
      })
      .strict()
      .optional(),
  })
  .strict();

export type IOrderUpdateRequest = z.infer<typeof OrderUpdateRequestSchema>;

/**
 * Payload accepted by `PUT /orders/:id`. Matches Stripe's `Checkout.Session.update`
 * params subset that the worker exposes. `id` is the path param; the rest is body.
 *
 * Field-name convention (review M10): the snake_case fields here
 * (\`collected_information\`, \`shipping_details\`, \`postal_code\`) are
 * INTENTIONAL — they pass through to Stripe's API as-is, which uses
 * snake_case for all params. Camel-casing them would either fail at the
 * Stripe edge (param name mismatch) or require a transform layer in the
 * worker for one endpoint. The rest of the codebase uses camelCase, but
 * this schema is the boundary where we conform to Stripe's wire format.
 */
export const OrderUpdateSchema = z.object({
  id: z.string(),
  metadata: z
    .record(z.string(), z.string())
    .refine(
      (m) =>
        m.order_status === undefined ||
        OrderFulfillmentStatusSchema.safeParse(m.order_status).success,
      {
        // Mirror the server's OrderUpdateRequestSchema refinement so an invalid
        // order_status is caught client-side (surfacing the UI mistake early)
        // instead of only failing at the worker edge.
        message: `metadata.order_status must be one of: ${Object.values(EOrderFulfillmentStatus).join(", ")}`,
        path: ["order_status"],
      },
    )
    .optional(),
  collected_information: z
    .object({
      shipping_details: z
        .object({
          name: z.string().optional(),
          address: z
            .object({
              line1: z.string().optional(),
              line2: z.string().optional(),
              city: z.string().optional(),
              state: z.string().optional(),
              postal_code: z.string().optional(),
              country: z.string().optional(),
            })
            .optional(),
        })
        .optional(),
    })
    .optional(),
});

export type IOrderUpdate = z.infer<typeof OrderUpdateSchema>;

/** A single line item on a Stripe Checkout Session, after the worker's transform. */
export const OrderLineItemSchema = z.object({
  id: z.string(),
  description: z.string(),
  amountTotal: z.number(),
  amountSubtotal: z.number(),
  currency: z.string(),
  quantity: z.number().nullable(),
  productId: z.string().nullable(),
  imageUrls: z.array(z.string()),
  price: z
    .object({
      id: z.string(),
      unitAmount: z.number().nullable(),
      currency: z.string(),
    })
    .nullable(),
});

export type IOrderLineItem = z.infer<typeof OrderLineItemSchema>;
