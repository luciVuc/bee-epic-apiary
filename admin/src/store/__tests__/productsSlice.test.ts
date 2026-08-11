/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { configureStore } from "@reduxjs/toolkit";
import productsReducer, {
  fetchProducts,
  fetchProductsCount,
  fetchProductById,
  createProduct,
  updateProduct,
  deleteProduct,
  cleanupProducts,
  setSelectedProduct,
  clearError,
  setScrollPosition,
  clearProducts,
  restoreProducts,
} from "../productsSlice";
import type { IProduct, IProductInput } from "../../types";
import { EProductCategory } from "../../types";

vi.mock("../../utils/api", async () => {
  // Use importOriginal so ApiError + apiErrorMessage carry their real
  // implementations through; only the `api` namespace is mocked.
  const actual =
    await vi.importActual<typeof import("../../utils/api")>("../../utils/api");
  return {
    ...actual,
    api: {
      getProducts: vi.fn(),
      getProductsCount: vi.fn(),
      getProductById: vi.fn(),
      createProduct: vi.fn(),
      updateProduct: vi.fn(),
      deleteProduct: vi.fn(),
      cleanupProducts: vi.fn(),
    },
  };
});

function createStore() {
  return configureStore({
    reducer: { products: productsReducer },
  });
}

const mockProduct: IProduct = {
  id: "prod_1",
  name: "Test Honey",
  slug: "test-honey",
  description: "A test product",
  price: 1999,
  category: EProductCategory.HONEY,
  imageUrls: ["https://example.com/img.png"],
  thumbnailUrls: ["https://example.com/thumb.png"],
  inStock: true,
  featured: false,
  weight: "16 oz",
  tags: ["raw"],
};

