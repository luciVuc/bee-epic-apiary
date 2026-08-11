import { createSlice, PayloadAction } from "@reduxjs/toolkit";
import { z } from "zod";
import type { ICartItem, IProduct } from "../types";

// Stored carts must round-trip enough of IProduct that the checkout flow and UI
// can render without a network refetch. We validate the minimum here; extra
// fields are preserved via passthrough() since IProduct evolves.
const CartItemSchema = z.object({
  product: z
    .object({
      id: z.string(),
      slug: z.string(),
      name: z.string(),
      stripePriceId: z.string().optional(),
    })
    .passthrough(),
  quantity: z.number().int().positive(),
});
const CartItemsSchema = z.array(CartItemSchema);

/**
 * Load and validate the persisted cart from localStorage on slice init.
 * Returns an empty cart (and clears the key) when the stored value is missing,
 * unparseable, or fails the schema — so a stale/corrupt shape can't crash the
 * reducer or checkout pipeline downstream.
 */
const loadCartFromStorage = (): ICartItem[] => {
  try {
    const stored = localStorage.getItem("beeEpicCart");
    if (!stored) return [];
    const parsed = JSON.parse(stored) as unknown;
    const result = CartItemsSchema.safeParse(parsed);
    if (!result.success) {
      // Stale or corrupt cart shape — drop it instead of crashing later in the
      // reducer or checkout pipeline.
      localStorage.removeItem("beeEpicCart");
      return [];
    }
    return result.data as ICartItem[];
  } catch {
    return [];
  }
};

interface ICartState {
  items: ICartItem[];
}

const initialState: ICartState = {
  items: loadCartFromStorage(),
};

/**
 * Shopping cart slice. Reducers:
 * - `addToCart` — add a product or increment its quantity if already present (no-op for quantity <= 0)
 * - `removeFromCart` — remove a line item by product id
 * - `updateQuantity` — set an item's quantity, removing it when quantity <= 0
 * - `clearCart` — empty the cart (e.g. after successful checkout)
 * Persistence to localStorage is handled by persistenceMiddleware, not here.
 */
const cartSlice = createSlice({
  name: "cart",
  initialState,
  reducers: {
    addToCart: (
      state,
      action: PayloadAction<{ product: IProduct; quantity: number }>,
    ) => {
      const { product, quantity } = action.payload;
      if (quantity <= 0) return;
      const existingItem = state.items.find(
        (item) => item.product.id === product.id,
      );

      if (existingItem) {
        // Increment, not replace — repeat clicks on "Add to cart" should bump
        // the count. Use updateQuantity for explicit-set flows.
        existingItem.quantity += quantity;
      } else {
        state.items.push({ product, quantity });
      }
    },
    removeFromCart: (state, action: PayloadAction<string>) => {
      const productId = action.payload;
      state.items = state.items.filter((item) => item.product.id !== productId);
    },
    updateQuantity: (
      state,
      action: PayloadAction<{ id: string; quantity: number }>,
    ) => {
      const { id, quantity } = action.payload;
      const item = state.items.find((item) => item.product.id === id);

      if (item) {
        if (quantity <= 0) {
          state.items = state.items.filter((i) => i.product.id !== id);
        } else {
          item.quantity = quantity;
        }
      }
    },
    clearCart: (state) => {
      state.items = [];
    },
  },
});

/** Cart action creators: addToCart, removeFromCart, updateQuantity, clearCart. */
export const { addToCart, removeFromCart, updateQuantity, clearCart } =
  cartSlice.actions;
export default cartSlice.reducer;
