/** API client for communicating with the Cloudflare Worker (Stripe CRUD + settings) */
import axios, {
  type AxiosResponse,
  type AxiosRequestConfig,
  type AxiosError,
} from "axios";
import type { IProductInput, ICaller } from "../types";
import type {
  IApiError,
  IApiResponse,
  IAuthPolicy,
  IUserPublic,
  EStaffRole,
  IStripeProductsListResponse,
} from "@bee-epic/shared";
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
import { DEFAULT_API_URL } from "./constants";
import { sharesETldPlusOne } from "./cookieScope";
// ─── Cycle-safety warning ─────────────────────────────────────────────
// This module has a mutual static import cycle with `../store/authSlice`
// (authSlice imports `api.api.*` from this file for its thunks). The
// cycle is eval-safe today because both sides ONLY reference the cycled
// symbols inside function bodies (thunks / interceptor callbacks), never
// at module top level. Do NOT invoke `refresh()`, `resetAuth()`, or any
// `api.api.*` symbol at the top level of either file — doing so will
// TDZ or hit `undefined` at import time.
import { refresh, resetAuth } from "../store/authSlice";

const API_BASE_URL = DEFAULT_API_URL;

/* ─── Store binding (Task 10.9) ─────────────────────────────────────────
 * The 401 interceptor needs to dispatch refresh() and read auth state, but
 * importing the store here would create a circular dependency (store →
 * authSlice → api.ts → store). Instead, store/index.ts calls bindStore(store)
 * exactly once at module init, and the interceptor reads from the getter.
 */

type BoundStore = {
  dispatch: (action: unknown) => unknown;
  getState: () => { auth: { refreshInFlight: boolean; caller: unknown } };
  subscribe: (listener: () => void) => () => void;
};

let __store: BoundStore | null = null;

/** Bind the Redux store so the 401 interceptor can dispatch refresh(). */
export function bindStore(s: BoundStore): void {
  __store = s;
}

/** Test helper — resets binding between tests. Not exported from the barrel. */
export function __unbindStoreForTests(): void {
  __store = null;
}

/**
 * Soft warning when `VITE_API_URL` sits outside the page's eTLD+1: in that
 * case auth cookies (`bea_at` / `bea_rt`) won't ride along on API requests,
 * so the worker will silently 401 every call. Easy to misconfigure
 * (`api.example.com` admin loading `api.staging.example.com` API), easy to
 * miss (it just looks like an auth bug), hence the explicit warn (review I1).
 *
 * Path-relative URLs (`/api`) and the Vite dev proxy are skipped — those
 * always share the page's origin.
 */
if (
  typeof window !== "undefined" &&
  API_BASE_URL &&
  !API_BASE_URL.startsWith("/")
) {
  try {
    const apiHost = new URL(API_BASE_URL).hostname;
    const pageHost = window.location.hostname;
    if (!sharesETldPlusOne(apiHost, pageHost)) {
      console.warn(
        "[bee-epic admin] VITE_API_URL hostname does not share the page's eTLD+1; " +
          "auth cookies (`bea_at` / `bea_rt`) may not be forwarded.",
        { apiHost, pageHost },
      );
    }
  } catch {
    // Bad URL — apiClient will fail on first call with a clearer error.
  }
}

const apiClient = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
  headers: {
    "Content-Type": "application/json",
  },
});

/* ─── 401-refresh interceptor (Task 10.9) ──────────────────────────────
 * When the worker rejects a request with 401 (access cookie expired), fire
 * a single `/auth/refresh` call and retry the original request exactly once.
 *
 * Trust-chain flow:
 *   1. Non-401 errors and errors from `/auth/*` URLs pass through untouched
 *      (login/logout/refresh must never recurse into the refresh loop).
 *   2. If the request has already been retried once (`RETRY_MARKER` set on
 *      `config`), pass through — this guards against infinite loops when
 *      refresh succeeds but the subsequent retry also 401s.
 *   3. If a refresh is already in flight (mutex flag on `state.auth
 *      .refreshInFlight`), subscribe to the store and wait for it to flip
 *      back to `false`, then check whether refresh succeeded (caller still
 *      populated → retry; caller null → reject + resetAuth).
 *   4. Otherwise dispatch `refresh()` ourselves and follow the same
 *      success/failure branches.
 *
 * The marker is a Symbol so it never leaks into headers or the request body.
 */
const RETRY_MARKER: unique symbol = Symbol("bea:retried");