describe("productsSlice", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("reducers", () => {
    it("setSelectedProduct sets the selected product", () => {
      const store = createStore();
      store.dispatch(setSelectedProduct(mockProduct));
      expect(store.getState().products.selectedProduct).toEqual(mockProduct);
    });

    it("setSelectedProduct clears with null", () => {
      const store = createStore();
      store.dispatch(setSelectedProduct(null));
      expect(store.getState().products.selectedProduct).toBeNull();
    });

    it("clearError clears error", () => {
      const store = createStore();
      store.dispatch(clearError());
      expect(store.getState().products.error).toBeNull();
    });

    it("setScrollPosition sets scroll position", () => {
      const store = createStore();
      store.dispatch(setScrollPosition(500));
      expect(store.getState().products.scrollPosition).toBe(500);
    });

    it("clearProducts resets product list", () => {
      const store = createStore();
      store.dispatch(
        restoreProducts({
          items: [mockProduct],
          hasMore: true,
          lastId: "prod_1",
          totalCount: 1,
          lastFetchParams: { limit: 10 },
        }),
      );
      store.dispatch(clearProducts());
      const state = store.getState().products;
      expect(state.items).toEqual([]);
      expect(state.hasMore).toBe(false);
      expect(state.lastId).toBeNull();
      expect(state.totalCount).toBe(0);
      expect(state.lastFetchParams).toBeNull();
    });

    it("restoreProducts restores saved state", () => {
      const store = createStore();
      const savedState = {
        items: [mockProduct],
        hasMore: true,
        lastId: "prod_1",
        totalCount: 1,
        lastFetchParams: { limit: 10 } as any,
      };
      store.dispatch(restoreProducts(savedState));
      const state = store.getState().products;
      expect(state.items).toEqual([mockProduct]);
      expect(state.hasMore).toBe(true);
      expect(state.lastId).toBe("prod_1");
      expect(state.totalCount).toBe(1);
      expect(state.loading).toBe(false);
      expect(state.error).toBeNull();
    });
  });

  describe("async thunks", () => {
    describe("fetchProducts", () => {
      it("sets loading and items on fulfilled", async () => {
        const store = createStore();
        const apiModule = await import("../../utils/api");
        vi.mocked(apiModule.api.getProducts).mockResolvedValue({
          products: [mockProduct],
          hasMore: false,
          lastId: "prod_1",
          totalCount: 1,
        });

        await store.dispatch(fetchProducts({ limit: 10 }));
        const state = store.getState().products;
        expect(state.loading).toBe(false);
        expect(state.items).toEqual([mockProduct]);
        expect(state.hasMore).toBe(false);
        expect(state.totalCount).toBe(1);
      });

      it("sets error on rejected", async () => {
        const store = createStore();
        const apiModule = await import("../../utils/api");
        vi.mocked(apiModule.api.getProducts).mockRejectedValue(
          new Error("Network error"),
        );

        await store.dispatch(fetchProducts({ limit: 10 }));
        const state = store.getState().products;
        expect(state.loading).toBe(false);
        expect(state.error).toBe("Network error");
      });

      it("appends products on load more (starting_after)", async () => {
        const store = createStore();
        const apiModule = await import("../../utils/api");
        vi.mocked(apiModule.api.getProducts).mockResolvedValue({
          products: [mockProduct],
          hasMore: true,
          lastId: "prod_1",
          totalCount: 2,
        });

        await store.dispatch(fetchProducts({ limit: 10 }));
        const nextProduct = {
          ...mockProduct,
          id: "prod_2",
          name: "Second Product",
        };
        vi.mocked(apiModule.api.getProducts).mockResolvedValue({
          products: [nextProduct],
          hasMore: false,
          lastId: "prod_2",
          totalCount: 2,
        });

        await store.dispatch(
          fetchProducts({ limit: 10, starting_after: "prod_1" }),
        );
        const state = store.getState().products;
        expect(state.items).toHaveLength(2);
        expect(state.items[0].id).toBe("prod_1");
        expect(state.items[1].id).toBe("prod_2");
      });

      it("deduplicates products on load more", async () => {
        const store = createStore();
        const apiModule = await import("../../utils/api");
        vi.mocked(apiModule.api.getProducts).mockResolvedValue({
          products: [mockProduct],
          hasMore: true,
          lastId: "prod_1",
          totalCount: 1,
        });

        await store.dispatch(fetchProducts({ limit: 10 }));
        vi.mocked(apiModule.api.getProducts).mockResolvedValue({
          products: [mockProduct],
          hasMore: false,
          lastId: "prod_1",
          totalCount: 1,
        });

        await store.dispatch(
          fetchProducts({ limit: 10, starting_after: "prod_1" }),
        );
        const state = store.getState().products;
        expect(state.items).toHaveLength(1);
      });

      it("lastFetchParams excludes pagination keys (starting_after, limit) after Load More", async () => {
        // Regression: previously the slice stored the raw params, so the
        // second (paginated) fetch overwrote lastFetchParams with
        // { search, starting_after, limit }. fetchProductsCount then re-asked
        // the worker with a poisoned cursor instead of just { search, category }.
        const store = createStore();
        const apiModule = await import("../../utils/api");
        vi.mocked(apiModule.api.getProducts).mockResolvedValue({
          products: [mockProduct],
          hasMore: false,
          lastId: "prod_1",
          totalCount: 1,
        });

        await store.dispatch(fetchProducts({ search: "foo", limit: 10 }));
        await store.dispatch(
          fetchProducts({ search: "foo", starting_after: "prod_1", limit: 10 }),
        );
        const state = store.getState().products;
        expect(state.lastFetchParams).toEqual({ search: "foo" });
      });
    });

    describe("fetchProductsCount", () => {
      it("updates totalCount on fulfilled", async () => {
        const store = createStore();
        const apiModule = await import("../../utils/api");
        vi.mocked(apiModule.api.getProductsCount).mockResolvedValue(42);

        await store.dispatch(fetchProductsCount({}));
        expect(store.getState().products.totalCount).toBe(42);
      });
    });

    describe("fetchProductById", () => {
      it("sets loading and selectedProduct on fulfilled", async () => {
        const store = createStore();
        const apiModule = await import("../../utils/api");
        vi.mocked(apiModule.api.getProductById).mockResolvedValue(mockProduct);

        await store.dispatch(fetchProductById("prod_1"));
        const state = store.getState().products;
        expect(state.loading).toBe(false);
        expect(state.selectedProduct).toEqual(mockProduct);
      });

      it("sets error and clears selectedProduct on rejected", async () => {
        const store = createStore();
        const apiModule = await import("../../utils/api");
        vi.mocked(apiModule.api.getProductById).mockRejectedValue(
          new Error("Not found"),
        );

        await store.dispatch(fetchProductById("bad_id"));
        const state = store.getState().products;
        expect(state.loading).toBe(false);
        expect(state.error).toBe("Not found");
        expect(state.selectedProduct).toBeNull();
      });
    });

    describe("createProduct", () => {
      it("adds product and refreshes count on fulfilled", async () => {
        const store = createStore();
        const apiModule = await import("../../utils/api");
        vi.mocked(apiModule.api.createProduct).mockResolvedValue(mockProduct);
        vi.mocked(apiModule.api.getProductsCount).mockResolvedValue(1);

        const input: IProductInput = {
          name: "Test Honey",
          slug: "test-honey",
          description: "A test",
          price: 1999,
          category: EProductCategory.HONEY,
          imageUrls: [],
          thumbnailUrls: [],
          inStock: true,
          featured: false,
          weight: "",
          tags: [],
        };

        await store.dispatch(createProduct(input));
        const state = store.getState().products;
        expect(state.items).toContainEqual(mockProduct);
        expect(state.selectedProduct).toEqual(mockProduct);
        expect(state.loading).toBe(false);
      });

      it("sets error on rejected with payload", async () => {
        const store = createStore();
        const apiModule = await import("../../utils/api");
        // The slice now extracts user-facing messages via apiErrorMessage,
        // which understands the structured IApiError envelope wrapped in
        // ApiError. BAD_REQUEST is the simplest "carry a message" code.
        vi.mocked(apiModule.api.createProduct).mockRejectedValue(
          new apiModule.ApiError({
            code: "BAD_REQUEST",
            message: "Validation failed",
          }),
        );

        const input: IProductInput = {
          name: "Bad",
          slug: "bad",
          description: "",
          price: 0,
          category: EProductCategory.HONEY,
          imageUrls: [],
          thumbnailUrls: [],
          inStock: true,
          featured: false,
          weight: "",
          tags: [],
        };

        await store.dispatch(createProduct(input));
        const state = store.getState().products;
        expect(state.loading).toBe(false);
        expect(state.error).toBe("Validation failed");
      });

      it("sets fallback error on rejected without response", async () => {
        const store = createStore();
        const apiModule = await import("../../utils/api");
        vi.mocked(apiModule.api.createProduct).mockRejectedValue(
          new Error("Server error"),
        );

        const input: IProductInput = {
          name: "Bad",
          slug: "bad",
          description: "",
          price: 0,
          category: EProductCategory.HONEY,
          imageUrls: [],
          thumbnailUrls: [],
          inStock: true,
          featured: false,
          weight: "",
          tags: [],
        };

        const result = await store.dispatch(createProduct(input));
        expect(createProduct.rejected.match(result)).toBe(true);
        const state = store.getState().products;
        expect(state.error).toBe("Server error");
      });
    });

    describe("updateProduct", () => {
      it("updates product in list and selectedProduct on fulfilled", async () => {
        const store = createStore();
        const apiModule = await import("../../utils/api");
        vi.mocked(apiModule.api.getProducts).mockResolvedValue({
          products: [mockProduct],
          hasMore: false,
          lastId: "prod_1",
          totalCount: 1,
        });
        vi.mocked(apiModule.api.getProductsCount).mockResolvedValue(1);

        await store.dispatch(fetchProducts({}));

        const updated = { ...mockProduct, name: "Updated Honey" };
        vi.mocked(apiModule.api.updateProduct).mockResolvedValue(updated);

        await store.dispatch(
          updateProduct({ id: "prod_1", product: { name: "Updated Honey" } }),
        );
        const state = store.getState().products;
        expect(state.items[0].name).toBe("Updated Honey");
        expect(state.selectedProduct?.name).toBe("Updated Honey");
      });

      it("sets error on rejected", async () => {
        const store = createStore();
        const apiModule = await import("../../utils/api");
        vi.mocked(apiModule.api.updateProduct).mockRejectedValue(
          new Error("Update failed"),
        );

        await store.dispatch(
          updateProduct({ id: "prod_1", product: { name: "X" } }),
        );
        const state = store.getState().products;
        expect(state.loading).toBe(false);
        expect(state.error).toBe("Update failed");
      });
    });

    describe("deleteProduct", () => {
      it("removes product and clears selectedProduct on fulfilled", async () => {
        const store = createStore();
        const apiModule = await import("../../utils/api");
        vi.mocked(apiModule.api.getProducts).mockResolvedValue({
          products: [mockProduct],
          hasMore: false,
          lastId: "prod_1",
          totalCount: 1,
        });
        vi.mocked(apiModule.api.getProductsCount).mockResolvedValue(1);

        await store.dispatch(fetchProducts({}));
        vi.mocked(apiModule.api.deleteProduct).mockResolvedValue(
          undefined as any,
        );

        store.dispatch(setSelectedProduct(mockProduct));
        await store.dispatch(deleteProduct("prod_1"));

        const state = store.getState().products;
        expect(state.items).toHaveLength(0);
        expect(state.selectedProduct).toBeNull();
      });
    });

    describe("cleanupProducts", () => {
      it("re-fetches list + count and clears loading on fulfilled", async () => {
        const store = createStore();
        const apiModule = await import("../../utils/api");

        // Seed the list with two products so we can prove a refetch replaces it.
        vi.mocked(apiModule.api.getProducts).mockResolvedValueOnce({
          products: [mockProduct, { ...mockProduct, id: "prod_2" }],
          hasMore: false,
          lastId: "prod_2",
          totalCount: 2,
        });
        vi.mocked(apiModule.api.getProductsCount).mockResolvedValue(1);
        await store.dispatch(fetchProducts({}));
        expect(store.getState().products.items).toHaveLength(2);

        // Cleanup removes prod_2; the thunk's refetch returns only prod_1.
        vi.mocked(apiModule.api.cleanupProducts).mockResolvedValue({
          dry_run: false,
          deleted: ["prod_2"],
          archived: [],
          failed: [],
          deleted_count: 1,
          archived_count: 0,
          failed_count: 0,
        });
        vi.mocked(apiModule.api.getProducts).mockResolvedValueOnce({
          products: [mockProduct],
          hasMore: false,
          lastId: "prod_1",
          totalCount: 1,
        });

        await store.dispatch(cleanupProducts());

        const state = store.getState().products;
        expect(apiModule.api.cleanupProducts).toHaveBeenCalledWith(false);
        expect(state.items).toHaveLength(1);
        expect(state.items[0].id).toBe("prod_1");
        expect(state.loading).toBe(false);
        expect(state.error).toBeNull();
      });

      it("sets error on rejected", async () => {
        const store = createStore();
        const apiModule = await import("../../utils/api");
        vi.mocked(apiModule.api.cleanupProducts).mockRejectedValue(
          new Error("boom"),
        );

        await store.dispatch(cleanupProducts());

        const state = store.getState().products;
        expect(state.loading).toBe(false);
        expect(state.error).toBe("boom");
      });
    });

    describe("abort handling (review I13)", () => {
      // When the user types fast in a search box, the slice used to commit
      // every resolved result in arrival order. Network reordering meant a
      // slow stale fetch could land AFTER the fresh one and overwrite it
      // (the "lagging keystroke" footgun). Now createAsyncThunk forwards an
      // AbortSignal and the rejected reducer special-cases meta.aborted so
      // the slice stays on the freshest result.

      it("ignores aborted fetchProducts results in the rejected reducer", async () => {
        const store = createStore();
        const apiModule = await import("../../utils/api");
        // First call simulates a slow request that gets aborted mid-flight.
        const aborted = new Error("aborted");
        aborted.name = "AbortError";
        vi.mocked(apiModule.api.getProducts).mockRejectedValueOnce(aborted);

        const promise = store.dispatch(fetchProducts({ search: "old" }));
        promise.abort();
        await promise;

        const state = store.getState().products;
        // The slice MUST NOT have set state.error from the aborted fetch.
        expect(state.error).toBeNull();
      });

      it("forwards AbortSignal to api.getProducts", async () => {
        const store = createStore();
        const apiModule = await import("../../utils/api");
        const getSpy = vi.mocked(apiModule.api.getProducts).mockResolvedValue({
          products: [],
          hasMore: false,
          lastId: undefined,
          totalCount: 0,
        });
        await store.dispatch(fetchProducts({ search: "honey" }));
        expect(getSpy).toHaveBeenCalled();
        const arg = getSpy.mock.calls[0][0];
        // The slice now passes a signal alongside the user params so axios
        // can cancel the underlying request when the thunk aborts.
        expect(arg?.signal).toBeDefined();
        expect((arg!.signal as AbortSignal).aborted).toBeDefined();
      });
    });
  });
});
