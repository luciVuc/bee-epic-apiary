import axios from "axios";
import type { IProductInput } from "../types";
import {
  transformStripeProduct,
  transformStripeProductsList,
  transformToStripeParams,
  transformToStripePriceParams,
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

async function createStripePrice(
  productId: string,
  price: number,
  slug?: string,
) {
  const priceParams = transformToStripePriceParams(
    productId,
    price,
    "usd",
    slug ? `price_${slug}` : undefined,
  );
  const priceResponse = await apiClient.post("/prices", priceParams);
  return priceResponse.data;
}

export const api = {
  // Products
  getProducts: async () => {
    // Expand default_price to get price details
    const response = await apiClient.get("/products", {
      params: { expand: ["data.default_price"] },
    });
    // Transform Stripe list response to admin product format
    return transformStripeProductsList(response.data);
  },

  getProductById: async (id: string) => {
    const response = await apiClient.get(`/products/${id}`, {
      params: { expand: ["default_price"] },
    });
    return transformStripeProduct(response.data);
  },

  createProduct: async (product: IProductInput) => {
    // Step 1: Create the product in Stripe (without price in metadata)
    const productParams = transformToStripeParams(product);
    const productResponse = await apiClient.post("/products", productParams);
    const createdProduct = productResponse.data;

    // Step 2: Create a price for the product in Stripe
    const priceData = await createStripePrice(
      createdProduct.id,
      product.price,
      product.slug,
    );

    // Step 3: Update the product to set the default_price
    await apiClient.put(`/products/${createdProduct.id}`, {
      default_price: priceData.id,
    });

    // Return the full product with price info
    return api.getProductById(createdProduct.id);
  },

  updateProduct: async (id: string, product: Partial<IProductInput>) => {
    // Step 1: Update product fields in Stripe
    const productParams = transformToStripeParams(product);
    await apiClient.put(`/products/${id}`, productParams);

    // Step 2: If price changed, create a new price and update default_price
    if (product.price !== undefined) {
      const priceData = await createStripePrice(
        id,
        product.price,
        undefined, // Don't set lookup_key to avoid conflicts
      );

      // Update the product to set the new default_price
      await apiClient.put(`/products/${id}`, {
        default_price: priceData.id,
      });
    }

    // Return the full updated product
    return api.getProductById(id);
  },

  deleteProduct: async (id: string) => {
    await apiClient.delete(`/products/${id}`);
    return id;
  },
};
export default api;
