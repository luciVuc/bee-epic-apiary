import { configureStore } from "@reduxjs/toolkit";
import cartReducer from "./cartSlice";
import uiReducer from "./uiSlice";
import { persistenceMiddleware } from "./persistenceMiddleware";

const rootReducer = { cart: cartReducer, ui: uiReducer };

export type RootState = {
  cart: ReturnType<typeof cartReducer>;
  ui: ReturnType<typeof uiReducer>;
};

export const store = configureStore({
  reducer: rootReducer,
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware().concat(persistenceMiddleware),
});

export type AppDispatch = typeof store.dispatch;
