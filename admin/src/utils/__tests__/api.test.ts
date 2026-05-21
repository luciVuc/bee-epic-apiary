import { describe, it, expect, vi, beforeEach } from "vitest";
import axios from "axios";
import { api, updateApiBaseUrl } from "../api";
import { EProductCategory } from "../../types";

vi.mock("axios", () => {
  const mockAxios: any = vi.fn();
  mockAxios.defaults = { baseURL: "" };
  mockAxios.interceptors = {
    request: { use: vi.fn() },
    response: { use: vi.fn() },
  };
  mockAxios.request = vi.fn();
  mockAxios.get = vi.fn();
  mockAxios.post = vi.fn();
  mockAxios.put = vi.fn();
  mockAxios.delete = vi.fn();
  mockAxios.create = vi.fn(() => mockAxios);
  return { default: mockAxios, ...mockAxios, create: mockAxios.create };
});

vi.mock("../constants", () => ({
  SETTINGS_STORAGE_KEY: "beeEpicAdminSettings",
  DEFAULT_PRODUCT_IMAGE: "/default-product.png",
  DEFAULT_PRODUCT_THUMBNAIL: "/default-thumbnail.png",
}));

const mockedAxios = vi.mocked(axios);

function createMockResponse(data: any) {
  return { data };
}

