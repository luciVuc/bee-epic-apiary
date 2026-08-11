/** Redux slice for product state management (CRUD + pagination + search) */
import { createSlice, createAsyncThunk, PayloadAction } from "@reduxjs/toolkit";
import type { IProduct, IProductInput } from "../types";
import * as api from "../utils/api";
import { apiErrorMessage } from "../utils/api";

/** Parameters for fetching paginated/filtered product lists */
export interface IFetchParams {
  limit?: number;
  starting_after?: string;
  search?: string;
  category?: string;
}

/**
 * Filter keys that describe WHAT to fetch — these are the bits worth
 * persisting in `lastFetchParams` for count refreshes after CUD ops.
 * `limit` and `starting_after` are HOW (pagination) and must NOT round-trip
 * into the count call: that would refetch the count with a poisoned cursor.
 */
const PRODUCT_FILTER_KEYS = ["search", "category"] as const;

function pickFilterParams(
  params: IFetchParams | null | undefined,
): IFetchParams {
  if (!params) return {};
  const out: IFetchParams = {};
  for (const k of PRODUCT_FILTER_KEYS) {
    if (k in params && params[k] !== undefined) out[k] = params[k];
  }
  return out;
}

/** Full shape of the products slice state */
export interface IProductsState {
  items: IProduct[];
  loading: boolean;
  error: string | null;
  selectedProduct: IProduct | null;
  hasMore: boolean;
  lastId: string | null;
  totalCount: number;
  lastFetchParams: IFetchParams | null;
  scrollPosition: number;
}

const initialState: IProductsState = {
  items: [],
  loading: false,
  error: null,
  selectedProduct: null,
  hasMore: false,
  lastId: null,
  totalCount: 0,
  lastFetchParams: null,
  scrollPosition: 0,
};

/** Fetch paginated products with optional search/filter */
export const fetchProducts = createAsyncThunk(
  "products/fetchAll",
  async (params: IFetchParams | undefined, { signal }) => {
    // Thread the thunk's AbortSignal through to axios so a follow-up
    // dispatch().abort() cancels the in-flight request rather than letting
    // a stale response overwrite a fresh one (review I13).
    const result = await api.api.getProducts({ ...(params ?? {}), signal });
    return { ...result, params: params || null };
  },
);

/** Fetch total product count (with optional search/filter) */
export const fetchProductsCount = createAsyncThunk(
  "products/fetchCount",
  async (params?: { search?: string; category?: string }) => {
    const total = await api.api.getProductsCount(params);
    return total;
  },
);

/** Fetch a single product by Stripe ID */
export const fetchProductById = createAsyncThunk(
  "products/fetchById",
  async (id: string) => {
    const product = await api.api.getProductById(id);
    return product;
  },
);

/** Create a product (Stripe product + price) and refresh the count */
export const createProduct = createAsyncThunk(
  "products/create",
  async (product: IProductInput, { dispatch, getState, rejectWithValue }) => {
    try {
      const newProduct = await api.api.createProduct(product);
      const state = getState() as { products: IProductsState };
      const lastParams = state.products.lastFetchParams;
      dispatch(
        fetchProductsCount({
          search: lastParams?.search,
          category: lastParams?.category,
        }),
      );
      return newProduct;
    } catch (err: unknown) {
      return rejectWithValue(apiErrorMessage(err, "Failed to create product"));
    }
  },
);

/** Update an existing product (optionally creating a new Stripe Price) */
export const updateProduct = createAsyncThunk(
  "products/update",
  async (
    { id, product }: { id: string; product: Partial<IProductInput> },
    { dispatch, getState, rejectWithValue },
  ) => {
    try {
      const updatedProduct = await api.api.updateProduct(id, product);
      const state = getState() as { products: IProductsState };
      const lastParams = state.products.lastFetchParams;
      dispatch(
        fetchProductsCount({
          search: lastParams?.search,
          category: lastParams?.category,
        }),
      );
      return updatedProduct;
    } catch (err: unknown) {
      return rejectWithValue(apiErrorMessage(err, "Failed to update product"));
    }
  },
);

/** Delete a product (permanent on Stripe, or archived if it has history) and refresh the count */
export const deleteProduct = createAsyncThunk(
  "products/delete",
  async (id: string, { dispatch, getState }) => {
    await api.api.deleteProduct(id);
    const state = getState() as { products: IProductsState };
    const lastParams = state.products.lastFetchParams;
    dispatch(
      fetchProductsCount({
        search: lastParams?.search,
        category: lastParams?.category,
      }),
    );
    return id;
  },
);

/**
 * Remove all un-priced (unsellable) products, then refresh the current list
 * and count so the table reflects the cleanup. Returns the worker's summary.
 */
