import { describe, it, expect, vi } from "vitest";
import {
  transformStripeProduct,
  transformStripeProductsList,
} from "../transform";
import { EProductCategory } from "../../types";
import type { IStripeProductResponse } from "@bee-epic/shared";

/**
 * Web-side transform tests (review #11). Mirrors the admin's test surface
 * for the same module — the storefront's transform doesn't have to handle
 * every metadata variation, but it MUST handle the three things that flow
 * straight into the dashboard tile:
 *
 *   1. unexpanded default_price (Stripe sometimes returns the price id as a
 *      string, not the embedded object). Pre-Task-55 the price collapsed to
 *      0, which the storefront then rendered as "$0.00" — Task 55 changes
 *      the contract to drop those products from the list.
 *   2. valid expanded price → unit_amount is read.
 *   3. category enum validation (Task 55 admin-side mirror).
 */

function makeStripeProduct(
  overrides: Partial<IStripeProductResponse> = {},
): IStripeProductResponse {
  return {
    id: "prod_1",
    name: "x",
    description: "",
    default_price: { id: "price_1", unit_amount: 1500, currency: "usd" },
    images: [],
    active: true,
    metadata: { category: EProductCategory.HONEY },
    ...overrides,
  } as unknown as IStripeProductResponse;
}

describe("transformStripeProduct", () => {
  it("returns null when default_price is unexpanded (string) — review #14", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const stripe = makeStripeProduct({
      default_price:
        "price_1" as unknown as IStripeProductResponse["default_price"],
    });
    const p = transformStripeProduct(stripe);
    expect(p).toBeNull();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("returns null when default_price is missing — review #14", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const stripe = makeStripeProduct({
      default_price: null as unknown as IStripeProductResponse["default_price"],
    });
    const p = transformStripeProduct(stripe);
    expect(p).toBeNull();
    warn.mockRestore();
  });

  it("uses default_price.unit_amount when expanded", () => {
    const p = transformStripeProduct(makeStripeProduct());
    expect(p?.price).toBe(1500);
  });

  it("falls back to HONEY for unknown category", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const stripe = makeStripeProduct({
      metadata: { category: "WHATEVER" } as Record<string, string>,
    });
    const p = transformStripeProduct(stripe);
    expect(p?.category).toBe(EProductCategory.HONEY);
    warn.mockRestore();
  });
});

describe("transformStripeProductsList", () => {
  it("returns [] for null", () => {
    expect(transformStripeProductsList(null)).toEqual([]);
  });

  it("returns [] for missing data", () => {
    expect(transformStripeProductsList({})).toEqual([]);
  });

  it("returns [] for non-array data", () => {
    expect(
      transformStripeProductsList({
        data: "not-array",
      } as unknown as { data?: IStripeProductResponse[] }),
    ).toEqual([]);
  });

  it("maps each product through transformStripeProduct", () => {
    const list = transformStripeProductsList({
      data: [makeStripeProduct(), makeStripeProduct({ id: "prod_2" })],
    });
    expect(list).toHaveLength(2);
    expect(list[0]?.id).toBe("prod_1");
    expect(list[1]?.id).toBe("prod_2");
  });

  it("filters out null returns (products with unexpanded default_price)", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const list = transformStripeProductsList({
      data: [
        makeStripeProduct({ id: "good" }),
        makeStripeProduct({
          id: "bad",
          default_price:
            "price_x" as unknown as IStripeProductResponse["default_price"],
        }),
        makeStripeProduct({ id: "good2" }),
      ],
    });
    expect(list.map((p) => p.id)).toEqual(["good", "good2"]);
    warn.mockRestore();
  });
});
