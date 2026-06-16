/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { Provider } from "react-redux";
import { configureStore } from "@reduxjs/toolkit";
import { MemoryRouter } from "react-router-dom";
import { OrdersPage } from "../OrdersPage";
import ordersReducer from "../../store/ordersSlice";
import type { IOrder } from "../../types";

const mockGetOrders = vi.fn();

vi.mock("../../utils/api", () => ({
  api: {
    getOrders: (...args: any[]) => mockGetOrders(...args),
  },
}));

const mockOrders: IOrder[] = [
  {
    id: "cs_test_1",
    created: 1700000000,
    customerEmail: "alice@example.com",
    customerName: "Alice",
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
  },
  {
    id: "cs_test_2",
    created: 1700000001,
    customerEmail: "bob@example.com",
    customerName: "Bob",
    customerPhone: "555-0100",
    amountTotal: 3000,
    amountSubtotal: 3000,
    currency: "usd",
    status: "complete",
    paymentStatus: "paid",
    mode: "payment",
    metadata: { order_ref: "ORD-001" },
    url: null,
    orderStatus: null,
    description: null,
    shippingAddress: null,
  },
];

function createStore(preloadedState?: any) {
  return configureStore({
    reducer: { orders: ordersReducer },
    preloadedState: preloadedState || {
      orders: {
        items: [],
        loading: false,
        error: null,
        selectedOrder: null,
        selectedOrderLineItems: [],
        hasMore: false,
        lastId: null,
        totalCount: 0,
        lastFetchParams: null,
      },
    },
  } as any);
}

function renderWithProviders(
  ui: React.ReactElement,
  {
    store,
    initialEntries = ["/orders"],
  }: { store?: any; initialEntries?: string[] } = {},
) {
  const defaultStore = createStore();
  return render(
    <Provider store={store || defaultStore}>
      <MemoryRouter initialEntries={initialEntries}>{ui}</MemoryRouter>
    </Provider>,
  );
}

