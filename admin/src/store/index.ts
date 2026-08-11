/** Redux store configuration for the admin panel */
import { configureStore } from "@reduxjs/toolkit";
import productsReducer from "./productsSlice";
import ordersReducer from "./ordersSlice";
import authReducer from "./authSlice";
import { bindStore } from "../utils/api";

export const store = configureStore({
  reducer: {
    products: productsReducer,
    orders: ordersReducer,
    auth: authReducer,
  },
});

/**
 * Wire the store into the api-client module so the 401 refresh interceptor
 * (Task 10.9) can dispatch `refresh()` / `resetAuth()` and read
 * `state.auth.refreshInFlight` without creating a static circular import.
 */
bindStore(store);

/** Root state type for useSelector hooks */
export type RootState = ReturnType<typeof store.getState>;
/** Typed dispatch for useDispatch hooks */
export type AppDispatch = typeof store.dispatch;
