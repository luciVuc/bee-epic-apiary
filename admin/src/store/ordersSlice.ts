/** Redux slice for orders state management (list + detail + update) */
import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import type { IOrder, IOrderLineItem, IOrderUpdate } from "../types";
import * as api from "../utils/api";
import { apiErrorMessage } from "../utils/api";

/**
 * Filter keys that describe WHAT to fetch — these are the bits worth
 * persisting in `lastFetchParams` for count refreshes and same-filter
 * refetches. `limit` and `starting_after` are HOW (pagination) and must NOT
 * round-trip into a follow-up count call.
 */
const ORDER_FILTER_KEYS = [
  "search",
  "status",
  "payment_status",
  "order_status",
] as const;

function pickFilterParams(
  params: Record<string, unknown> | null | undefined,
): Record<string, string | undefined> {
  if (!params) return {};
  return Object.fromEntries(
    ORDER_FILTER_KEYS.filter((k) => k in params).map((k) => [
      k,
      params[k] as string | undefined,
    ]),
  );
}

export interface IOrdersState {
  items: IOrder[];
  loading: boolean;
  error: string | null;
  selectedOrder: IOrder | null;
  selectedOrderLineItems: IOrderLineItem[];
  hasMore: boolean;
  lastId: string | null;
  totalCount: number;
  lastFetchParams: Record<string, string | undefined> | null;
}

const initialState: IOrdersState = {
  items: [],
  loading: false,
  error: null,
  selectedOrder: null,
  selectedOrderLineItems: [],
  hasMore: false,
  lastId: null,
  totalCount: 0,
  lastFetchParams: null,
};

export const fetchOrders = createAsyncThunk(
  "orders/fetchAll",
  async (
    params:
      | {
          limit?: number;
          starting_after?: string;
          search?: string;
          status?: string;
          payment_status?: string;
          order_status?: string;
        }
      | undefined,
    { signal },
  ) => {
    // Thread the thunk's AbortSignal through axios so a follow-up
    // dispatch().abort() cancels the in-flight request (review I13).
    const result = await api.api.getOrders({ ...(params ?? {}), signal });
    return {
      ...result,
      params: (params as Record<string, string | undefined>) || null,
    };
  },
);

export const fetchOrderById = createAsyncThunk(
  "orders/fetchById",
  async (id: string) => {
    const result = await api.api.getOrderById(id);
    return result;
  },
);

export const updateOrder = createAsyncThunk(
  "orders/update",
  async (payload: IOrderUpdate, { rejectWithValue }) => {
    try {
      const { id, ...data } = payload;
      const updatedOrder = await api.api.updateOrder(id, data);
      return updatedOrder;
    } catch (err: unknown) {
      return rejectWithValue(apiErrorMessage(err, "Failed to update order"));
    }
  },
);

const ordersSlice = createSlice({
  name: "orders",
  initialState,
  reducers: {
    setSelectedOrder: (state, action) => {
      state.selectedOrder = action.payload;
      if (!action.payload) state.selectedOrderLineItems = [];
    },
    clearOrdersError: (state) => {
      state.error = null;
    },
    clearOrders: (state) => {
      state.items = [];
      state.hasMore = false;
      state.lastId = null;
      state.totalCount = 0;
      state.lastFetchParams = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchOrders.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchOrders.fulfilled, (state, action) => {
        state.loading = false;
        const isLoadMore = !!action.meta.arg?.starting_after;
        if (isLoadMore) {
          const existingIds = new Set(
            state.items.map((o: { id: string }) => o.id),
          );
          const newOrders = action.payload.orders.filter(
            (o: { id: string }) => !existingIds.has(o.id),
          );
          state.items = [...state.items, ...newOrders];
        } else {
          state.items = action.payload.orders;
        }
        state.hasMore = action.payload.hasMore;
        state.lastId = action.payload.lastId ?? null;
        state.totalCount = action.payload.totalCount;
        state.lastFetchParams = pickFilterParams(action.payload.params);
      })
      .addCase(fetchOrders.rejected, (state, action) => {
        // Aborted fetches are superseded by a fresh one — leave state.error
        // alone so a stale "Failed to fetch" banner doesn't appear from a
        // request that the user already discarded (review I13).
        if (action.meta.aborted) {
          state.loading = false;
          return;
        }
        state.loading = false;
        state.error = action.error.message || "Failed to fetch orders";
      })
      .addCase(fetchOrderById.pending, (state) => {
        state.loading = true;
      })
      .addCase(fetchOrderById.fulfilled, (state, action) => {
        state.loading = false;
        state.selectedOrder = action.payload.order;
        state.selectedOrderLineItems = action.payload.lineItems;
      })
      .addCase(fetchOrderById.rejected, (state, action) => {
        state.loading = false;
        state.error = action.error.message || "Failed to load order";
        state.selectedOrder = null;
        state.selectedOrderLineItems = [];
      })
      .addCase(updateOrder.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(updateOrder.fulfilled, (state, action) => {
        state.loading = false;
        state.selectedOrder = action.payload;
        const index = state.items.findIndex((o) => o.id === action.payload.id);
        if (index !== -1) state.items[index] = action.payload;
      })
      .addCase(updateOrder.rejected, (state, action) => {
        state.loading = false;
        state.error = (action.payload as string) || "Failed to update order";
      });
  },
});

export const { setSelectedOrder, clearOrdersError, clearOrders } =
  ordersSlice.actions;
export default ordersSlice.reducer;