export const cleanupProducts = createAsyncThunk(
  "products/cleanup",
  async (_: void, { dispatch, getState, rejectWithValue }) => {
    try {
      const result = await api.api.cleanupProducts(false);
      const state = getState() as { products: IProductsState };
      const lastParams = state.products.lastFetchParams;
      // Re-fetch the visible page and the count so removed rows disappear.
      await dispatch(fetchProducts(lastParams ?? {}));
      dispatch(fetchProductsCount(lastParams ?? {}));
      return result;
    } catch (err: unknown) {
      return rejectWithValue(
        apiErrorMessage(err, "Failed to clean up products"),
      );
    }
  },
);

const productsSlice = createSlice({
  name: "products",
  initialState,
  reducers: {
    setSelectedProduct: (state, action: PayloadAction<IProduct | null>) => {
      state.selectedProduct = action.payload;
    },
    clearError: (state) => {
      state.error = null;
    },
    setScrollPosition: (state, action: PayloadAction<number>) => {
      state.scrollPosition = action.payload;
    },
    clearProducts: (state) => {
      state.items = [];
      state.hasMore = false;
      state.lastId = null;
      state.totalCount = 0;
      state.lastFetchParams = null;
    },
    restoreProducts: (
      state,
      action: PayloadAction<{
        items: IProduct[];
        hasMore: boolean;
        lastId: string | null;
        totalCount: number;
        lastFetchParams: IFetchParams | null;
      }>,
    ) => {
      state.items = action.payload.items;
      state.hasMore = action.payload.hasMore;
      state.lastId = action.payload.lastId;
      state.totalCount = action.payload.totalCount;
      state.lastFetchParams = action.payload.lastFetchParams;
      state.loading = false;
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchProducts.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchProducts.fulfilled, (state, action) => {
        state.loading = false;
        const isLoadMore = !!action.meta.arg?.starting_after;
        if (isLoadMore) {
          const existingIds = new Set(state.items.map((p) => p.id));
          const newProducts = action.payload.products.filter(
            (p) => !existingIds.has(p.id),
          );
          state.items = [...state.items, ...newProducts];
        } else {
          state.items = action.payload.products;
        }
        state.hasMore = action.payload.hasMore;
        state.lastId = action.payload.lastId ?? null;
        state.totalCount = action.payload.totalCount;
        state.lastFetchParams = pickFilterParams(action.payload.params);
      })
      .addCase(fetchProducts.rejected, (state, action) => {
        // An aborted fetch is not a real failure — a fresh dispatch
        // superseded it, so leaving state.error alone keeps any pending
        // banner from the previous fetch from re-appearing (review I13).
        if (action.meta.aborted) {
          state.loading = false;
          return;
        }
        state.loading = false;
        state.error = action.error.message || "Failed to fetch products";
      })
      .addCase(fetchProductsCount.fulfilled, (state, action) => {
        state.totalCount = action.payload;
      })
      .addCase(fetchProductById.pending, (state) => {
        state.loading = true;
      })
      .addCase(fetchProductById.fulfilled, (state, action) => {
        state.loading = false;
        state.selectedProduct = action.payload;
      })
      .addCase(fetchProductById.rejected, (state, action) => {
        state.loading = false;
        state.error = action.error.message || "Failed to load product";
        state.selectedProduct = null;
      })
      .addCase(createProduct.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(createProduct.fulfilled, (state, action) => {
        state.loading = false;
        state.items.push(action.payload);
        state.selectedProduct = action.payload;
      })
      .addCase(createProduct.rejected, (state, action) => {
        state.loading = false;
        state.error = (action.payload as string) || "Failed to create product";
      })
      .addCase(updateProduct.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(updateProduct.fulfilled, (state, action) => {
        state.loading = false;
        const index = state.items.findIndex((p) => p.id === action.payload.id);
        if (index !== -1) {
          state.items[index] = action.payload;
        }
        state.selectedProduct = action.payload;
      })
      .addCase(updateProduct.rejected, (state, action) => {
        state.loading = false;
        state.error = (action.payload as string) || "Failed to update product";
      })
      .addCase(deleteProduct.fulfilled, (state, action) => {
        state.items = state.items.filter((p) => p.id !== action.payload);
        state.selectedProduct = null;
      })
      .addCase(cleanupProducts.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(cleanupProducts.fulfilled, (state) => {
        // The list/count re-fetch dispatched by the thunk drives the visible
        // update; just clear the loading flag here.
        state.loading = false;
      })
      .addCase(cleanupProducts.rejected, (state, action) => {
        state.loading = false;
        state.error =
          (action.payload as string) || "Failed to clean up products";
      });
  },
});

export const {
  setSelectedProduct,
  clearError,
  setScrollPosition,
  clearProducts,
  restoreProducts,
} = productsSlice.actions;
export default productsSlice.reducer;
