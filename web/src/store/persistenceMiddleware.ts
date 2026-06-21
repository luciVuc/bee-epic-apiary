import { Middleware } from "@reduxjs/toolkit";
import type { RootState } from ".";

const CART_STORAGE_KEY = "beeEpicCart";

export const persistenceMiddleware: Middleware<object, RootState> =
  (store) => (next) => (action) => {
    const result = next(action);
    if (
      typeof action === "object" &&
      action !== null &&
      "type" in action &&
      typeof (action as { type: string }).type === "string"
    ) {
      const type = (action as { type: string }).type;
      if (type.startsWith("cart/")) {
        const state = store.getState().cart;
        localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(state.items));
      }
    }
    return result;
  };
