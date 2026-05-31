import { describe, it, expect, vi, beforeEach } from "vitest";
import { configureStore } from "@reduxjs/toolkit";
import ordersReducer, {
  fetchOrders,
  fetchOrderById,
  updateOrder,
  setSelectedOrder,
  clearOrdersError,
  clearOrders,
} from "../ordersSlice";
import type { IOrder } from "../../types";

vi.mock("../../utils/api", () => ({
  api: {
    getOrders: vi.fn(),
    getOrderById: vi.fn(),
    updateOrder: vi.fn(),
  },
}));

function createStore() {
  return configureStore({
    reducer: { orders: ordersReducer },
  });
}

const mockOrder: IOrder = {
  id: "cs_test_1",
  created: 1700000000,
  customerEmail: "test@example.com",
  customerName: "Test User",
  customerPhone: null,
  amountTotal: 2000,
  amountSubtotal: 2000,
  currency: "usd",
  status: "open",
  paymentStatus: "unpaid",
  mode: "payment",
  metadata: {},
  url: "https://checkout.stripe.com/cs_test_1",
  orderStatus: null,
  description: null,
  shippingAddress: null,
};

describe("ordersSlice", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("reducers", () => {
    it("setSelectedOrder sets the selected order", () => {
      const store = createStore();
      store.dispatch(setSelectedOrder(mockOrder));
      expect(store.getState().orders.selectedOrder).toEqual(mockOrder);
    });

    it("setSelectedOrder clears selected order and line items with null", () => {
      const store = createStore();
      store.dispatch(setSelectedOrder(mockOrder));
      store.dispatch(setSelectedOrder(null));
      const state = store.getState().orders;
      expect(state.selectedOrder).toBeNull();
      expect(state.selectedOrderLineItems).toEqual([]);
    });

    it("clearOrdersError clears error", () => {
      const store = createStore();
      store.dispatch(clearOrdersError());
      expect(store.getState().orders.error).toBeNull();
    });

    it("clearOrders resets order list state", () => {
      const store = createStore();
      store.dispatch(clearOrders());
      const state = store.getState().orders;
      expect(state.items).toEqual([]);
      expect(state.hasMore).toBe(false);
      expect(state.lastId).toBeNull();
      expect(state.totalCount).toBe(0);
      expect(state.lastFetchParams).toBeNull();
    });
  });

  describe("async thunks", () => {
    describe("fetchOrders", () => {
      it("sets loading and items on fulfilled", async () => {
        const store = createStore();
        const apiModule = await import("../../utils/api");
        vi.mocked(apiModule.api.getOrders).mockResolvedValue({
          orders: [mockOrder],
          hasMore: false,
          lastId: "cs_test_1",
          totalCount: 1,
        });

        await store.dispatch(fetchOrders({ limit: 10 }));
        const state = store.getState().orders;
        expect(state.loading).toBe(false);
        expect(state.items).toEqual([mockOrder]);
        expect(state.hasMore).toBe(false);
        expect(state.totalCount).toBe(1);
      });

      it("sets error on rejected", async () => {
        const store = createStore();
        const apiModule = await import("../../utils/api");
        vi.mocked(apiModule.api.getOrders).mockRejectedValue(
          new Error("Network error"),
        );

        await store.dispatch(fetchOrders({ limit: 10 }));
        const state = store.getState().orders;
        expect(state.loading).toBe(false);
        expect(state.error).toBe("Network error");
      });

      it("appends orders on load more (starting_after)", async () => {
        const store = createStore();
        const apiModule = await import("../../utils/api");
        vi.mocked(apiModule.api.getOrders).mockResolvedValue({
          orders: [mockOrder],
          hasMore: true,
          lastId: "cs_test_1",
          totalCount: 2,
        });

        await store.dispatch(fetchOrders({ limit: 10 }));

        const nextOrder = {
          ...mockOrder,
          id: "cs_test_2",
        };
        vi.mocked(apiModule.api.getOrders).mockResolvedValue({
          orders: [nextOrder],
          hasMore: false,
          lastId: "cs_test_2",
          totalCount: 2,
        });

        await store.dispatch(
          fetchOrders({ limit: 10, starting_after: "cs_test_1" }),
        );
        const state = store.getState().orders;
        expect(state.items).toHaveLength(2);
        expect(state.items[0].id).toBe("cs_test_1");
        expect(state.items[1].id).toBe("cs_test_2");
      });

      it("deduplicates orders on load more", async () => {
        const store = createStore();
        const apiModule = await import("../../utils/api");
        vi.mocked(apiModule.api.getOrders).mockResolvedValue({
          orders: [mockOrder],
          hasMore: true,
          lastId: "cs_test_1",
          totalCount: 1,
        });

        await store.dispatch(fetchOrders({ limit: 10 }));

        vi.mocked(apiModule.api.getOrders).mockResolvedValue({
          orders: [mockOrder],
          hasMore: false,
          lastId: "cs_test_1",
          totalCount: 1,
        });

        await store.dispatch(
          fetchOrders({ limit: 10, starting_after: "cs_test_1" }),
        );
        const state = store.getState().orders;
        expect(state.items).toHaveLength(1);
      });

      it("stores lastFetchParams", async () => {
        const store = createStore();
        const apiModule = await import("../../utils/api");
        vi.mocked(apiModule.api.getOrders).mockResolvedValue({
          orders: [mockOrder],
          hasMore: false,
          lastId: "cs_test_1",
          totalCount: 1,
        });

        await store.dispatch(fetchOrders({ search: "test", status: "open" }));
        const state = store.getState().orders;
        expect(state.lastFetchParams).toEqual({
          search: "test",
          status: "open",
        });
      });
    });

    describe("fetchOrderById", () => {
      it("sets loading and selectedOrder on fulfilled", async () => {
        const store = createStore();
        const apiModule = await import("../../utils/api");
        vi.mocked(apiModule.api.getOrderById).mockResolvedValue({
          order: mockOrder,
          lineItems: [],
        });

        await store.dispatch(fetchOrderById("cs_test_1"));
        const state = store.getState().orders;
        expect(state.loading).toBe(false);
        expect(state.selectedOrder).toEqual(mockOrder);
        expect(state.selectedOrderLineItems).toEqual([]);
      });

      it("sets error and clears selectedOrder on rejected", async () => {
        const store = createStore();
        const apiModule = await import("../../utils/api");
        vi.mocked(apiModule.api.getOrderById).mockRejectedValue(
          new Error("Not found"),
        );

        await store.dispatch(fetchOrderById("bad_id"));
        const state = store.getState().orders;
        expect(state.loading).toBe(false);
        expect(state.error).toBe("Not found");
        expect(state.selectedOrder).toBeNull();
        expect(state.selectedOrderLineItems).toEqual([]);
      });
    });

    describe("updateOrder", () => {
      it("updates selectedOrder and item in list on fulfilled", async () => {
        const store = createStore();
        const apiModule = await import("../../utils/api");
        vi.mocked(apiModule.api.getOrders).mockResolvedValue({
          orders: [mockOrder],
          hasMore: false,
          lastId: "cs_test_1",
          totalCount: 1,
        });

        await store.dispatch(fetchOrders({}));

        const updated = {
          ...mockOrder,
          metadata: {
            shipped: "true",
            order_status: "new",
            description: "Test",
          },
          orderStatus: "new",
          description: "Test",
        };
        vi.mocked(apiModule.api.updateOrder).mockResolvedValue(updated);

        await store.dispatch(
          updateOrder({
            id: "cs_test_1",
            metadata: {
              shipped: "true",
              order_status: "new",
              description: "Test",
            },
          }),
        );
        const state = store.getState().orders;
        expect(state.selectedOrder?.metadata.shipped).toBe("true");
        expect(state.selectedOrder?.orderStatus).toBe("new");
        expect(state.selectedOrder?.description).toBe("Test");
        expect(state.items[0].metadata.shipped).toBe("true");
      });

      it("sets error on rejected", async () => {
        const store = createStore();
        const apiModule = await import("../../utils/api");
        vi.mocked(apiModule.api.updateOrder).mockRejectedValue({
          response: { data: { error: "Update failed" } },
        });

        await store.dispatch(updateOrder({ id: "cs_test_1", metadata: {} }));
        const state = store.getState().orders;
        expect(state.loading).toBe(false);
        expect(state.error).toBe("Update failed");
      });

      it("sets fallback error on rejected without response", async () => {
        const store = createStore();
        const apiModule = await import("../../utils/api");
        vi.mocked(apiModule.api.updateOrder).mockRejectedValue(
          new Error("Server error"),
        );

        await store.dispatch(updateOrder({ id: "cs_test_1", metadata: {} }));
        const state = store.getState().orders;
        expect(state.loading).toBe(false);
        expect(state.error).toBe("Server error");
      });
    });
  });
});
