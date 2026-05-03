import axios from "axios";
import type { IProductInput } from "../types";
import {
  transformStripeProduct,
  transformStripeProductsList,
} from "./transform";

const API_BASE_URL = (import.meta as any).env.VITE_API_URL || "/api";

const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    "Content-Type": "application/json",
  },
});

// Add auth interceptor if API key is set
apiClient.interceptors.request.use((config) => {
  const apiKey = (import.meta as any).env.VITE_API_SECRET_KEY;
  if (apiKey) {
    config.headers.Authorization = `Bearer ${apiKey}`;
  }
  return config;
});

export const api = {
  // Products
  getProducts: async () => {
    const response = await apiClient.get("/products");
    // Transform Stripe list response to admin product format
    return transformStripeProductsList(response.data);
  },

  getProductById: async (id: string) => {
    const response = await apiClient.get(`/products/${id}`);
    return transformStripeProduct(response.data);
  },

  createProduct: async (product: IProductInput) => {
    const response = await apiClient.post("/products", product);
    return transformStripeProduct(response.data);
  },

  updateProduct: async (id: string, product: Partial<IProductInput>) => {
    const response = await apiClient.put(`/products/${id}`, product);
    return transformStripeProduct(response.data);
  },

  deleteProduct: async (id: string) => {
    await apiClient.delete(`/products/${id}`);
    return id;
  },
};

export default api;
