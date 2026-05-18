import { createSlice, createAsyncThunk, PayloadAction } from "@reduxjs/toolkit";
import type { IProduct, IProductInput } from "../types";
import * as api from "../utils/api";

interface IFetchParams {
  limit?: number;
  starting_after?: string;
  search?: string;
  category?: string;
}

interface IProductsState {
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

export const fetchProducts = createAsyncThunk(
  "products/fetchAll",
  async (params?: IFetchParams) => {
    const result = await api.api.getProducts(params);
    return { ...result, params: params || null };
  },
);

export const fetchProductsCount = createAsyncThunk(
  "products/fetchCount",
  async (params?: { search?: string; category?: string }) => {
    const total = await api.api.getProductsCount(params);
    return total;
  },
);

export const fetchProductById = createAsyncThunk(
  "products/fetchById",
  async (id: string) => {
    const product = await api.api.getProductById(id);
    return product;
  },
);

export const createProduct = createAsyncThunk(
  "products/create",
  async (product: IProductInput, { dispatch, getState }) => {
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
  },
);

export const updateProduct = createAsyncThunk(
  "products/update",
  async (
    { id, product }: { id: string; product: Partial<IProductInput> },
    { dispatch, getState },
  ) => {
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
  },
);

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
        state.lastId = action.payload.lastId;
        state.totalCount = action.payload.totalCount;
        state.lastFetchParams = action.payload.params;
      })
      .addCase(fetchProducts.rejected, (state, action) => {
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
      .addCase(createProduct.pending, (state) => {
        state.loading = true;
      })
      .addCase(createProduct.fulfilled, (state, action) => {
        state.loading = false;
        state.items.push(action.payload);
        state.selectedProduct = action.payload;
      })
      .addCase(updateProduct.pending, (state) => {
        state.loading = true;
      })
      .addCase(updateProduct.fulfilled, (state, action) => {
        state.loading = false;
        const index = state.items.findIndex((p) => p.id === action.payload.id);
        if (index !== -1) {
          state.items[index] = action.payload;
        }
        state.selectedProduct = action.payload;
      })
      .addCase(deleteProduct.fulfilled, (state, action) => {
        state.items = state.items.filter((p) => p.id !== action.payload);
        state.selectedProduct = null;
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
