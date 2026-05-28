/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect } from "vitest";
import {
  transformStripeProduct,
  transformToStripeParams,
  transformToStripePriceParams,
  transformStripeProductsList,
} from "../transform";
import { EProductCategory } from "../../types";
import { DEFAULT_PRODUCT_IMAGE } from "../constants";
import type {
  IStripeProductResponse,
  IStripePriceResponse,
} from "../../types/stripe";

const mockPrice: IStripePriceResponse = {
  id: "price_123",
  product: "prod_123",
  unit_amount: 2999,
  currency: "usd",
  recurring: null,
  lookup_key: null,
  type: "one_time",
};

const mockSubscriptionPrice: IStripePriceResponse = {
  id: "price_456",
  product: "prod_456",
  unit_amount: 1999,
  currency: "usd",
  recurring: { interval: "month", interval_count: 1 },
  lookup_key: null,
  type: "recurring",
};

function makeStripeProduct(
  overrides: Partial<IStripeProductResponse> = {},
): IStripeProductResponse {
  return {
    id: "prod_123",
    name: "Test Honey",
    description: "A delicious honey",
    images: ["https://example.com/image.png"],
    metadata: {
      slug: "test-honey",
      category: EProductCategory.HONEY,
      inStock: "true",
      featured: "false",
      weight: "16 oz",
      tags: "raw,organic",
      longDescription: "A very long description",
    },
    default_price: mockPrice,
    active: true,
    created: 1700000000,
    updated: 1700000000,
    ...overrides,
  };
}

describe("transformStripeProduct", () => {
  it("transforms a basic stripe product correctly", () => {
    const stripeProduct = makeStripeProduct();
    const result = transformStripeProduct(stripeProduct);

    expect(result.id).toBe("prod_123");
    expect(result.name).toBe("Test Honey");
    expect(result.slug).toBe("test-honey");
    expect(result.description).toBe("A delicious honey");
    expect(result.longDescription).toBe("A very long description");
    expect(result.price).toBe(2999);
    expect(result.stripePriceId).toBe("price_123");
    expect(result.category).toBe(EProductCategory.HONEY);
    expect(result.imageUrls).toEqual(["https://example.com/image.png"]);
    expect(result.thumbnailUrls).toEqual(["https://example.com/image.png"]);
    expect(result.inStock).toBe(true);
    expect(result.featured).toBe(false);
    expect(result.weight).toBe("16 oz");
    expect(result.tags).toEqual(["raw", "organic"]);
    expect(result.recurringInterval).toBeUndefined();
    expect(result.recurringIntervalCount).toBeUndefined();
  });

  it("handles null description", () => {
    const stripeProduct = makeStripeProduct({ description: null });
    const result = transformStripeProduct(stripeProduct);
    expect(result.description).toBe("");
  });

  it("handles empty images array", () => {
    const stripeProduct = makeStripeProduct({ images: [] });
    const result = transformStripeProduct(stripeProduct);
    expect(result.imageUrls[0]).toContain("data:image/svg+xml");
    expect(result.thumbnailUrls[0]).toContain("data:image/svg+xml");
  });

  it("handles string default_price", () => {
    const stripeProduct = makeStripeProduct({ default_price: "price_str" });
    const result = transformStripeProduct(stripeProduct);
    expect(result.stripePriceId).toBe("price_str");
    expect(result.price).toBe(0);
  });

  it("handles null default_price", () => {
    const stripeProduct = makeStripeProduct({ default_price: null });
    const result = transformStripeProduct(stripeProduct);
    expect(result.stripePriceId).toBeUndefined();
    expect(result.price).toBe(0);
  });

  it("extracts recurring info from subscription price", () => {
    const stripeProduct = makeStripeProduct({
      default_price: mockSubscriptionPrice,
      metadata: { category: EProductCategory.SUBSCRIPTIONS },
    });
    const result = transformStripeProduct(stripeProduct);
    expect(result.recurringInterval).toBe("month");
    expect(result.recurringIntervalCount).toBe(1);
  });

  it("parses inStock correctly when metadata says false", () => {
    const stripeProduct = makeStripeProduct({
      metadata: { ...makeStripeProduct().metadata, inStock: "false" },
    });
    const result = transformStripeProduct(stripeProduct);
    expect(result.inStock).toBe(false);
  });

  it("parses featured correctly when metadata says true", () => {
    const stripeProduct = makeStripeProduct({
      metadata: { ...makeStripeProduct().metadata, featured: "true" },
    });
    const result = transformStripeProduct(stripeProduct);
    expect(result.featured).toBe(true);
  });

  it("handles empty metadata", () => {
    const stripeProduct = makeStripeProduct({ metadata: {} });
    const result = transformStripeProduct(stripeProduct);
    expect(result.slug).toBe("prod_123");
    expect(result.category).toBe(EProductCategory.HONEY);
    expect(result.inStock).toBe(true);
    expect(result.featured).toBe(false);
    expect(result.weight).toBe("");
    expect(result.tags).toEqual([]);
  });

  it("handles missing tags in metadata", () => {
    const stripeProduct = makeStripeProduct({
      metadata: { slug: "test", tags: "" },
    });
    const result = transformStripeProduct(stripeProduct);
    expect(result.tags).toEqual([]);
  });

  it("handles stripePaymentLinkId in metadata", () => {
    const stripeProduct = makeStripeProduct({
      metadata: {
        ...makeStripeProduct().metadata,
        stripePaymentLinkId: "plink_abc",
      },
    });
    const result = transformStripeProduct(stripeProduct);
    expect(result.stripePaymentLinkId).toBe("plink_abc");
  });
});

