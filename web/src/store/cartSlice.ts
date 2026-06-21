import { createSlice, PayloadAction } from "@reduxjs/toolkit";
import type { ICartItem, IProduct } from "../types";

const loadCartFromStorage = (): ICartItem[] => {
  try {
    const stored = localStorage.getItem("beeEpicCart");
    return stored ? JSON.parse(stored) : [];
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

const cartSlice = createSlice({
  name: "cart",
  initialState,
  reducers: {
    addToCart: (
      state,
      action: PayloadAction<{ product: IProduct; quantity: number }>,
    ) => {
      const { product, quantity } = action.payload;
      const existingItem = state.items.find(
        (item) => item.product.id === product.id,
      );

      if (existingItem) {
        existingItem.quantity = quantity;
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

export const { addToCart, removeFromCart, updateQuantity, clearCart } =
  cartSlice.actions;
export default cartSlice.reducer;
