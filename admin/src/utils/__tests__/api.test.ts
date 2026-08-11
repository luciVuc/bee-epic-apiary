/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from "vitest";
import axios from "axios";
import { api, ApiError, bindStore, __unbindStoreForTests } from "../api";
import { EProductCategory, EStaffRole } from "../../types";
import {
  EUserStatus,
  type IAuthPolicy,
  type IUserPublic,
} from "@bee-epic/shared";

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
  DEFAULT_PRODUCT_IMAGE: "/default-product.png",
  DEFAULT_PRODUCT_THUMBNAIL: "/default-thumbnail.png",
  DEFAULT_API_URL: "/api",
}));

// authSlice is mocked because api.ts statically imports `refresh` and
// `resetAuth` from it; the mock breaks the runtime module cycle in-test
// and lets us assert on the action-creator invocations.
const refreshActionType = { type: "auth/refresh" } as const;
const resetAuthActionType = { type: "auth/resetAuth" } as const;
vi.mock("../../store/authSlice", () => ({
  refresh: vi.fn(() => refreshActionType),
  resetAuth: vi.fn(() => resetAuthActionType),
}));

const mockedAxios = vi.mocked(axios);

/**
 * Task 10.12 — snapshot the request-interceptor mock's call count at module
 * load, BEFORE any `beforeEach(vi.clearAllMocks)` runs. This is the only
 * moment where we can prove the deleted `X-Dev-Email` interceptor is truly
 * gone: `api.ts`'s module side effects have already fired by the time this
 * top-level statement runs, so any `apiClient.interceptors.request.use(...)`
 * call would already be recorded here.
 */
const requestInterceptorCallsAtImport = (mockedAxios as any).interceptors
  .request.use.mock.calls.length;

function createMockResponse(data: any) {
  return { status: 200, data: { ok: true as const, data } };
}

/**
 * Mock a 204 No Content response — auth void handlers return this shape
 * (`jsonResponse({}, 204, ...)`), so axios sees `status: 204, data: ""`.
 * The `unwrapVoid` helper short-circuits on status 204 regardless of body.
 */
function createEmpty204Response() {
  return { status: 204, data: "" };
}

/**
 * Mock a 204 response that still carries a `{ok:true, data:null}` envelope —
 * `deleteUser` returns this shape. `unwrapVoid` short-circuits on status 204
 * before it looks at the body, so this is equivalent to the empty case.
 */
function createEnveloped204Response() {
  return { status: 204, data: { ok: true, data: null } };
}