describe("transformToStripeParams", () => {
  it("transforms product input to stripe params", () => {
    const result = transformToStripeParams({
      name: "Test Honey",
      description: "Delicious",
      slug: "test-honey",
      category: EProductCategory.HONEY,
      price: 2999,
      inStock: true,
      featured: false,
      imageUrls: ["https://example.com/img.png"],
      thumbnailUrls: ["https://example.com/thumb.png"],
      tags: ["raw", "organic"],
      weight: "16 oz",
    });

    expect(result.name).toBe("Test Honey");
    expect(result.description).toBe("Delicious");
    expect(result.images).toEqual(["https://example.com/img.png"]);
    expect(result.metadata).toEqual({
      slug: "test-honey",
      longDescription: "",
      category: EProductCategory.HONEY,
      inStock: "true",
      featured: "false",
      weight: "16 oz",
      tags: "raw,organic",
      stripePaymentLinkId: "",
    });
  });

  it("removes default images from images array", () => {
    const result = transformToStripeParams({
      imageUrls: [DEFAULT_PRODUCT_IMAGE],
    } as any);
    expect(result.images).toEqual([]);
  });

  it("sets images to empty array when no images provided", () => {
    const result = transformToStripeParams({} as any);
    expect(result.images).toEqual([]);
  });

  it("strips empty description", () => {
    const result = transformToStripeParams({
      description: "",
      name: "Test",
    } as any);
    expect(result.description).toBeUndefined();
  });

  it("handles stripePaymentLinkId", () => {
    const result = transformToStripeParams({
      stripePaymentLinkId: "plink_abc",
      tags: [],
    } as any);
    expect((result.metadata as any).stripePaymentLinkId).toBe("plink_abc");
  });

  it("sets defaults for missing values", () => {
    const result = transformToStripeParams({} as any);
    expect((result.metadata as any).slug).toBe("");
    expect((result.metadata as any).category).toBe(EProductCategory.HONEY);
    expect((result.metadata as any).inStock).toBe("true");
    expect((result.metadata as any).featured).toBe("false");
    expect((result.metadata as any).weight).toBe("");
    expect((result.metadata as any).tags).toBe("");
  });

  it("filters out empty images from metadata", () => {
    const result = transformToStripeParams({
      imageUrls: [],
      tags: ["raw"],
    } as any);
    expect(result.images).toEqual([]);
    expect((result.metadata as any).tags).toBe("raw");
  });
});

describe("transformToStripePriceParams", () => {
  it("creates basic price params", () => {
    const result = transformToStripePriceParams("prod_123", 2999);
    expect(result.product).toBe("prod_123");
    expect(result.unit_amount).toBe(2999);
    expect(result.currency).toBe("usd");
    expect(result.lookup_key).toBeUndefined();
    expect(result.recurring).toBeUndefined();
  });

  it("includes recurring when interval is provided", () => {
    const result = transformToStripePriceParams(
      "prod_123",
      1999,
      "usd",
      undefined,
      "month",
      1,
    );
    expect(result.recurring).toEqual({
      interval: "month",
      interval_count: 1,
    });
  });

  it("defaults interval_count to 1", () => {
    const result = transformToStripePriceParams(
      "prod_123",
      1999,
      "usd",
      undefined,
      "month",
    );
    expect(result.recurring).toEqual({
      interval: "month",
      interval_count: 1,
    });
  });

  it("includes lookup_key when provided", () => {
    const result = transformToStripePriceParams(
      "prod_123",
      2999,
      "usd",
      "price_test-honey",
    );
    expect(result.lookup_key).toBe("price_test-honey");
  });

  it("uses custom currency", () => {
    const result = transformToStripePriceParams("prod_123", 100, "eur");
    expect(result.currency).toBe("eur");
  });
});

describe("transformStripeProductsList", () => {
  it("transforms a list of stripe products", () => {
    const response = {
      data: [makeStripeProduct(), makeStripeProduct({ id: "prod_456" })],
    };
    const result = transformStripeProductsList(response);
    expect(result).toHaveLength(2);
    expect(result[0].id).toBe("prod_123");
    expect(result[1].id).toBe("prod_456");
  });

  it("returns empty array when response is null", () => {
    expect(transformStripeProductsList(null)).toEqual([]);
  });

  it("returns empty array when data is missing", () => {
    expect(transformStripeProductsList({})).toEqual([]);
  });

  it("returns empty array when data is not an array", () => {
    expect(transformStripeProductsList({ data: "not-array" } as any)).toEqual(
      [],
    );
  });

  it("returns empty array when data is empty", () => {
    expect(transformStripeProductsList({ data: [] })).toEqual([]);
  });
});
