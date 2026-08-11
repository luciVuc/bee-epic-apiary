import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useStripeCheckout } from "../useStripeCheckout";
import type { ICartItem } from "../../types";

const mockItem: ICartItem = {
  product: {
    id: "prod_1",
    slug: "honey",
    name: "Honey",
    description: "",
    price: 1000,
    currency: "usd",
    images: [],
    category: "HONEY",
    tags: [],
    inStock: true,
    featured: false,
    stripeProductId: "prod_1",
    stripePriceId: "price_test_1",
  } as unknown as ICartItem["product"],
  quantity: 1,
};

describe("useStripeCheckout", () => {
  const originalLocation = window.location;
  const hrefSetter = vi.fn();

  beforeEach(() => {
    // @ts-expect-error override read-only location for the test
    delete window.location;
    // @ts-expect-error replace with a stub that records `href` writes
    window.location = {
      origin: "https://shop.test",
      get href() {
        return "";
      },
      set href(v: string) {
        hrefSetter(v);
      },
    };
    hrefSetter.mockClear();
  });

  afterEach(() => {
    // @ts-expect-error restore
    window.location = originalLocation;
    vi.restoreAllMocks();
  });

  it("redirects to sessions[0] when worker returns { ok: true, data: { sessions } }", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          ok: true,
          data: {
            sessions: ["https://stripe/cs_1"],
            message: "Single checkout session created",
          },
        }),
      }),
    );

    const { result } = renderHook(() => useStripeCheckout());
    await act(async () => {
      await result.current.checkout([mockItem]);
    });

    expect(hrefSetter).toHaveBeenCalledWith("https://stripe/cs_1");
    expect(result.current.error).toBeNull();
  });

  it("surfaces envelope error on { ok: false }", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        json: async () => ({
          ok: false,
          error: {
            code: "VALIDATION_FAILED",
            fields: { line_items: "bad input" },
          },
        }),
      }),
    );

    const { result } = renderHook(() => useStripeCheckout());
    await act(async () => {
      await result.current.checkout([mockItem]);
    });

    expect(hrefSetter).not.toHaveBeenCalled();
    expect(result.current.error).toMatch(
      /bad input|VALIDATION_FAILED|Payment failed/,
    );
    expect(result.current.isProcessing).toBe(false);
  });

  it("blocks empty cart with friendly error", async () => {
    const { result } = renderHook(() => useStripeCheckout());
    await act(async () => {
      await result.current.checkout([]);
    });
    expect(result.current.error).toBe("Your cart is empty");
  });

  it("rejects multi-session responses (mixed cart) with a clear error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          ok: true,
          data: {
            sessions: ["https://stripe/cs_a", "https://stripe/cs_b"],
            message: "Multiple checkout sessions created",
          },
        }),
      }),
    );
    const { result } = renderHook(() => useStripeCheckout());
    await act(async () => {
      await result.current.checkout([mockItem]);
    });
    expect(hrefSetter).not.toHaveBeenCalled();
    expect(result.current.error).toMatch(/separately|mixed/i);
  });
});