type RetryableConfig = AxiosRequestConfig & {
  [RETRY_MARKER]?: boolean;
};

function isAuthUrl(url: string | undefined): boolean {
  if (!url) return false;
  return /^\/?auth\//.test(url);
}

apiClient.interceptors.response.use(
  (response) => response,
  async (err: AxiosError) => {
    const status = err.response?.status;
    if (status !== 401) return Promise.reject(err);

    const config = err.config as RetryableConfig | undefined;
    if (!config) return Promise.reject(err);

    if (isAuthUrl(config.url)) return Promise.reject(err);
    if (config[RETRY_MARKER]) return Promise.reject(err);

    const store = __store;
    if (!store) return Promise.reject(err);

    if (store.getState().auth.refreshInFlight) {
      // Another 401 is already driving a refresh — coalesce.
      await new Promise<void>((resolve) => {
        if (!store.getState().auth.refreshInFlight) {
          resolve();
          return;
        }
        const unsubscribe = store.subscribe(() => {
          if (!store.getState().auth.refreshInFlight) {
            unsubscribe();
            resolve();
          }
        });
      });
    } else {
      // We drive the refresh. The thunk sets refreshInFlight = true on
      // .pending and clears it on both .fulfilled and .rejected, so the
      // await resolves after either terminal state.
      await store.dispatch(refresh());
    }

    // Post-refresh: the `refresh.rejected` reducer clears caller to null,
    // so a null caller means refresh failed.
    if (store.getState().auth.caller) {
      config[RETRY_MARKER] = true;
      return apiClient.request(config);
    }
    store.dispatch(resetAuth());
    return Promise.reject(err);
  },
);

/**
 * Unwrap an `IApiResponse<T>` envelope from an axios response.
 * Throws a typed error if `ok === false` so callers pattern-match on `error.code`.
 */
function unwrap<T>(responseData: IApiResponse<T>): T {
  if (responseData.ok) return responseData.data;
  throw new ApiError(responseData.error);
}

/**
 * Void-response counterpart of `unwrap`. Server auth handlers that carry no
 * useful body (`logout`, `refresh`, `changePassword`, `deleteUser`,
 * `reinviteUser`, `requestReset`, `completeReset`, `bootstrapOwner`) return
 * either an empty 204 (`jsonResponse({}, 204, ...)`) or a `{ok:true, data:null}`
 * 204 (`deleteUser`). Both shapes mean "success, no body" — we treat any 204
 * response as void success regardless of body. On any other status the axios
 * client would have rejected the promise before reaching this helper, so if
 * we're here on 2xx-non-204 the body should still be a valid envelope; fall
 * through to `unwrap` for that case.
 */
function unwrapVoid(response: AxiosResponse<unknown>): void {
  if (response.status === 204) return;
  // Non-204 success — must be a proper envelope with ok:true.
  unwrap(response.data as IApiResponse<unknown>);
}

/** Typed error carrying the structured `IApiError` from the server. */
export class ApiError extends Error {
  constructor(public readonly apiError: IApiError) {
    super(`API error: ${apiError.code}`);
    this.name = "ApiError";
  }
}

/**
 * Produce a user-facing message from any thrown value. Prefers the
 * structured `IApiError` envelope an `ApiError` carries (so codes like
 * VALIDATION_FAILED render their field map, BAD_REQUEST renders its
 * `message`, etc.), falls back to `Error.message`, then to a generic
 * fallback. Centralized here so every slice / page extracts errors
 * the same way (review M8).
 */
export function apiErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof ApiError) {
    const ae = err.apiError;
    switch (ae.code) {
      case "BAD_REQUEST":
        return ae.message;
      case "VALIDATION_FAILED": {
        const fieldList = Object.entries(ae.fields)
          .map(([k, v]) => `${k}: ${v}`)
          .join("; ");
        return fieldList
          ? `Validation failed — ${fieldList}`
          : "Validation failed";
      }
      case "UNAUTHORIZED":
        return "You're not signed in.";
      case "FORBIDDEN":
        return `You need the ${ae.requiredRole} role for this action.`;
      case "NOT_FOUND":
        return `Not found: ${ae.resource}`;
      case "RATE_LIMITED":
        return `Rate limited. Try again in ${ae.retryAfter}s.`;
      case "METHOD_NOT_ALLOWED":
        return `Method not allowed (allowed: ${ae.allowed.join(", ")}).`;
      case "INTERNAL":
        return "The server hit an internal error. Try again.";
    }
  }
  if (err instanceof Error && err.message) return err.message;
  return fallback;
}