describe("api", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  describe("getProducts", () => {
    it("fetches products and transforms the response", async () => {
      const stripeProduct = {
        id: "prod_1",
        name: "Honey",
        description: "Good honey",
        images: ["https://example.com/img.png"],
        metadata: { slug: "honey", category: "HONEY", inStock: "true" },
        default_price: { id: "price_1", unit_amount: 1000, recurring: null },
      };
      mockedAxios.get = vi.fn().mockResolvedValue(
        createMockResponse({
          data: [stripeProduct],
          has_more: false,
          total_count: 1,
        }),
      );

      const result = await api.getProducts({ limit: 10 });

      expect(mockedAxios.get).toHaveBeenCalledWith("/products", {
        params: {
          expand: ["data.default_price"],
          limit: 10,
          starting_after: undefined,
          search: undefined,
          category: undefined,
        },
      });
      expect(result.products).toHaveLength(1);
      expect(result.products[0].name).toBe("Honey");
      expect(result.hasMore).toBe(false);
      expect(result.lastId).toBe("prod_1");
      expect(result.totalCount).toBe(1);
    });

    it("handles empty data array", async () => {
      mockedAxios.get = vi
        .fn()
        .mockResolvedValue(
          createMockResponse({ data: [], has_more: false, total_count: 0 }),
        );

      const result = await api.getProducts();
      expect(result.products).toEqual([]);
      expect(result.lastId).toBeUndefined();
      expect(result.totalCount).toBe(0);
    });
  });

  describe("getProductsCount", () => {
    it("fetches product count with params", async () => {
      mockedAxios.get = vi
        .fn()
        .mockResolvedValue(createMockResponse({ total: 5 }));

      const result = await api.getProductsCount({
        search: "honey",
        category: "HONEY",
      });
      expect(result).toBe(5);
      expect(mockedAxios.get).toHaveBeenCalledWith("/products/count", {
        params: { search: "honey", category: "HONEY" },
      });
    });

    it("handles undefined params", async () => {
      mockedAxios.get = vi
        .fn()
        .mockResolvedValue(createMockResponse({ total: 0 }));

      const result = await api.getProductsCount({});
      expect(result).toBe(0);
    });
  });

  describe("getProductById", () => {
    it("fetches and transforms a single product", async () => {
      mockedAxios.get = vi.fn().mockResolvedValue(
        createMockResponse({
          id: "prod_1",
          name: "Honey",
          description: null,
          images: [],
          metadata: {},
        }),
      );

      const result = await api.getProductById("prod_1");
      expect(result.id).toBe("prod_1");
      expect(mockedAxios.get).toHaveBeenCalledWith("/products/prod_1", {
        params: { expand: ["default_price"] },
      });
    });
  });

  describe("createProduct", () => {
    it("creates a product with price", async () => {
      mockedAxios.post = vi
        .fn()
        .mockResolvedValueOnce(
          createMockResponse({ id: "prod_new", name: "New Product" }),
        )
        .mockResolvedValueOnce(createMockResponse({ id: "price_new" }));
      mockedAxios.put = vi.fn().mockResolvedValue(createMockResponse({}));
      mockedAxios.get = vi.fn().mockResolvedValueOnce(
        createMockResponse({
          id: "prod_new",
          name: "New Product",
          description: null,
          images: [],
          metadata: {},
        }),
      );

      const result = await api.createProduct({
        name: "New Product",
        slug: "new-product",
        description: "desc",
        price: 1999,
        category: EProductCategory.HONEY,
        imageUrls: ["https://example.com/img.png"],
        thumbnailUrls: [],
        inStock: true,
        featured: false,
        weight: "16 oz",
        tags: [],
      });

      expect(result.id).toBe("prod_new");
      expect(mockedAxios.post).toHaveBeenCalledTimes(2);
      expect(mockedAxios.put).toHaveBeenCalledTimes(1);
    });

    it("rolls back product if price creation fails", async () => {
      mockedAxios.post = vi
        .fn()
        .mockResolvedValueOnce(
          createMockResponse({ id: "prod_new", name: "New Product" }),
        )
        .mockRejectedValueOnce(new Error("Price creation failed"));
      mockedAxios.delete = vi.fn().mockResolvedValue(createMockResponse({}));

      await expect(
        api.createProduct({
          name: "New",
          slug: "new",
          description: "",
          price: 1999,
          category: EProductCategory.HONEY,
          imageUrls: [],
          thumbnailUrls: [],
          inStock: true,
          featured: false,
          weight: "",
          tags: [],
        }),
      ).rejects.toThrow("Price creation failed");

      expect(mockedAxios.delete).toHaveBeenCalledWith("/products/prod_new");
    });

    it("handles rollback delete failure gracefully", async () => {
      mockedAxios.post = vi
        .fn()
        .mockResolvedValueOnce(
          createMockResponse({ id: "prod_new", name: "New" }),
        )
        .mockRejectedValueOnce(new Error("fail"));
      mockedAxios.delete = vi
        .fn()
        .mockRejectedValueOnce(new Error("delete fail"));

      await expect(
        api.createProduct({
          name: "New",
          slug: "new",
          description: "",
          price: 1999,
          category: EProductCategory.HONEY,
          imageUrls: [],
          thumbnailUrls: [],
          inStock: true,
          featured: false,
          weight: "",
          tags: [],
        }),
      ).rejects.toThrow("fail");
    });

    it("creates subscription product with recurring interval", async () => {
      mockedAxios.post = vi
        .fn()
        .mockResolvedValueOnce(
          createMockResponse({ id: "prod_sub", name: "Subscription" }),
        )
        .mockResolvedValueOnce(createMockResponse({ id: "price_sub" }));
      mockedAxios.put = vi.fn().mockResolvedValue(createMockResponse({}));
      mockedAxios.get = vi.fn().mockResolvedValueOnce(
        createMockResponse({
          id: "prod_sub",
          name: "Subscription",
          description: null,
          images: [],
          metadata: {},
        }),
      );

      const result = await api.createProduct({
        name: "Subscription",
        slug: "sub",
        description: "Monthly sub",
        price: 999,
        category: EProductCategory.SUBSCRIPTIONS,
        imageUrls: [],
        thumbnailUrls: [],
        inStock: true,
        featured: false,
        weight: "",
        tags: [],
        recurringInterval: "month",
        recurringIntervalCount: 1,
      });

      expect(result.id).toBe("prod_sub");
    });
  });

  describe("updateProduct", () => {
    it("updates product fields and price", async () => {
      mockedAxios.put = vi.fn().mockResolvedValue(createMockResponse({}));
      mockedAxios.post = vi
        .fn()
        .mockResolvedValueOnce(createMockResponse({ id: "price_new" }));
      mockedAxios.get = vi.fn().mockResolvedValueOnce(
        createMockResponse({
          id: "prod_1",
          name: "Updated",
          description: null,
          images: [],
          metadata: {},
        }),
      );

      const result = await api.updateProduct("prod_1", {
        name: "Updated",
        price: 1500,
      });

      expect(result.id).toBe("prod_1");
      expect(mockedAxios.put).toHaveBeenCalledTimes(2);
      expect(mockedAxios.post).toHaveBeenCalledTimes(1);
    });

    it("does not create price if price is unchanged", async () => {
      mockedAxios.put = vi.fn().mockResolvedValue(createMockResponse({}));
      mockedAxios.get = vi.fn().mockResolvedValueOnce(
        createMockResponse({
          id: "prod_1",
          name: "Updated",
          description: null,
          images: [],
          metadata: {},
        }),
      );

      const result = await api.updateProduct("prod_1", { name: "Updated" });

      expect(result.id).toBe("prod_1");
      expect(mockedAxios.post).not.toHaveBeenCalled();
      expect(mockedAxios.put).toHaveBeenCalledTimes(1);
    });

    it("re-throws error when price update fails", async () => {
      mockedAxios.put = vi.fn().mockResolvedValue(createMockResponse({}));
      mockedAxios.post = vi
        .fn()
        .mockRejectedValueOnce(new Error("Stripe error"));

      await expect(
        api.updateProduct("prod_1", { price: 5000 }),
      ).rejects.toThrow("Stripe error");
    });
  });

  describe("deleteProduct", () => {
    it("deletes a product and returns its id", async () => {
      mockedAxios.delete = vi.fn().mockResolvedValue(createMockResponse({}));

      const result = await api.deleteProduct("prod_1");
      expect(result).toBe("prod_1");
      expect(mockedAxios.delete).toHaveBeenCalledWith("/products/prod_1");
    });
  });

  describe("getSettings", () => {
    it("fetches settings by type", async () => {
      mockedAxios.get = vi
        .fn()
        .mockResolvedValue(createMockResponse({ key: "value" }));

      const result = await api.getSettings<{ key: string }>("site");
      expect(result).toEqual({ key: "value" });
      expect(mockedAxios.get).toHaveBeenCalledWith("/settings/site");
    });
  });

  describe("saveSettings", () => {
    it("saves settings by type", async () => {
      mockedAxios.put = vi.fn().mockResolvedValue(createMockResponse({}));

      await api.saveSettings("site", { key: "value" });
      expect(mockedAxios.put).toHaveBeenCalledWith("/settings/site", {
        key: "value",
      });
    });
  });

  describe("updateApiBaseUrl", () => {
    it("updates axios baseURL", () => {
      updateApiBaseUrl("https://new-url.com");
      expect(axios.defaults.baseURL).toBe("https://new-url.com");
    });
  });
});
