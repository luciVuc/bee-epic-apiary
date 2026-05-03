import { createSlice, createAsyncThunk, PayloadAction } from "@reduxjs/toolkit";
import type { IProduct, IProductInput } from "../types";
import * as api from "../utils/api";

interface IProductsState {
  items: IProduct[];
  loading: boolean;
  error: string | null;
  selectedProduct: IProduct | null;
}

const initialState: IProductsState = {
  items: [],
  loading: false,
  error: null,
  selectedProduct: null,
};

export const fetchProducts = createAsyncThunk("products/fetchAll", async () => {
  const products = await api.api.getProducts();
  return products; // Already transformed to IProduct[]
});

export const fetchProductById = createAsyncThunk(
  "products/fetchById",
  async (id: string) => {
    const product = await api.api.getProductById(id);
    return product; // Already transformed to IProduct
  },
);

export const createProduct = createAsyncThunk(
  "products/create",
  async (product: IProductInput) => {
    const newProduct = await api.api.createProduct(product);
    return newProduct; // Already transformed to IProduct
  },
);

export const updateProduct = createAsyncThunk(
  "products/update",
  async ({ id, product }: { id: string; product: Partial<IProductInput> }) => {
    const updatedProduct = await api.api.updateProduct(id, product);
    return updatedProduct; // Already transformed to IProduct
  },
);

export const deleteProduct = createAsyncThunk(
  "products/delete",
  async (id: string) => {
    await api.api.deleteProduct(id);
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
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchProducts.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchProducts.fulfilled, (state, action) => {
        state.loading = false;
        state.items = action.payload;
      })
      .addCase(fetchProducts.rejected, (state, action) => {
        state.loading = false;
        state.error = action.error.message || "Failed to fetch products";
      })
      .addCase(fetchProductById.fulfilled, (state, action) => {
        state.selectedProduct = action.payload;
      })
      .addCase(createProduct.fulfilled, (state, action) => {
        state.items.push(action.payload);
      })
      .addCase(updateProduct.fulfilled, (state, action) => {
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

export const { setSelectedProduct, clearError } = productsSlice.actions;
export default productsSlice.reducer;