/** Create a Stripe Price for a given product */
async function createStripePrice(
  productId: string,
  price: number,
  slug?: string,
  recurringInterval?: string,
  recurringIntervalCount?: number,
): Promise<{ id: string }> {
  const priceParams = transformToStripePriceParams(
    productId,
    price,
    "usd",
    slug ? `price_${slug}` : undefined,
    recurringInterval,
    recurringIntervalCount,
  );
  const response = await apiClient.post("/prices", priceParams);
  return unwrap<{ id: string }>(response.data);
}

/** Candidate product surfaced by the cleanup preview (dry-run). */
export interface IProductCleanupCandidate {
  id: string;
  name: string;
}

/** Result of GET/POST /products/cleanup — dry-run (preview) or applied. */
export interface IProductCleanupResult {
  dry_run: boolean;
  /** Present on dry-run: products that would be removed. */
  candidates?: IProductCleanupCandidate[];
  /** Present on dry-run: candidate count. */
  count?: number;
  /** Present on apply: IDs permanently deleted. */
  deleted?: string[];
  /** Present on apply: IDs archived (delete refused by Stripe). */
  archived?: string[];
  /** Present on apply: IDs that could be neither deleted nor archived. */
  failed?: { id: string; error: string }[];
  deleted_count?: number;
  archived_count?: number;
  failed_count?: number;
  message?: string;
}

