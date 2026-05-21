import axios from "axios";
import type { IProductInput } from "../types";
import { EProductCategory } from "../types";
import {
  transformStripeProduct,
  transformStripeProductsList,
  transformToStripeParams,
  transformToStripePriceParams,
} from "./transform";
import { SETTINGS_STORAGE_KEY } from "./constants";

const API_BASE_URL = import.meta.env.VITE_API_URL || "/api";

const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    "Content-Type": "application/json",
  },
});

function getApiKey(): string | null {
  try {
    const saved = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed.apiSecretKey) return parsed.apiSecretKey;
    }
  } catch {
    /* ignore */
  }
  return import.meta.env.VITE_API_SECRET_KEY || null;
}

apiClient.interceptors.request.use((config) => {
  const apiKey = getApiKey();
  if (apiKey) {
    config.headers.Authorization = `Bearer ${apiKey}`;
  }
  return config;
});

async function createStripePrice(
  productId: string,
  price: number,
  slug?: string,
  recurringInterval?: string,
  recurringIntervalCount?: number,
) {
  const priceParams = transformToStripePriceParams(
    productId,
    price,
    "usd",
    slug ? `price_${slug}` : undefined,
    recurringInterval,
    recurringIntervalCount,
  );
  const priceResponse = await apiClient.post("/prices", priceParams);
  return priceResponse.data;
}

export function updateApiBaseUrl(url: string) {
  apiClient.defaults.baseURL = url;
}

export const api = {
  // Products
  getProducts: async (params?: {
    limit?: number;
    starting_after?: string;
    search?: string;
    category?: string;
  }) => {
    const response = await apiClient.get("/products", {
      params: {
        expand: ["data.default_price"],
        limit: params?.limit || 10,
        starting_after: params?.starting_after || undefined,
        search: params?.search || undefined,
        category: params?.category || undefined,
      },
    });
    return {
      products: transformStripeProductsList(response.data),
      hasMore: response.data.has_more,
      lastId: response.data.data?.[response.data.data.length - 1]?.id,
      totalCount: response.data.total_count ?? 0,
    };
  },

  getProductsCount: async (params?: { search?: string; category?: string }) => {
    const response = await apiClient.get("/products/count", {
      params: {
        search: params?.search || undefined,
        category: params?.category || undefined,
      },
    });
    return response.data.total;
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

    try {
      // Step 2: Create a price for the product in Stripe
      const isSubscription =
        product.category === EProductCategory.SUBSCRIPTIONS;
      const priceData = await createStripePrice(
        createdProduct.id,
        product.price,
        product.slug,
        isSubscription ? product.recurringInterval : undefined,
        isSubscription ? product.recurringIntervalCount : undefined,
      );

      // Step 3: Update the product to set the default_price
      await apiClient.put(`/products/${createdProduct.id}`, {
        default_price: priceData.id,
      });

      // Return the full product with price info
      return api.getProductById(createdProduct.id);
    } catch (err) {
      // Rollback: delete the orphaned product if price creation fails
      try {
        await apiClient.delete(`/products/${createdProduct.id}`);
      } catch {
        /* best-effort cleanup */
      }
      throw err;
    }
  },

  updateProduct: async (id: string, product: Partial<IProductInput>) => {
    // Step 1: Update product fields in Stripe
    const productParams = transformToStripeParams(product);
    await apiClient.put(`/products/${id}`, productParams);

    // Step 2: If price changed, create a new price and update default_price
    if (product.price !== undefined) {
      let priceData;
      try {
        const isSubscription =
          product.category === EProductCategory.SUBSCRIPTIONS;
        priceData = await createStripePrice(
          id,
          product.price,
          undefined,
          isSubscription ? product.recurringInterval : undefined,
          isSubscription ? product.recurringIntervalCount : undefined,
        );
      } catch (err) {
        throw err;
      }

      await apiClient.put(`/products/${id}`, {
        default_price: priceData.id,
      });
    }

    // Return the full updated product
    return api.getProductById(id);
  },

  deleteProduct: async (id: string) => {
    await apiClient.delete(`/products/${id}`);
    return id; // The productsSlice expects the ID to be returned
  },

  // Content Settings
  getSettings: async <T>(type: string): Promise<T> => {
    const response = await apiClient.get(`/settings/${type}`);
    return response.data;
  },

  saveSettings: async <T>(type: string, data: T): Promise<void> => {
    await apiClient.put(`/settings/${type}`, data);
  },
};
export default api;
