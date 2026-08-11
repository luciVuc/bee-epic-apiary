import { describe, it, expect, beforeEach, vi } from "vitest";
import cartReducer, { addToCart, updateQuantity } from "../cartSlice";
import type { IProduct } from "../../types";

const product = (id: string): IProduct =>
  ({
    id,
    slug: id,
    name: `P-${id}`,
    description: "",
    price: 1000,
    currency: "usd",
    images: [],
    category: "HONEY" as never,
    tags: [],
    inStock: true,
    featured: false,
    stripeProductId: id,
    stripePriceId: `price_${id}`,
  }) as unknown as IProduct;

describe("cartSlice load-from-storage shape validation", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("falls back to [] when storage holds non-array JSON", async () => {
    vi.resetModules();
    localStorage.setItem("beeEpicCart", JSON.stringify({ items: "nope" }));
    const mod = await import("../cartSlice");
    const state = mod.default(undefined, { type: "@@INIT" });
    expect(state.items).toEqual([]);
  });

  it("falls back to [] when stored items miss required fields", async () => {
    vi.resetModules();
    localStorage.setItem("beeEpicCart", JSON.stringify([{ quantity: 1 }]));
    const mod = await import("../cartSlice");
    const state = mod.default(undefined, { type: "@@INIT" });
    expect(state.items).toEqual([]);
  });

  it("falls back to [] on invalid JSON", async () => {
    vi.resetModules();
    localStorage.setItem("beeEpicCart", "not-json");
    const mod = await import("../cartSlice");
    const state = mod.default(undefined, { type: "@@INIT" });
    expect(state.items).toEqual([]);
  });

  it("accepts a well-formed stored cart", async () => {
    vi.resetModules();
    localStorage.setItem(
      "beeEpicCart",
      JSON.stringify([{ product: product("a"), quantity: 2 }]),
    );
    const mod = await import("../cartSlice");
    const state = mod.default(undefined, { type: "@@INIT" });
    expect(state.items).toHaveLength(1);
    expect(state.items[0]?.quantity).toBe(2);
  });
});

describe("cartSlice addToCart semantics", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("increments quantity for existing item instead of replacing", () => {
    const initial = cartReducer(undefined, { type: "@@INIT" });
    const after1 = cartReducer(
      initial,
      addToCart({ product: product("a"), quantity: 2 }),
    );
    const after2 = cartReducer(
      after1,
      addToCart({ product: product("a"), quantity: 3 }),
    );
    expect(after2.items).toHaveLength(1);
    expect(after2.items[0]?.quantity).toBe(5);
  });

  it("adds new item with given quantity when not in cart", () => {
    const initial = cartReducer(undefined, { type: "@@INIT" });
    const after = cartReducer(
      initial,
      addToCart({ product: product("a"), quantity: 4 }),
    );
    expect(after.items[0]?.quantity).toBe(4);
  });

  it("ignores non-positive quantities", () => {
    const initial = cartReducer(undefined, { type: "@@INIT" });
    const afterZero = cartReducer(
      initial,
      addToCart({ product: product("a"), quantity: 0 }),
    );
    expect(afterZero.items).toHaveLength(0);
    const afterNeg = cartReducer(
      initial,
      addToCart({ product: product("a"), quantity: -3 }),
    );
    expect(afterNeg.items).toHaveLength(0);
  });

  it("updateQuantity sets explicit value (used for explicit-set flows)", () => {
    const initial = cartReducer(undefined, { type: "@@INIT" });
    const after1 = cartReducer(
      initial,
      addToCart({ product: product("a"), quantity: 2 }),
    );
    const after2 = cartReducer(
      after1,
      updateQuantity({ id: "a", quantity: 7 }),
    );
    expect(after2.items[0]?.quantity).toBe(7);
  });
});