/** API methods for interacting with the Cloudflare Worker */
export const api = {
  /**
   * Fetch the resolved caller identity (or null if unauthenticated).
   *
   * When `caller` is null the server also returns a `bootstrapAvailable`
   * flag (Phase 9.5 contract) so the SPA can decide between the login
   * page and the first-time OWNER bootstrap flow. The field is optional
   * and only present on the null-caller branch.
   */
  getWhoami: async (): Promise<{
    caller: ICaller | null;
    bootstrapAvailable?: boolean;
  }> => {
    const response = await apiClient.get("/whoami");
    return unwrap<{ caller: ICaller | null; bootstrapAvailable?: boolean }>(
      response.data,
    );
  },

  /* -------------------------------------------------------------------- */
  /* Auth flows (Phase 10)                                                */
  /* -------------------------------------------------------------------- */

  /** Sign in with email + password — server sets the session cookies. */
  login: async (params: {
    email: string;
    password: string;
  }): Promise<ICaller> => {
    const response = await apiClient.post("/auth/login", params);
    const data = unwrap<{ caller: ICaller }>(response.data);
    return data.caller;
  },

  /** Clear the session cookies. */
  logout: async (): Promise<void> => {
    const response = await apiClient.post("/auth/logout");
    unwrapVoid(response);
  },

  /** Rotate the access + refresh cookies. */
  refresh: async (): Promise<void> => {
    const response = await apiClient.post("/auth/refresh");
    unwrapVoid(response);
  },

  /** Complete an invite: consume the token and set the account password. */
  acceptInvite: async (params: {
    token: string;
    password: string;
  }): Promise<ICaller> => {
    const response = await apiClient.post("/auth/accept-invite", params);
    const data = unwrap<{ caller: ICaller }>(response.data);
    return data.caller;
  },

  /**
   * Kick off a password-reset email. Server returns 200 regardless of
   * whether the email exists — do not distinguish in the UI.
   */
  requestReset: async (params: { email: string }): Promise<void> => {
    const response = await apiClient.post("/auth/request-reset", params);
    unwrapVoid(response);
  },

  /** Consume a reset token + new password; server sets fresh cookies. */
  completeReset: async (params: {
    token: string;
    password: string;
  }): Promise<void> => {
    const response = await apiClient.post("/auth/complete-reset", params);
    unwrapVoid(response);
  },

  /** Change the current caller's password. */
  changePassword: async (params: {
    currentPassword: string;
    newPassword: string;
  }): Promise<void> => {
    const response = await apiClient.post("/auth/change-password", params);
    unwrapVoid(response);
  },

  /** First-time OWNER bootstrap — server sends the invite email. */
  bootstrapOwner: async (params: { email: string }): Promise<void> => {
    const response = await apiClient.post("/auth/bootstrap-owner", params);
    unwrapVoid(response);
  },

  /* -------------------------------------------------------------------- */
  /* Auth policy (Phase 8.7)                                              */
  /* -------------------------------------------------------------------- */

  /** Fetch the active auth policy (min length, breach checks, …). */
  getAuthPolicy: async (): Promise<IAuthPolicy> => {
    const response = await apiClient.get("/settings/auth-policy");
    return unwrap<IAuthPolicy>(response.data);
  },

  /** Overwrite the auth policy (OWNER-only on the server). */
  putAuthPolicy: async (policy: IAuthPolicy): Promise<IAuthPolicy> => {
    const response = await apiClient.put("/settings/auth-policy", policy);
    return unwrap<IAuthPolicy>(response.data);
  },

  /* -------------------------------------------------------------------- */
  /* User management (Phase 8.1–8.6)                                      */
  /* -------------------------------------------------------------------- */

  /** List all users (server strips `passwordHash`). */
  listUsers: async (): Promise<IUserPublic[]> => {
    const response = await apiClient.get("/users");
    const data = unwrap<{ users: IUserPublic[] }>(response.data);
    return data.users;
  },

  /** Invite a new user; server persists an INVITED record + sends email. */
  inviteUser: async (params: {
    email: string;
    role: EStaffRole;
    displayName?: string;
  }): Promise<IUserPublic> => {
    const response = await apiClient.post("/users/invite", params);
    const data = unwrap<{ user: IUserPublic }>(response.data);
    return data.user;
  },

  /** Update a user's role, status, or display name. */
  updateUser: async (
    email: string,
    patch: Partial<Pick<IUserPublic, "role" | "status" | "displayName">>,
  ): Promise<IUserPublic> => {
    const response = await apiClient.put(
      `/users/${encodeURIComponent(email)}`,
      patch,
    );
    const data = unwrap<{ user: IUserPublic }>(response.data);
    return data.user;
  },

  /** Delete a user record entirely. */
  deleteUser: async (email: string): Promise<void> => {
    const response = await apiClient.delete(
      `/users/${encodeURIComponent(email)}`,
    );
    unwrapVoid(response);
  },

  /** Resend the invite email for an INVITED user. */
  reinviteUser: async (email: string): Promise<void> => {
    const response = await apiClient.post(
      `/users/${encodeURIComponent(email)}/reinvite`,
    );
    unwrapVoid(response);
  },

  /** Update the current caller's own profile (display name only). */
  updateMe: async (params: { displayName: string }): Promise<IUserPublic> => {
    const response = await apiClient.put("/users/me", params);
    const data = unwrap<{ user: IUserPublic }>(response.data);
    return data.user;
  },

  /** Fetch paginated list of products (with optional search, category filter, cursor pagination) */
  getProducts: async (params?: {
    limit?: number;
    starting_after?: string;
    search?: string;
    category?: string;
    /** Optional AbortSignal — the slice threads this in so a filter-change
     *  abort cancels the in-flight axios request (review I13). */
    signal?: AbortSignal;
  }) => {
    const response = await apiClient.get("/products", {
      params: {
        expand: ["data.default_price"],
        limit: params?.limit || 10,
        starting_after: params?.starting_after || undefined,
        search: params?.search || undefined,
        category: params?.category || undefined,
      },
      signal: params?.signal,
    });
    const data = unwrap<{
      data: unknown[];
      has_more: boolean;
      total_count: number;
    }>(response.data);
    return {
      products: transformStripeProductsList(
        data as unknown as IStripeProductsListResponse,
      ),
      hasMore: data.has_more,
      lastId: (data.data as { id?: string }[])?.[data.data.length - 1]?.id,
      totalCount: data.total_count ?? 0,
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
    const data = unwrap<{ total: number }>(response.data);
    return data.total;
  },

  /**
   * Fetch aggregated product stats (server-side; KV-cached 120s).
   * Replaces the dashboard's prior fetch-all-then-aggregate flow (review I12).
   */
  getProductsStats: async (): Promise<{
    totalProducts: number;
    inStock: number;
    featured: number;
    byCategory: Record<string, number>;
  }> => {
    const response = await apiClient.get("/products/stats");
    return unwrap<{
      totalProducts: number;
      inStock: number;
      featured: number;
      byCategory: Record<string, number>;
    }>(response.data);
  },

  /** Fetch a single product by its Stripe ID */
  getProductById: async (id: string) => {
    const response = await apiClient.get(`/products/${id}`, {
      params: { expand: ["default_price"] },
    });
    return transformStripeProduct(unwrap(response.data));
  },

  /** Create a product (Stripe product + price). Rolls back on failure. */
  createProduct: async (product: IProductInput) => {
    const productParams = transformToStripeParams(product);
    const productResponse = await apiClient.post("/products", productParams);
    const createdProduct = unwrap<{ id: string }>(productResponse.data);

    try {
      const isSubscription =
        product.category === EProductCategory.SUBSCRIPTIONS;
      const priceData = await createStripePrice(
        createdProduct.id,
        product.price,
        product.slug,
        isSubscription ? product.recurringInterval : undefined,
        isSubscription ? product.recurringIntervalCount : undefined,
      );

      await apiClient.put(`/products/${createdProduct.id}`, {
        default_price: priceData.id,
      });

      return api.getProductById(createdProduct.id);
    } catch (err) {
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
    const productParams = transformToStripeParams(product);

    // When the price changed we must mint a new Stripe Price (prices are
    // immutable) and point the product's default_price at it. The product
    // already exists, so — unlike createProduct — we create the Price FIRST,
    // then apply metadata + default_price in a SINGLE product PUT. This avoids
    // the earlier three-write sequence that could leave the product with new
    // metadata but a stale/absent price if a later write failed: now either the
    // one product update fully applies (new metadata + new price) or nothing
    // does, and a failed price creation aborts before any product mutation.
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

      const resp = await apiClient.put(`/products/${id}`, {
        ...productParams,
        default_price: priceData.id,
      });
      unwrap(resp.data);
      return api.getProductById(id);
    }

    const putResp = await apiClient.put(`/products/${id}`, productParams);
    unwrap(putResp.data);
    return api.getProductById(id);
  },

  /** Delete a product by its Stripe ID. The worker attempts a permanent
   * Stripe delete and falls back to archiving when Stripe refuses (product has
   * transaction history). Either way it's removed from the storefront. */
  deleteProduct: async (id: string) => {
    const response = await apiClient.delete(`/products/${id}`);
    unwrap(response.data);
    return id;
  },

  /** Clean up un-priced (unsellable) products. `dryRun` returns the candidate
   * list without deleting (used to preview before confirming). */
  cleanupProducts: async (dryRun: boolean): Promise<IProductCleanupResult> => {
    const response = await apiClient.post(
      "/products/cleanup",
      undefined,
      dryRun ? { params: { dryRun: "true" } } : undefined,
    );
    return unwrap<IProductCleanupResult>(response.data);
  },

  /** Fetch content settings (site, process, testimonials, categories) from the worker KV store */
  getSettings: async <T>(type: string): Promise<T> => {
    const response = await apiClient.get(`/settings/${type}`);
    return unwrap<T>(response.data);
  },

  /** Save content settings to the worker KV store */
  saveSettings: async <T>(type: string, data: T): Promise<void> => {
    const response = await apiClient.put(`/settings/${type}`, data);
    unwrap(response.data);
  },

  /** Fetch paginated list of orders (checkout sessions) with optional search/filter */
  getOrders: async (params?: {
    limit?: number;
    starting_after?: string;
    search?: string;
    status?: string;
    payment_status?: string;
    order_status?: string;
    /** Optional AbortSignal — the slice threads this in so a filter-change
     *  abort cancels the in-flight axios request (review I13). */
    signal?: AbortSignal;
  }) => {
    const response = await apiClient.get("/orders", {
      params: {
        limit: params?.limit || 10,
        starting_after: params?.starting_after || undefined,
        search: params?.search || undefined,
        status: params?.status || undefined,
        payment_status: params?.payment_status || undefined,
        order_status: params?.order_status || undefined,
      },
      signal: params?.signal,
    });
    const data = unwrap<{
      data: unknown[];
      has_more: boolean;
      total_count: number;
    }>(response.data);
    return {
      orders: transformStripeSessionsList(
        data as unknown as Parameters<typeof transformStripeSessionsList>[0],
      ),
      hasMore: data.has_more,
      lastId: (data.data as { id?: string }[])?.[data.data.length - 1]?.id,
      totalCount: data.total_count ?? 0,
    };
  },

  /** Fetch a single order by its Stripe Checkout Session ID (includes line items) */
  getOrderById: async (id: string) => {
    const response = await apiClient.get(`/orders/${id}`);
    const data = unwrap<{ session: unknown; line_items: unknown[] }>(
      response.data,
    );
    return {
      order: transformStripeSession(data.session as Record<string, unknown>),
      lineItems: transformStripeLineItemsList(
        data.line_items as Record<string, unknown>[],
      ),
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
    return transformStripeSession(unwrap(response.data));
  },
};
export default api;
