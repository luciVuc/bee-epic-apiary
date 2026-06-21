import { configureStore } from "@reduxjs/toolkit";
import cartReducer from "./cartSlice";
import uiReducer from "./uiSlice";
import { persistenceMiddleware } from "./persistenceMiddleware";

export const store = configureStore({
  reducer: {
    cart: cartReducer,
    ui: uiReducer,
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware().concat(persistenceMiddleware),
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
