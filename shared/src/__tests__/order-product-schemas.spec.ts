import { describe, it, expect } from "vitest";
import {
  OrderUpdateSchema,
  OrderUpdateRequestSchema,
  EOrderFulfillmentStatus,
} from "../order";
import { ProductUpdateRequestSchema } from "../product";

describe("OrderUpdateSchema (client-facing)", () => {
  it("accepts a valid order_status in metadata", () => {
    const r = OrderUpdateSchema.safeParse({
      id: "cs_1",
      metadata: { order_status: EOrderFulfillmentStatus.FULFILLED },
    });
    expect(r.success).toBe(true);
  });

  it("rejects an unknown order_status client-side (mirrors the server)", () => {
    const r = OrderUpdateSchema.safeParse({
      id: "cs_1",
      metadata: { order_status: "shipped_to_moon" },
    });
    expect(r.success).toBe(false);
  });

  it("allows metadata without order_status", () => {
    const r = OrderUpdateSchema.safeParse({
      id: "cs_1",
      metadata: { customer_name: "Ada" },
    });
    expect(r.success).toBe(true);
  });
});

describe("OrderUpdateRequestSchema (server) parity", () => {
  it("rejects an unknown order_status", () => {
    const r = OrderUpdateRequestSchema.safeParse({
      metadata: { order_status: "bogus" },
    });
    expect(r.success).toBe(false);
  });

  it("accepts each valid fulfillment status", () => {
    for (const status of Object.values(EOrderFulfillmentStatus)) {
      expect(
        OrderUpdateRequestSchema.safeParse({
          metadata: { order_status: status },
        }).success,
      ).toBe(true);
    }
  });
});

describe("ProductUpdateRequestSchema default_price", () => {
  it("accepts a well-formed Stripe price id", () => {
    expect(
      ProductUpdateRequestSchema.safeParse({ default_price: "price_1AbC2dEf" })
        .success,
    ).toBe(true);
  });

  it("rejects a bare prefix with no id body", () => {
    expect(
      ProductUpdateRequestSchema.safeParse({ default_price: "price_" }).success,
    ).toBe(false);
  });

  it("rejects an id with an embedded newline (unanchored-regex bypass)", () => {
    expect(
      ProductUpdateRequestSchema.safeParse({
        default_price: "price_\nmalicious",
      }).success,
    ).toBe(false);
  });
});