describe("api", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  describe("getWhoami", () => {
    it("returns caller when authenticated", async () => {
      const caller = {
        email: "owner@test.com",
        role: EStaffRole.OWNER,
        via: "cookie" as const,
      };
      mockedAxios.get = vi
        .fn()
        .mockResolvedValue(createMockResponse({ caller }));

      const result = await api.getWhoami();
      expect(result.caller).toEqual(caller);
      expect(mockedAxios.get).toHaveBeenCalledWith("/whoami");
    });

    it("returns null caller when unauthenticated", async () => {
      mockedAxios.get = vi
        .fn()
        .mockResolvedValue(createMockResponse({ caller: null }));

      const result = await api.getWhoami();
      expect(result.caller).toBeNull();
    });
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
      // Price change now applies metadata + default_price in a SINGLE product
      // PUT (after minting the Price via POST /prices) so the update is atomic:
      // either the product update fully applies or nothing does. Previously this
      // was two separate PUTs, which could leave a product with new metadata but
      // a stale price on a mid-sequence failure.
      expect(mockedAxios.post).toHaveBeenCalledTimes(1);
      expect(mockedAxios.put).toHaveBeenCalledTimes(1);
      const [, putBody] = mockedAxios.put.mock.calls[0];
      expect(putBody).toMatchObject({
        name: "Updated",
        default_price: "price_new",
      });
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

  /* ------------------------------------------------------------------ */
  /* Phase 10.10 — auth + user-management surface                        */
  /* ------------------------------------------------------------------ */

  const sampleCaller = {
    email: "owner@test.com",
    role: EStaffRole.OWNER,
    via: "cookie" as const,
  };

  const sampleUser: IUserPublic = {
    schemaVersion: 1,
    email: "user@test.com",
    displayName: "User",
    role: EStaffRole.EMPLOYEE,
    status: EUserStatus.ACTIVE,
    createdAt: 1000,
    updatedAt: 1000,
    lastLoginAt: null,
    lastLoginIp: null,
  };

  const samplePolicy: IAuthPolicy = {
    schemaVersion: 1,
    minLength: 12,
    checkBreachCorpus: true,
    notifyOnPasswordChange: true,
    updatedAt: 1000,
    updatedBy: "owner@test.com",
  };

  describe("getWhoami (bootstrap flag)", () => {
    it("returns bootstrapAvailable when caller is null", async () => {
      mockedAxios.get = vi
        .fn()
        .mockResolvedValue(
          createMockResponse({ caller: null, bootstrapAvailable: true }),
        );

      const result = await api.getWhoami();
      expect(result.caller).toBeNull();
      expect(result.bootstrapAvailable).toBe(true);
    });
  });

  describe("login", () => {
    it("posts credentials and returns the caller", async () => {
      mockedAxios.post = vi
        .fn()
        .mockResolvedValue(createMockResponse({ caller: sampleCaller }));

      const result = await api.login({
        email: "owner@test.com",
        password: "hunter22hunter22",
      });
      expect(result).toEqual(sampleCaller);
      expect(mockedAxios.post).toHaveBeenCalledWith("/auth/login", {
        email: "owner@test.com",
        password: "hunter22hunter22",
      });
    });

    it("throws ApiError when the envelope is ok:false", async () => {
      mockedAxios.post = vi.fn().mockResolvedValue({
        data: { ok: false, error: { code: "INVALID_CREDENTIALS" } },
      });

      await expect(
        api.login({ email: "x@y.z", password: "bad" }),
      ).rejects.toBeInstanceOf(ApiError);
    });
  });

  describe("logout", () => {
    it("posts to /auth/logout and resolves on empty 204", async () => {
      mockedAxios.post = vi.fn().mockResolvedValue(createEmpty204Response());

      await expect(api.logout()).resolves.toBeUndefined();
      expect(mockedAxios.post).toHaveBeenCalledWith("/auth/logout");
    });

    it("resolves on enveloped 204 body ({ok:true, data:null})", async () => {
      mockedAxios.post = vi
        .fn()
        .mockResolvedValue(createEnveloped204Response());

      await expect(api.logout()).resolves.toBeUndefined();
    });
  });

  describe("refresh", () => {
    it("posts to /auth/refresh and resolves on empty 204", async () => {
      mockedAxios.post = vi.fn().mockResolvedValue(createEmpty204Response());

      await expect(api.refresh()).resolves.toBeUndefined();
      expect(mockedAxios.post).toHaveBeenCalledWith("/auth/refresh");
    });

    it("resolves on enveloped 204 body", async () => {
      mockedAxios.post = vi
        .fn()
        .mockResolvedValue(createEnveloped204Response());

      await expect(api.refresh()).resolves.toBeUndefined();
    });

    it("throws ApiError when refresh envelope is ok:false", async () => {
      mockedAxios.post = vi.fn().mockResolvedValue({
        data: { ok: false, error: { code: "UNAUTHORIZED" } },
      });

      await expect(api.refresh()).rejects.toBeInstanceOf(ApiError);
    });
  });

  describe("acceptInvite", () => {
    it("posts token + password and returns caller", async () => {
      mockedAxios.post = vi
        .fn()
        .mockResolvedValue(createMockResponse({ caller: sampleCaller }));

      const result = await api.acceptInvite({
        token: "tok-abc",
        password: "hunter22hunter22",
      });
      expect(result).toEqual(sampleCaller);
      expect(mockedAxios.post).toHaveBeenCalledWith("/auth/accept-invite", {
        token: "tok-abc",
        password: "hunter22hunter22",
      });
    });
  });

  describe("requestReset", () => {
    it("posts email to /auth/request-reset and resolves on empty 204", async () => {
      mockedAxios.post = vi.fn().mockResolvedValue(createEmpty204Response());

      await expect(
        api.requestReset({ email: "user@test.com" }),
      ).resolves.toBeUndefined();
      expect(mockedAxios.post).toHaveBeenCalledWith("/auth/request-reset", {
        email: "user@test.com",
      });
    });

    it("resolves on enveloped 204 body", async () => {
      mockedAxios.post = vi
        .fn()
        .mockResolvedValue(createEnveloped204Response());

      await expect(
        api.requestReset({ email: "user@test.com" }),
      ).resolves.toBeUndefined();
    });
  });

  describe("completeReset", () => {
    it("posts token + password to /auth/complete-reset and resolves on empty 204", async () => {
      mockedAxios.post = vi.fn().mockResolvedValue(createEmpty204Response());

      await expect(
        api.completeReset({
          token: "reset-tok",
          password: "hunter22hunter22",
        }),
      ).resolves.toBeUndefined();
      expect(mockedAxios.post).toHaveBeenCalledWith("/auth/complete-reset", {
        token: "reset-tok",
        password: "hunter22hunter22",
      });
    });

    it("resolves on enveloped 204 body", async () => {
      mockedAxios.post = vi
        .fn()
        .mockResolvedValue(createEnveloped204Response());

      await expect(
        api.completeReset({ token: "t", password: "hunter22hunter22" }),
      ).resolves.toBeUndefined();
    });
  });

  describe("changePassword", () => {
    it("posts current + new password and resolves on empty 204", async () => {
      mockedAxios.post = vi.fn().mockResolvedValue(createEmpty204Response());

      await expect(
        api.changePassword({
          currentPassword: "oldPass1234!",
          newPassword: "newPass1234!",
        }),
      ).resolves.toBeUndefined();
      expect(mockedAxios.post).toHaveBeenCalledWith("/auth/change-password", {
        currentPassword: "oldPass1234!",
        newPassword: "newPass1234!",
      });
    });

    it("resolves on enveloped 204 body", async () => {
      mockedAxios.post = vi
        .fn()
        .mockResolvedValue(createEnveloped204Response());

      await expect(
        api.changePassword({
          currentPassword: "oldPass1234!",
          newPassword: "newPass1234!",
        }),
      ).resolves.toBeUndefined();
    });
  });

  describe("bootstrapOwner", () => {
    it("posts email to /auth/bootstrap-owner and resolves on empty 204", async () => {
      mockedAxios.post = vi.fn().mockResolvedValue(createEmpty204Response());

      await expect(
        api.bootstrapOwner({ email: "owner@test.com" }),
      ).resolves.toBeUndefined();
      expect(mockedAxios.post).toHaveBeenCalledWith("/auth/bootstrap-owner", {
        email: "owner@test.com",
      });
    });

    it("resolves on enveloped 204 body", async () => {
      mockedAxios.post = vi
        .fn()
        .mockResolvedValue(createEnveloped204Response());

      await expect(
        api.bootstrapOwner({ email: "owner@test.com" }),
      ).resolves.toBeUndefined();
    });
  });

  describe("getAuthPolicy", () => {
    it("fetches and returns the policy", async () => {
      mockedAxios.get = vi
        .fn()
        .mockResolvedValue(createMockResponse(samplePolicy));

      const result = await api.getAuthPolicy();
      expect(result).toEqual(samplePolicy);
      expect(mockedAxios.get).toHaveBeenCalledWith("/settings/auth-policy");
    });
  });

  describe("putAuthPolicy", () => {
    it("puts the policy and returns the persisted copy", async () => {
      mockedAxios.put = vi
        .fn()
        .mockResolvedValue(createMockResponse(samplePolicy));

      const result = await api.putAuthPolicy(samplePolicy);
      expect(result).toEqual(samplePolicy);
      expect(mockedAxios.put).toHaveBeenCalledWith(
        "/settings/auth-policy",
        samplePolicy,
      );
    });
  });

  describe("listUsers", () => {
    it("unwraps { users } from the envelope", async () => {
      mockedAxios.get = vi
        .fn()
        .mockResolvedValue(createMockResponse({ users: [sampleUser] }));

      const result = await api.listUsers();
      expect(result).toEqual([sampleUser]);
      expect(mockedAxios.get).toHaveBeenCalledWith("/users");
    });
  });

  describe("inviteUser", () => {
    it("posts invite payload and returns the new user", async () => {
      mockedAxios.post = vi
        .fn()
        .mockResolvedValue(createMockResponse({ user: sampleUser }));

      const result = await api.inviteUser({
        email: "user@test.com",
        role: EStaffRole.EMPLOYEE,
        displayName: "User",
      });
      expect(result).toEqual(sampleUser);
      expect(mockedAxios.post).toHaveBeenCalledWith("/users/invite", {
        email: "user@test.com",
        role: EStaffRole.EMPLOYEE,
        displayName: "User",
      });
    });
  });

  describe("updateUser", () => {
    it("PUTs to /users/:email with the patch and returns the user", async () => {
      mockedAxios.put = vi
        .fn()
        .mockResolvedValue(createMockResponse({ user: sampleUser }));

      const result = await api.updateUser("user@test.com", {
        role: EStaffRole.MANAGER,
      });
      expect(result).toEqual(sampleUser);
      expect(mockedAxios.put).toHaveBeenCalledWith("/users/user%40test.com", {
        role: EStaffRole.MANAGER,
      });
    });
  });

  describe("deleteUser", () => {
    it("DELETEs /users/:email and resolves on empty 204", async () => {
      mockedAxios.delete = vi.fn().mockResolvedValue(createEmpty204Response());

      await expect(api.deleteUser("user@test.com")).resolves.toBeUndefined();
      expect(mockedAxios.delete).toHaveBeenCalledWith("/users/user%40test.com");
    });

    it("resolves on enveloped 204 body ({ok:true, data:null})", async () => {
      mockedAxios.delete = vi
        .fn()
        .mockResolvedValue(createEnveloped204Response());

      await expect(api.deleteUser("user@test.com")).resolves.toBeUndefined();
    });
  });

  describe("reinviteUser", () => {
    it("POSTs /users/:email/reinvite and resolves on empty 204", async () => {
      mockedAxios.post = vi.fn().mockResolvedValue(createEmpty204Response());

      await expect(api.reinviteUser("user@test.com")).resolves.toBeUndefined();
      expect(mockedAxios.post).toHaveBeenCalledWith(
        "/users/user%40test.com/reinvite",
      );
    });

    it("resolves on enveloped 204 body", async () => {
      mockedAxios.post = vi
        .fn()
        .mockResolvedValue(createEnveloped204Response());

      await expect(api.reinviteUser("user@test.com")).resolves.toBeUndefined();
    });
  });

  describe("updateMe", () => {
    it("PUTs display name to /users/me and returns the user", async () => {
      mockedAxios.put = vi
        .fn()
        .mockResolvedValue(createMockResponse({ user: sampleUser }));

      const result = await api.updateMe({ displayName: "New Name" });
      expect(result).toEqual(sampleUser);
      expect(mockedAxios.put).toHaveBeenCalledWith("/users/me", {
        displayName: "New Name",
      });
    });
  });
});

/* ---------------------------------------------------------------------- */
/* Task 10.9 — 401-refresh interceptor                                     */
/* ---------------------------------------------------------------------- */

/**
 * The interceptor was registered when `api.ts` was imported at the top of
 * this file, so the reject handler lives in `interceptors.response.use
 * .mock.calls[0][1]`. Capture it once — `vi.clearAllMocks()` in `beforeEach`
 * would otherwise wipe the call history after the first interceptor test.
 */
const rejectHandler: (err: any) => Promise<any> = (() => {
  const calls = (mockedAxios as any).interceptors.response.use.mock.calls;
  const lastCall = calls[calls.length - 1];
  return lastCall[1];
})();

/** Build a synthetic 401 AxiosError with the given request config. */
function make401(config: any = { url: "/products" }): any {
  return { response: { status: 401 }, config, isAxiosError: true };
}

/**
 * Minimal mock store the interceptor can drive. `dispatch` returns a Promise
 * whose resolution mirrors what the real RTK thunk would do — a subclass of
 * the mock can override `dispatchImpl` to simulate refresh success/failure.
 */
function makeMockStore(opts?: {
  onRefreshDispatch?: (state: {
    auth: { refreshInFlight: boolean; caller: unknown };
  }) => Promise<void>;
}) {
  const state = {
    auth: { refreshInFlight: false, caller: null as unknown },
  };
  const listeners: Array<() => void> = [];
  const notify = () => listeners.slice().forEach((l) => l());
  const dispatch = vi.fn((action: any) => {
    // Simulate the refresh thunk lifecycle.
    if (action && action.type === "auth/refresh") {
      state.auth.refreshInFlight = true;
      notify();
      const done = (opts?.onRefreshDispatch ?? (async () => {}))(state);
      return done.then(() => {
        state.auth.refreshInFlight = false;
        notify();
      });
    }
    return action;
  });
  return {
    state,
    dispatch,
    getState: () => state,
    subscribe: (l: () => void) => {
      listeners.push(l);
      return () => {
        const idx = listeners.indexOf(l);
        if (idx >= 0) listeners.splice(idx, 1);
      };
    },
    notify,
  };
}

describe("api — 401 refresh interceptor (Task 10.9)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    __unbindStoreForTests();
  });

  it("refreshes and re-issues the original request when a non-auth URL 401s", async () => {
    const store = makeMockStore({
      onRefreshDispatch: async (state) => {
        // Refresh succeeded: the server rotated the cookie → caller stays.
        state.auth.caller = { email: "owner@test.com" };
      },
    });
    bindStore(store as any);

    const config = { url: "/products", method: "get" };
    (mockedAxios as any).request = vi
      .fn()
      .mockResolvedValue({ status: 200, data: { ok: true, data: [] } });

    const reject = rejectHandler;
    await reject(make401(config));

    // Refresh was dispatched exactly once.
    const refreshCalls = store.dispatch.mock.calls.filter(
      (c) => c[0]?.type === "auth/refresh",
    );
    expect(refreshCalls).toHaveLength(1);
    // The original request was re-issued via apiClient.request with the
    // marker set.
    expect((mockedAxios as any).request).toHaveBeenCalledTimes(1);
    const retriedConfig = (mockedAxios as any).request.mock.calls[0][0];
    expect(retriedConfig.url).toBe("/products");
    // Marker is a Symbol — grab it dynamically off the config to confirm
    // some own-symbol property was set.
    const symbols = Object.getOwnPropertySymbols(retriedConfig);
    expect(symbols.length).toBeGreaterThan(0);
    expect(retriedConfig[symbols[0]]).toBe(true);
  });

  it("passes 401s from /auth/* URLs through without dispatching refresh", async () => {
    const store = makeMockStore();
    bindStore(store as any);

    const reject = rejectHandler;
    await expect(reject(make401({ url: "/auth/login" }))).rejects.toBeDefined();

    const refreshCalls = store.dispatch.mock.calls.filter(
      (c) => c[0]?.type === "auth/refresh",
    );
    expect(refreshCalls).toHaveLength(0);
  });

  it("passes non-401 errors through untouched", async () => {
    const store = makeMockStore();
    bindStore(store as any);

    const reject = rejectHandler;
    const err = { response: { status: 500 }, config: { url: "/products" } };
    await expect(reject(err)).rejects.toBe(err);
    expect(store.dispatch).not.toHaveBeenCalled();
  });

  it("coalesces two concurrent 401s into a single refresh call", async () => {
    // Manual control over when refresh resolves so we can inject the second
    // 401 while refreshInFlight is still true.
    let resolveRefresh!: () => void;
    const refreshDone = new Promise<void>((r) => {
      resolveRefresh = r;
    });
    const store = makeMockStore({
      onRefreshDispatch: async (state) => {
        await refreshDone;
        state.auth.caller = { email: "owner@test.com" };
      },
    });
    bindStore(store as any);

    (mockedAxios as any).request = vi
      .fn()
      .mockResolvedValue({ status: 200, data: { ok: true, data: null } });

    const reject = rejectHandler;
    const first = reject(make401({ url: "/products", method: "get" }));
    // Wait until refreshInFlight flips to true. The interceptor performs
    // a dynamic module load / dispatch before flipping the flag; polling
    // is more robust than flushing a fixed number of microtasks.
    await vi.waitFor(() => {
      if (!store.state.auth.refreshInFlight) throw new Error("not yet");
    });
    const second = reject(make401({ url: "/orders", method: "get" }));

    // Release refresh.
    resolveRefresh();
    await first;
    await second;

    const refreshCalls = store.dispatch.mock.calls.filter(
      (c) => c[0]?.type === "auth/refresh",
    );
    expect(refreshCalls).toHaveLength(1);
    // Both original requests were re-issued.
    expect((mockedAxios as any).request).toHaveBeenCalledTimes(2);
  });

  it("dispatches resetAuth and rejects the original error when refresh fails", async () => {
    const store = makeMockStore({
      onRefreshDispatch: async (state) => {
        // Refresh 'failed' — the real reducer clears caller on .rejected;
        // simulate the same terminal state here (caller stays null).
        state.auth.caller = null;
      },
    });
    bindStore(store as any);

    const reject = rejectHandler;
    const err = make401({ url: "/products" });
    await expect(reject(err)).rejects.toBe(err);

    const resetCalls = store.dispatch.mock.calls.filter(
      (c) => c[0]?.type === "auth/resetAuth",
    );
    expect(resetCalls).toHaveLength(1);
  });

  it("does not loop when a re-issued request also 401s (marker guard)", async () => {
    const store = makeMockStore({
      onRefreshDispatch: async (state) => {
        state.auth.caller = { email: "owner@test.com" };
      },
    });
    bindStore(store as any);

    // First re-issue succeeds, but we then feed a second 401 with the same
    // config (marker still set) back into the reject handler.
    (mockedAxios as any).request = vi
      .fn()
      .mockResolvedValue({ status: 200, data: { ok: true, data: null } });

    const reject = rejectHandler;
    const config: any = { url: "/products", method: "get" };
    await reject(make401(config));

    // config now has the retry marker set. Re-fire the 401 handler with
    // the same config — the guard must reject synchronously without
    // dispatching another refresh.
    (mockedAxios as any).request.mockClear();
    await expect(reject(make401(config))).rejects.toBeDefined();

    const refreshCalls = store.dispatch.mock.calls.filter(
      (c) => c[0]?.type === "auth/refresh",
    );
    expect(refreshCalls).toHaveLength(1); // only from the first pass
    expect((mockedAxios as any).request).not.toHaveBeenCalled();
  });

  it("passes the 401 through untouched when no store is bound", async () => {
    // No bindStore() — simulates the (very early) window where the store
    // hasn't wired itself in yet.
    const reject = rejectHandler;
    const err = make401({ url: "/products" });
    await expect(reject(err)).rejects.toBe(err);
  });

  it("exports bindStore as a function", () => {
    expect(typeof bindStore).toBe("function");
  });
});

/* ---------------------------------------------------------------------- */
/* Task 10.12 — X-Dev-Email interceptor removed                            */
/* ---------------------------------------------------------------------- */

describe("api — X-Dev-Email header (removed in Phase 10)", () => {
  it("does not register any request interceptor at module load", () => {
    // The Phase 9 dev-mode interceptor that attached `X-Dev-Email` from
    // `VITE_DEV_EMAIL` was removed in Task 10.12: local dev now signs in
    // via `POST /auth/login` (cookie) or `Authorization: Bearer` for
    // scripted tests. `requestInterceptorCallsAtImport` was captured at
    // the top of this file BEFORE any `vi.clearAllMocks()` beforeEach
    // could wipe the mock's history, so it reflects the true side-effect
    // count from `api.ts`'s module init.
    expect(requestInterceptorCallsAtImport).toBe(0);
  });
});
