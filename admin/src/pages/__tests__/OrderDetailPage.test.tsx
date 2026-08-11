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
  metadata: {
    order_ref: "ORD-001",
    order_status: "new",
    description: "Test order",
  },
  url: "https://checkout.stripe.com/cs_test_1",
  orderStatus: "new",
  description: "Test order",
  shippingAddress: null,
};

const mockLineItems: IOrderLineItem[] = [
  {
    id: "li_1",
    description: "Wildflower Honey",
    amountTotal: 1000,
    amountSubtotal: 1000,
    currency: "usd",
    quantity: 1,
    productId: null,
    imageUrls: [],
    price: { id: "price_1", unitAmount: 1000, currency: "usd" },
  },
  {
    id: "li_2",
    description: "Beeswax Candle",
    amountTotal: 1000,
    amountSubtotal: 1000,
    currency: "usd",
    quantity: 2,
    productId: null,
    imageUrls: [],
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

    expect(await screen.findByText("Edit Order")).toBeInTheDocument();
    expect(await screen.findByTestId("order-edit-dialog")).toBeInTheDocument();
    expect(
      await screen.findByTestId("order-edit-dialog_status-select"),
    ).toBeInTheDocument();
    expect(
      await screen.findByTestId("order-edit-dialog_description-input"),
    ).toBeInTheDocument();
    expect(
      await screen.findByTestId("order-edit-dialog_customer-name-input"),
    ).toBeInTheDocument();
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
    const orderNoMeta = {
      ...mockOrder,
      metadata: {},
      orderStatus: null,
      description: null,
    };
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

  it("displays order status in the status card", async () => {
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

    expect(await screen.findByText("Order Status")).toBeInTheDocument();
    expect(await screen.findByText("New")).toBeInTheDocument();
  });

  it("displays description section when description is present", async () => {
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
      await screen.findByTestId("order-detail-page_description"),
    ).toBeInTheDocument();
    expect(
      (await screen.findAllByText("Test order")).length,
    ).toBeGreaterThanOrEqual(1);
  });

  describe("OrderEditDialog handleSave (review I3)", () => {
    /**
     * The dialog used to always emit `collected_information.shipping_details`
     * regardless of whether the form's address fields were populated, and it
     * spliced ad-hoc `address_*` keys into metadata. When an admin cleared the
     * address, the old metadata keys lingered (silent state inconsistency).
     * Plan I3: only emit collected_information when shipping is COMPLETE, and
     * drop the address_* metadata keys when shipping is cleared.
     */

    function buildEditState(order: IOrder) {
      return {
        orders: {
          items: [],
          loading: false,
          error: null,
          selectedOrder: order,
          selectedOrderLineItems: mockLineItems,
          hasMore: false,
          lastId: null,
          totalCount: 0,
          lastFetchParams: null,
        },
      };
    }

    it("only sends collected_information when shipping is COMPLETE (line1 + country)", async () => {
      mockUpdateOrder.mockResolvedValueOnce(mockOrder);
      const orderWithShipping: IOrder = {
        ...mockOrder,
        shippingAddress: {
          line1: "1 Main",
          line2: null,
          city: "SF",
          state: "CA",
          postalCode: "94000",
          country: "US",
        },
      };
      mockGetOrderById.mockResolvedValueOnce({
        order: orderWithShipping,
        lineItems: mockLineItems,
      });
      const store = createStore(buildEditState(orderWithShipping));
      renderWithProviders(<OrderDetailPage />, {
        store,
        initialEntries: ["/orders/cs_test_1/edit"],
      });
      await screen.findByTestId("order-edit-dialog");
      const saveBtn = await screen.findByTestId("order-edit-dialog_save-btn");
      const { fireEvent } = await import("@testing-library/react");
      fireEvent.click(saveBtn);
      await new Promise((r) => setTimeout(r, 0));
      expect(mockUpdateOrder).toHaveBeenCalledTimes(1);
      const [id, data] = mockUpdateOrder.mock.calls[0];
      expect(id).toBe("cs_test_1");
      expect(data.collected_information).toBeDefined();
      expect(data.collected_information.shipping_details.address.line1).toBe(
        "1 Main",
      );
      expect(data.collected_information.shipping_details.address.country).toBe(
        "US",
      );
    });

    it("omits collected_information AND address_* metadata keys when shipping is blank", async () => {
      mockUpdateOrder.mockResolvedValueOnce(mockOrder);
      // mockOrder.shippingAddress is null and form fields default to empty.
      const store = createStore(buildEditState(mockOrder));
      renderWithProviders(<OrderDetailPage />, {
        store,
        initialEntries: ["/orders/cs_test_1/edit"],
      });
      const saveBtn = await screen.findByTestId("order-edit-dialog_save-btn");
      const { fireEvent } = await import("@testing-library/react");
      fireEvent.click(saveBtn);
      await new Promise((r) => setTimeout(r, 0));
      const [, data] = mockUpdateOrder.mock.calls[0];
      expect(data.collected_information).toBeUndefined();
      // No address_* metadata keys should be emitted when address is blank.
      const addressKeys = Object.keys(data.metadata ?? {}).filter((k) =>
        k.startsWith("address_"),
      );
      expect(addressKeys).toEqual([]);
    });

    it("drops stale address_* metadata when admin clears the form", async () => {
      mockUpdateOrder.mockResolvedValueOnce(mockOrder);
      const orderWithStaleMeta: IOrder = {
        ...mockOrder,
        metadata: {
          ...mockOrder.metadata,
          address_line1: "old",
          address_city: "old-city",
          address_country: "US",
        },
        // No shippingAddress so form fields are blank by default.
        shippingAddress: null,
      };
      // The fetchOrderById refetch races the preloadedState — without pinning
      // the mock to also return the stale-meta order, the freshly fetched
      // mockOrder (no stale keys) would replace it and accidentally pass.
      mockGetOrderById.mockResolvedValueOnce({
        order: orderWithStaleMeta,
        lineItems: mockLineItems,
      });
      const store = createStore(buildEditState(orderWithStaleMeta));
      renderWithProviders(<OrderDetailPage />, {
        store,
        initialEntries: ["/orders/cs_test_1/edit"],
      });
      const saveBtn = await screen.findByTestId("order-edit-dialog_save-btn");
      const { fireEvent } = await import("@testing-library/react");
      fireEvent.click(saveBtn);
      await new Promise((r) => setTimeout(r, 0));
      const [, data] = mockUpdateOrder.mock.calls[0];
      const addressKeys = Object.keys(data.metadata ?? {}).filter((k) =>
        k.startsWith("address_"),
      );
      expect(addressKeys).toEqual([]);
    });

    it("payload satisfies OrderUpdateSchema and is rejected if it does not", async () => {
      // The handler runs OrderUpdateSchema.safeParse before dispatching.
      // The slice unpacks { id, ...data }, so we reconstruct the original
      // payload here to re-run the same validation the dialog already did.
      mockUpdateOrder.mockResolvedValueOnce(mockOrder);
      const store = createStore(buildEditState(mockOrder));
      renderWithProviders(<OrderDetailPage />, {
        store,
        initialEntries: ["/orders/cs_test_1/edit"],
      });
      const saveBtn = await screen.findByTestId("order-edit-dialog_save-btn");
      const { fireEvent } = await import("@testing-library/react");
      fireEvent.click(saveBtn);
      await new Promise((r) => setTimeout(r, 0));
      const [id, data] = mockUpdateOrder.mock.calls[0];
      const { OrderUpdateSchema } = await import("@bee-epic/shared");
      const parsed = OrderUpdateSchema.safeParse({ id, ...data });
      expect(parsed.success).toBe(true);
    });
  });

  describe("interactive handlers (review I8 coverage)", () => {
    // Detail-page button handlers — popup, copy, edit, close, back — all
    // declared inline. The detail page has unusually low function coverage
    // because these never fire in the existing render-output tests.

    function buildStore(order: IOrder = mockOrder) {
      return createStore({
        orders: {
          items: [],
          loading: false,
          error: null,
          selectedOrder: order,
          selectedOrderLineItems: mockLineItems,
          hasMore: false,
          lastId: null,
          totalCount: 0,
          lastFetchParams: null,
        },
      });
    }

    it("opens the order-id popup and closes it", async () => {
      const store = buildStore();
      renderWithProviders(<OrderDetailPage />, { store });
      const { fireEvent } = await import("@testing-library/react");
      const eyeBtns = await screen.findAllByLabelText(/Show full order ID/i);
      fireEvent.click(eyeBtns[0]);
      const popup = await screen.findByTestId(
        "order-detail-page_order-id-popup",
      );
      expect(popup).toBeTruthy();
      // Close by clicking the backdrop (outer div with onClick handler).
      fireEvent.click(popup);
    });

    it("dismisses the popup via the Close button", async () => {
      const store = buildStore();
      renderWithProviders(<OrderDetailPage />, { store });
      const { fireEvent } = await import("@testing-library/react");
      const eyeBtns = await screen.findAllByLabelText(/Show full order ID/i);
      fireEvent.click(eyeBtns[0]);
      const closeBtn = await screen.findByLabelText("Close");
      fireEvent.click(closeBtn);
    });

    it("copies the order ID via the popup copy button", async () => {
      // Stub navigator.clipboard (jsdom doesn't ship one).
      const writeText = vi.fn().mockResolvedValue(undefined);
      Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: { writeText },
      });
      const store = buildStore();
      renderWithProviders(<OrderDetailPage />, { store });
      const { fireEvent } = await import("@testing-library/react");
      const eyeBtns = await screen.findAllByLabelText(/Show full order ID/i);
      fireEvent.click(eyeBtns[0]);
      const copyBtn = await screen.findByTestId(
        "order-detail-page_order-id-popup_copy-btn",
      );
      fireEvent.click(copyBtn);
      await new Promise((r) => setTimeout(r, 0));
      expect(writeText).toHaveBeenCalledWith("cs_test_1");
    });

    it("clicks the Edit button to navigate to /edit", async () => {
      const store = buildStore();
      renderWithProviders(<OrderDetailPage />, { store });
      const { fireEvent } = await import("@testing-library/react");
      const editBtn = await screen.findByTestId(
        "order-detail-page_edit-button",
      );
      fireEvent.click(editBtn);
    });

    it("clicks the Back button on the header", async () => {
      const store = buildStore();
      renderWithProviders(<OrderDetailPage />, { store });
      const { fireEvent } = await import("@testing-library/react");
      const backBtn = await screen.findByTestId(
        "order-detail-page_back-button",
      );
      fireEvent.click(backBtn);
    });

    it("closes the edit dialog via Cancel", async () => {
      mockUpdateOrder.mockResolvedValueOnce(mockOrder);
      const store = buildStore();
      renderWithProviders(<OrderDetailPage />, {
        store,
        initialEntries: ["/orders/cs_test_1/edit"],
      });
      const { fireEvent } = await import("@testing-library/react");
      const cancelBtn = await screen.findByText("Cancel");
      fireEvent.click(cancelBtn);
    });

    it("typing into the form fields exercises the dialog's setState handlers", async () => {
      const store = buildStore();
      renderWithProviders(<OrderDetailPage />, {
        store,
        initialEntries: ["/orders/cs_test_1/edit"],
      });
      const { fireEvent } = await import("@testing-library/react");
      const status = (await screen.findByTestId(
        "order-edit-dialog_status-select",
      )) as HTMLSelectElement;
      fireEvent.change(status, { target: { value: "pending" } });
      const desc = (await screen.findByTestId(
        "order-edit-dialog_description-input",
      )) as HTMLTextAreaElement;
      fireEvent.change(desc, { target: { value: "Updated notes" } });
      const name = (await screen.findByTestId(
        "order-edit-dialog_customer-name-input",
      )) as HTMLInputElement;
      fireEvent.change(name, { target: { value: "Alice 2" } });
      const line1 = (await screen.findByTestId(
        "order-edit-dialog_address-line1-input",
      )) as HTMLInputElement;
      fireEvent.change(line1, { target: { value: "1 Main" } });
      const line2 = (await screen.findByTestId(
        "order-edit-dialog_address-line2-input",
      )) as HTMLInputElement;
      fireEvent.change(line2, { target: { value: "Apt 1" } });
      const city = (await screen.findByTestId(
        "order-edit-dialog_address-city-input",
      )) as HTMLInputElement;
      fireEvent.change(city, { target: { value: "SF" } });
      const stateInput = (await screen.findByTestId(
        "order-edit-dialog_address-state-input",
      )) as HTMLInputElement;
      fireEvent.change(stateInput, { target: { value: "CA" } });
      const postal = (await screen.findByTestId(
        "order-edit-dialog_address-postal-code-input",
      )) as HTMLInputElement;
      fireEvent.change(postal, { target: { value: "94000" } });
      const country = (await screen.findByTestId(
        "order-edit-dialog_address-country-input",
      )) as HTMLInputElement;
      fireEvent.change(country, { target: { value: "US" } });
      expect(status.value).toBe("pending");
      expect(country.value).toBe("US");
    });

    it("renders the order error fallback when error is set", () => {
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
      expect(screen.getByTestId("order-detail-page_error")).toBeTruthy();
    });
  });
});
