/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { Provider } from "react-redux";
import { configureStore } from "@reduxjs/toolkit";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { OrderDetailPage } from "../OrderDetailPage";
import ordersReducer from "../../store/ordersSlice";
import type { IOrder, IOrderLineItem } from "../../types";

const mockGetOrderById = vi.fn();
const mockUpdateOrder = vi.fn();

vi.mock("../../utils/api", () => ({
  api: {
    getOrderById: (...args: any[]) => mockGetOrderById(...args),
    updateOrder: (...args: any[]) => mockUpdateOrder(...args),
  },
}));

const mockOrder: IOrder = {
  id: "cs_test_1",
  created: 1700000000,
  customerEmail: "alice@example.com",
  customerName: "Alice",
  customerPhone: "555-0100",
  amountTotal: 2000,
  amountSubtotal: 2000,
  currency: "usd",
  status: "open",
  paymentStatus: "unpaid",
  mode: "payment",
  metadata: { order_ref: "ORD-001" },
  url: "https://checkout.stripe.com/cs_test_1",
};

const mockLineItems: IOrderLineItem[] = [
  {
    id: "li_1",
    description: "Wildflower Honey",
    amountTotal: 1000,
    amountSubtotal: 1000,
    currency: "usd",
    quantity: 1,
    price: { id: "price_1", unitAmount: 1000, currency: "usd" },
  },
  {
    id: "li_2",
    description: "Beeswax Candle",
    amountTotal: 1000,
    amountSubtotal: 1000,
    currency: "usd",
    quantity: 2,
    price: { id: "price_2", unitAmount: 500, currency: "usd" },
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
    initialEntries = ["/orders/cs_test_1"],
  }: { store?: any; initialEntries?: string[] } = {},
) {
  const defaultStore = createStore();
  return render(
    <Provider store={store || defaultStore}>
      <MemoryRouter initialEntries={initialEntries}>
        <Routes>
          <Route path="/orders/:id" element={ui} />
          <Route path="/orders/:id/edit" element={ui} />
        </Routes>
      </MemoryRouter>
    </Provider>,
  );
}

describe("OrderDetailPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetOrderById.mockResolvedValue({
      order: mockOrder,
      lineItems: mockLineItems,
    });
  });

  it("renders loading spinner initially", () => {
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
    renderWithProviders(<OrderDetailPage />, { store });
    expect(document.querySelector(".animate-spin")).toBeInTheDocument();
  });

  it("renders error state when error is present", () => {
    const store = createStore({
      orders: {
        items: [],
        loading: false,
        error: "Order not found",
        selectedOrder: null,
        selectedOrderLineItems: [],
        hasMore: false,
        lastId: null,
        totalCount: 0,
        lastFetchParams: null,
      },
    });
    renderWithProviders(<OrderDetailPage />, { store });

    expect(screen.getByText("Order Not Found")).toBeInTheDocument();
    expect(
      screen.getByText("The requested order could not be loaded."),
    ).toBeInTheDocument();
  });

  it("renders order details when order is loaded", async () => {
    const store = createStore({
      orders: {
        items: [],
        loading: false,
        error: null,
        selectedOrder: mockOrder,
        selectedOrderLineItems: mockLineItems,
        hasMore: false,
        lastId: null,
        totalCount: 0,
        lastFetchParams: null,
      },
    });
    renderWithProviders(<OrderDetailPage />, { store });

    expect(await screen.findByText("Order Items")).toBeInTheDocument();
    expect(await screen.findByText("Wildflower Honey")).toBeInTheDocument();
    expect(await screen.findByText("Beeswax Candle")).toBeInTheDocument();
    expect(await screen.findByText("Alice")).toBeInTheDocument();
    expect(await screen.findByText("alice@example.com")).toBeInTheDocument();
    expect(await screen.findByText("Order Metadata")).toBeInTheDocument();
  });

  it("renders data-testid on root element", async () => {
    const store = createStore({
      orders: {
        items: [],
        loading: false,
        error: null,
        selectedOrder: mockOrder,
        selectedOrderLineItems: mockLineItems,
        hasMore: false,
        lastId: null,
        totalCount: 0,
        lastFetchParams: null,
      },
    });
    renderWithProviders(<OrderDetailPage />, { store });
    expect(await screen.findByTestId("order-detail-page")).toBeInTheDocument();
  });

  it("shows edit dialog when on /orders/:id/edit route", async () => {
    const store = createStore({
      orders: {
        items: [],
        loading: false,
        error: null,
        selectedOrder: mockOrder,
        selectedOrderLineItems: mockLineItems,
        hasMore: false,
        lastId: null,
        totalCount: 0,
        lastFetchParams: null,
      },
    });
    renderWithProviders(<OrderDetailPage />, {
      store,
      initialEntries: ["/orders/cs_test_1/edit"],
    });

    expect(await screen.findByText("Edit Order Metadata")).toBeInTheDocument();
    expect(await screen.findByTestId("order-edit-dialog")).toBeInTheDocument();
  });

  it("shows checkout URL button when order has URL", async () => {
    const store = createStore({
      orders: {
        items: [],
        loading: false,
        error: null,
        selectedOrder: mockOrder,
        selectedOrderLineItems: mockLineItems,
        hasMore: false,
        lastId: null,
        totalCount: 0,
        lastFetchParams: null,
      },
    });
    renderWithProviders(<OrderDetailPage />, { store });

    expect(
      await screen.findByTestId("order-detail-page_checkout-link"),
    ).toBeInTheDocument();
  });

  it("does not show checkout URL button when order URL is null", () => {
    const orderNoUrl = { ...mockOrder, url: null };
    const store = createStore({
      orders: {
        items: [],
        loading: false,
        error: null,
        selectedOrder: orderNoUrl,
        selectedOrderLineItems: mockLineItems,
        hasMore: false,
        lastId: null,
        totalCount: 0,
        lastFetchParams: null,
      },
    });
    renderWithProviders(<OrderDetailPage />, { store });

    expect(
      screen.queryByTestId("order-detail-page_checkout-link"),
    ).not.toBeInTheDocument();
  });

  it("does not show metadata section when metadata is empty", () => {
    const orderNoMeta = { ...mockOrder, metadata: {} };
    const store = createStore({
      orders: {
        items: [],
        loading: false,
        error: null,
        selectedOrder: orderNoMeta,
        selectedOrderLineItems: mockLineItems,
        hasMore: false,
        lastId: null,
        totalCount: 0,
        lastFetchParams: null,
      },
    });
    renderWithProviders(<OrderDetailPage />, { store });

    expect(screen.queryByText("Order Metadata")).not.toBeInTheDocument();
  });
});