describe("OrdersPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    mockGetOrders.mockResolvedValue({
      orders: [],
      hasMore: false,
      lastId: undefined,
      totalCount: 0,
    });
  });

  it("renders loading spinner when no orders and loading", () => {
    const store = createStore({
      orders: {
        items: [],
        loading: true,
        error: null,
        selectedOrder: null,
        selectedOrderLineItems: [],
        hasMore: false,
        lastId: null,
        totalCount: 0,
        lastFetchParams: null,
      },
    });
    renderWithProviders(<OrdersPage />, { store });
    expect(document.querySelector(".animate-spin")).toBeInTheDocument();
  });

  it("renders empty state when no orders", async () => {
    const store = createStore({
      orders: {
        items: [],
        loading: false,
        error: null,
        selectedOrder: null,
        selectedOrderLineItems: [],
        hasMore: false,
        lastId: null,
        totalCount: 0,
        lastFetchParams: null,
      },
    });
    renderWithProviders(<OrdersPage />, { store });

    expect(await screen.findByText("No orders found")).toBeInTheDocument();
  });

  it("renders order list with correct data", async () => {
    mockGetOrders.mockResolvedValue({
      orders: mockOrders,
      hasMore: false,
      lastId: "cs_test_2",
      totalCount: 2,
    });
    const store = createStore({
      orders: {
        items: mockOrders,
        loading: false,
        error: null,
        selectedOrder: null,
        selectedOrderLineItems: [],
        hasMore: false,
        lastId: null,
        totalCount: 2,
        lastFetchParams: null,
      },
    });
    renderWithProviders(<OrdersPage />, { store });

    const aliceElements = await screen.findAllByText("Alice");
    expect(aliceElements.length).toBeGreaterThanOrEqual(1);
    const bobElements = await screen.findAllByText("Bob");
    expect(bobElements.length).toBeGreaterThanOrEqual(1);
  });

  it("renders order count info", async () => {
    mockGetOrders.mockResolvedValue({
      orders: mockOrders,
      hasMore: false,
      lastId: "cs_test_2",
      totalCount: 2,
    });
    const store = createStore({
      orders: {
        items: [],
        loading: false,
        error: null,
        selectedOrder: null,
        selectedOrderLineItems: [],
        hasMore: false,
        lastId: null,
        totalCount: 0,
        lastFetchParams: null,
      },
    });
    renderWithProviders(<OrdersPage />, { store });

    expect(
      await screen.findByText(/Showing 2 of 2 orders/),
    ).toBeInTheDocument();
  });

  it("renders error message when API fails", async () => {
    mockGetOrders.mockRejectedValue(new Error("Failed to load orders"));
    const store = createStore({
      orders: {
        items: [],
        loading: false,
        error: null,
        selectedOrder: null,
        selectedOrderLineItems: [],
        hasMore: false,
        lastId: null,
        totalCount: 0,
        lastFetchParams: null,
      },
    });
    renderWithProviders(<OrdersPage />, { store });

    expect(
      await screen.findByText("Failed to load orders"),
    ).toBeInTheDocument();
  });

  it("shows load more button when hasMore is true", async () => {
    mockGetOrders.mockResolvedValue({
      orders: mockOrders,
      hasMore: true,
      lastId: "cs_test_2",
      totalCount: 10,
    });
    const store = createStore({
      orders: {
        items: [],
        loading: false,
        error: null,
        selectedOrder: null,
        selectedOrderLineItems: [],
        hasMore: false,
        lastId: null,
        totalCount: 0,
        lastFetchParams: null,
      },
    });
    renderWithProviders(<OrdersPage />, { store });

    expect(await screen.findByText("Load More Orders")).toBeInTheDocument();
  });

  it("renders search input", async () => {
    mockGetOrders.mockResolvedValue({
      orders: mockOrders,
      hasMore: false,
      lastId: "cs_test_2",
      totalCount: 2,
    });
    const store = createStore({
      orders: {
        items: [],
        loading: false,
        error: null,
        selectedOrder: null,
        selectedOrderLineItems: [],
        hasMore: false,
        lastId: null,
        totalCount: 0,
        lastFetchParams: null,
      },
    });
    renderWithProviders(<OrdersPage />, { store });

    expect(
      await screen.findByPlaceholderText(
        "Search by customer email, name, or order ID...",
      ),
    ).toBeInTheDocument();
  });

  it("renders status filter dropdown", async () => {
    mockGetOrders.mockResolvedValue({
      orders: mockOrders,
      hasMore: false,
      lastId: "cs_test_2",
      totalCount: 2,
    });
    const store = createStore({
      orders: {
        items: [],
        loading: false,
        error: null,
        selectedOrder: null,
        selectedOrderLineItems: [],
        hasMore: false,
        lastId: null,
        totalCount: 0,
        lastFetchParams: null,
      },
    });
    renderWithProviders(<OrdersPage />, { store });

    expect(
      await screen.findByLabelText("Filter by status"),
    ).toBeInTheDocument();
  });

  it("renders payment status filter dropdown", async () => {
    mockGetOrders.mockResolvedValue({
      orders: mockOrders,
      hasMore: false,
      lastId: "cs_test_2",
      totalCount: 2,
    });
    const store = createStore({
      orders: {
        items: [],
        loading: false,
        error: null,
        selectedOrder: null,
        selectedOrderLineItems: [],
        hasMore: false,
        lastId: null,
        totalCount: 0,
        lastFetchParams: null,
      },
    });
    renderWithProviders(<OrdersPage />, { store });

    expect(
      await screen.findByLabelText("Filter by payment status"),
    ).toBeInTheDocument();
  });

  it("renders order status filter dropdown", async () => {
    mockGetOrders.mockResolvedValue({
      orders: mockOrders,
      hasMore: false,
      lastId: "cs_test_2",
      totalCount: 2,
    });
    const store = createStore({
      orders: {
        items: [],
        loading: false,
        error: null,
        selectedOrder: null,
        selectedOrderLineItems: [],
        hasMore: false,
        lastId: null,
        totalCount: 0,
        lastFetchParams: null,
      },
    });
    renderWithProviders(<OrdersPage />, { store });

    expect(
      await screen.findByLabelText("Filter by order status"),
    ).toBeInTheDocument();
  });

  it("shows loading overlay when loading with existing orders", () => {
    mockGetOrders.mockResolvedValue({
      orders: mockOrders,
      hasMore: false,
      lastId: "cs_test_2",
      totalCount: 2,
    });
    const store = createStore({
      orders: {
        items: mockOrders,
        loading: true,
        error: null,
        selectedOrder: null,
        selectedOrderLineItems: [],
        hasMore: false,
        lastId: null,
        totalCount: 2,
        lastFetchParams: null,
      },
    });
    const { container } = renderWithProviders(<OrdersPage />, { store });

    const spinner = container.querySelector(".absolute.inset-0 .animate-spin");
    expect(spinner).toBeTruthy();
  });

  it("shows data-testid on root element", async () => {
    mockGetOrders.mockResolvedValue({
      orders: mockOrders,
      hasMore: false,
      lastId: "cs_test_2",
      totalCount: 2,
    });
    const store = createStore({
      orders: {
        items: [],
        loading: false,
        error: null,
        selectedOrder: null,
        selectedOrderLineItems: [],
        hasMore: false,
        lastId: null,
        totalCount: 0,
        lastFetchParams: null,
      },
    });
    renderWithProviders(<OrdersPage />, { store });

    expect(await screen.findByTestId("orders-page")).toBeInTheDocument();
  });
});
