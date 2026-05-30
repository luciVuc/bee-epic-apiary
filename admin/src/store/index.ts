/** Redux store configuration for the admin panel */
import { configureStore } from "@reduxjs/toolkit";
import productsReducer from "./productsSlice";
import ordersReducer from "./ordersSlice";

export const store = configureStore({
  reducer: {
    products: productsReducer,
    orders: ordersReducer,
  },
});

/** Root state type for useSelector hooks */
export type RootState = ReturnType<typeof store.getState>;
/** Typed dispatch for useDispatch hooks */
export type AppDispatch = typeof store.dispatch;
