import { describe, it, expect } from "vitest";
import { NotificationEventInputSchema } from "../notifications";

/**
 * Runtime input validator for `NotificationHub.notify` (review Important #4).
 *
 * The hub stamps `id` and `ts` itself, so the input schema MUST reject
 * payloads that include those fields, and MUST accept the minimal shape per
 * event type.
 */

describe("NotificationEventInputSchema", () => {
  it("accepts a new-order input", () => {
    const r = NotificationEventInputSchema.parse({
      type: "new-order",
      orderId: "o_1",
    });
    expect(r.type).toBe("new-order");
  });

  it("accepts an order-status-changed input", () => {
    const r = NotificationEventInputSchema.parse({
      type: "order-status-changed",
      orderId: "o_1",
      prevStatus: "PENDING",
      nextStatus: "FULFILLED",
    });
    expect(r.type).toBe("order-status-changed");
  });

  it("accepts a product-updated input", () => {
    const r = NotificationEventInputSchema.parse({
      type: "product-updated",
      productId: "p_1",
    });
    expect(r.type).toBe("product-updated");
  });

  it("accepts a product-deleted input", () => {
    const r = NotificationEventInputSchema.parse({
      type: "product-deleted",
      productId: "p_1",
    });
    expect(r.type).toBe("product-deleted");
  });

  it("accepts prevStatus = null on order-status-changed", () => {
    const r = NotificationEventInputSchema.parse({
      type: "order-status-changed",
      orderId: "o_1",
      prevStatus: null,
      nextStatus: "PENDING",
    });
    expect(r.type).toBe("order-status-changed");
  });

  it("rejects an unknown event type", () => {
    expect(() =>
      NotificationEventInputSchema.parse({
        type: "totally-made-up",
        orderId: "o_1",
      }),
    ).toThrow();
  });

  it("rejects new-order missing orderId", () => {
    expect(() =>
      NotificationEventInputSchema.parse({ type: "new-order" }),
    ).toThrow();
  });

  it("rejects new-order with the wrong orderId type", () => {
    expect(() =>
      NotificationEventInputSchema.parse({ type: "new-order", orderId: 42 }),
    ).toThrow();
  });
});
