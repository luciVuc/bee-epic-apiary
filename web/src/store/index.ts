import { configureStore } from "@reduxjs/toolkit";
import cartReducer from "./cartSlice";
import uiReducer from "./uiSlice";
import { persistenceMiddleware } from "./persistenceMiddleware";

const rootReducer = { cart: cartReducer, ui: uiReducer };

/** Root state shape (cart + ui), inferred from the reducers. */
export type RootState = {
  cart: ReturnType<typeof cartReducer>;
  ui: ReturnType<typeof uiReducer>;
};

/** Redux store: cart + ui reducers with cart-persistence middleware appended. */
export const store = configureStore({
  reducer: rootReducer,
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware().concat(persistenceMiddleware),
});

/** Typed dispatch for use with the store's thunks/actions. */
export type AppDispatch = typeof store.dispatch;
