/** API client for communicating with the Cloudflare Worker (Stripe CRUD + settings) */
import axios from "axios";
import type { IProductInput } from "../types";
import { EProductCategory } from "../types";
import {
  transformStripeProduct,
  transformStripeProductsList,
  transformStripeSession,
  transformStripeSessionsList,
  transformStripeLineItemsList,
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

/**
 * Retrieve the API secret key from localStorage or VITE_ env fallback.
 *
 * ⚠️ VITE_API_SECRET_KEY gets baked into the JS bundle at build time.
 * Prefer setting the key via the Admin Config page (→ localStorage).
 */
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

/** Attach Bearer token to every request if an API key is available */
apiClient.interceptors.request.use((config) => {
  const apiKey = getApiKey();
  if (apiKey) {
    config.headers.Authorization = `Bearer ${apiKey}`;
  }
  return config;
});

/** Create a Stripe Price for a given product */
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

/** Update the base URL used by the API client (called when settings are saved) */
export function updateApiBaseUrl(url: string) {
  apiClient.defaults.baseURL = url;
}

/** API methods for interacting with the Cloudflare Worker */
export const api = {
  /** Fetch paginated list of products (with optional search, category filter, cursor pagination) */
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

  /** Fetch total product count (respects search/filter params) */
  getProductsCount: async (params?: { search?: string; category?: string }) => {
    const response = await apiClient.get("/products/count", {
      params: {
        search: params?.search || undefined,
        category: params?.category || undefined,
      },
    });
    return response.data.total;
  },

  /** Fetch a single product by its Stripe ID */
  getProductById: async (id: string) => {
    const response = await apiClient.get(`/products/${id}`, {
      params: { expand: ["default_price"] },
    });
    return transformStripeProduct(response.data);
  },

  /** Create a product (Stripe product + price). Rolls back on failure. */
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

  /** Update an existing product (and create a new Stripe Price if price changed) */
  updateProduct: async (id: string, product: Partial<IProductInput>) => {
    // Step 1: Update product fields in Stripe
    const productParams = transformToStripeParams(product);
    await apiClient.put(`/products/${id}`, productParams);

    // Step 2: If price changed, create a new price and update default_price
    if (product.price !== undefined) {
      const isSubscription =
        product.category === EProductCategory.SUBSCRIPTIONS;
      const priceData = await createStripePrice(
        id,
        product.price,
        undefined,
        isSubscription ? product.recurringInterval : undefined,
        isSubscription ? product.recurringIntervalCount : undefined,
      );

      await apiClient.put(`/products/${id}`, {
        default_price: priceData.id,
      });
    }

    // Return the full updated product
    return api.getProductById(id);
  },

  /** Delete (archive) a product by its Stripe ID */
  deleteProduct: async (id: string) => {
    await apiClient.delete(`/products/${id}`);
    return id; // The productsSlice expects the ID to be returned
  },

  /** Fetch content settings (site, process, testimonials, categories) from the worker KV store */
  getSettings: async <T>(type: string): Promise<T> => {
    const response = await apiClient.get(`/settings/${type}`);
    return response.data;
  },

  /** Save content settings to the worker KV store */
  saveSettings: async <T>(type: string, data: T): Promise<void> => {
    await apiClient.put(`/settings/${type}`, data);
  },

  /** Fetch paginated list of orders (checkout sessions) with optional search/filter */
  getOrders: async (params?: {
    limit?: number;
    starting_after?: string;
    search?: string;
    status?: string;
    payment_status?: string;
  }) => {
    const response = await apiClient.get("/orders", {
      params: {
        limit: params?.limit || 10,
        starting_after: params?.starting_after || undefined,
        search: params?.search || undefined,
        status: params?.status || undefined,
        payment_status: params?.payment_status || undefined,
      },
    });
    return {
      orders: transformStripeSessionsList(response.data),
      hasMore: response.data.has_more,
      lastId: response.data.data?.[response.data.data.length - 1]?.id,
      totalCount: response.data.total_count ?? 0,
    };
  },

  /** Fetch a single order by its Stripe Checkout Session ID (includes line items) */
  getOrderById: async (id: string) => {
    const response = await apiClient.get(`/orders/${id}`);
    return {
      order: transformStripeSession(response.data.session),
      lineItems: transformStripeLineItemsList(response.data.line_items),
    };
  },

  /** Update an order's metadata, collected information, and shipping details */
  updateOrder: async (
    id: string,
    data: {
      metadata?: Record<string, string>;
      collected_information?: {
        shipping_details?: {
          name?: string;
          address?: {
            line1?: string;
            line2?: string;
            city?: string;
            state?: string;
            postal_code?: string;
            country?: string;
          };
        };
      };
    },
  ) => {
    const response = await apiClient.put(`/orders/${id}`, data);
    return transformStripeSession(response.data);
  },
};
export default api;
