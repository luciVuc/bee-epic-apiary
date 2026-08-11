import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Provider } from "react-redux";
import { configureStore } from "@reduxjs/toolkit";
import { MemoryRouter } from "react-router-dom";
import authReducer from "../../../store/authSlice";
import { AdminNavbar } from "../AdminNavbar";
import { ThemeProvider } from "../../../hooks/useTheme";
import {
  PRODUCT_UPDATED_EVENT,
  PRODUCT_DELETED_EVENT,
  ORDER_STATUS_CHANGED_EVENT,
} from "../../../utils/constants";

const mockGetSettings = vi.fn();
const mockGetOrders = vi.fn();
const mockNavigate = vi.fn();

// Mutable caller state so individual tests can simulate authenticated vs
// unauthenticated (and transitions between them, for SSE reconnect tests).
let mockCaller: { email: string; role: string } | null = {
  email: "owner@test",
  role: "OWNER",
};

vi.mock("../../../utils/api", () => ({
  api: {
    getSettings: (...args: unknown[]) => mockGetSettings(...args),
    getOrders: (...args: unknown[]) => mockGetOrders(...args),
  },
}));

vi.mock("../../../hooks/useCaller", () => ({
  useCaller: () => ({
    caller: mockCaller,
    status: "succeeded",
    error: null,
    refetch: vi.fn(),
  }),
}));

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

function renderWithRouter(ui: React.ReactElement) {
  // UserMenu (now embedded in AdminNavbar) uses useDispatch, so wrap in a
  // Provider even though existing AdminNavbar assertions don't hit the store.
  const store = configureStore({ reducer: { auth: authReducer } });
  return render(
    <MemoryRouter>
      <Provider store={store}>
        <ThemeProvider>{ui}</ThemeProvider>
      </Provider>
    </MemoryRouter>,
  );
}

describe("AdminNavbar", () => {
  beforeEach(() => {
    mockCaller = { email: "owner@test", role: "OWNER" };
    (
      globalThis.EventSource as unknown as { instanceCount: number }
    ).instanceCount = 0;
    (
      globalThis.EventSource as unknown as { lastInstance: unknown }
    ).lastInstance = null;
    mockGetOrders.mockResolvedValue({
      orders: [],
      hasMore: false,
      lastId: null,
      totalCount: 0,
    });
    mockGetSettings.mockResolvedValue({});
  });

  it("renders fallback title while loading, then business name from API", async () => {
    mockGetSettings.mockResolvedValue({ businessName: "Test Apiary" });
    renderWithRouter(<AdminNavbar />);

    expect(screen.getAllByText("Admin").length).toBeGreaterThanOrEqual(1);

    await waitFor(() => {
      const titles = screen.getAllByText("Test Apiary Admin");
      expect(titles.length).toBe(2);
    });
    expect(mockGetSettings).toHaveBeenCalledWith("site");
  });

  it("renders notification bell button", () => {
    renderWithRouter(<AdminNavbar />);
    expect(
      screen.getByTestId("admin-navbar_notifications"),
    ).toBeInTheDocument();
  });

  it("calls onMenuClick when menu button is clicked", async () => {
    const user = userEvent.setup();
    const onMenuClick = vi.fn();
    renderWithRouter(<AdminNavbar onMenuClick={onMenuClick} />);
    const menuButton = screen.getByLabelText("Toggle navigation menu");
    await user.click(menuButton);
    expect(onMenuClick).toHaveBeenCalledTimes(1);
  });

  it("opens notifications panel when bell is clicked", async () => {
    const user = userEvent.setup();
    renderWithRouter(<AdminNavbar />);

    expect(screen.queryByTestId("notifications-panel")).not.toBeInTheDocument();

    const bellButton = screen.getByTestId("admin-navbar_notifications");
    await user.click(bellButton);

    expect(screen.getByTestId("notifications-panel")).toBeInTheDocument();
  });

  it("shows notification badge when there are new orders", async () => {
    mockGetOrders.mockResolvedValue({
      orders: [
        {
          id: "cs_test_1",
          created: 1000000,
          orderStatus: "New",
          customerEmail: "test@test.com",
          amountTotal: 2000,
          currency: "usd",
          customerName: null,
          customerPhone: null,
          amountSubtotal: 2000,
          status: "open",
          paymentStatus: "unpaid",
          mode: "payment",
          metadata: {},
          url: null,
          description: null,
          shippingAddress: null,
        },
      ],
      hasMore: false,
      lastId: "cs_test_1",
      totalCount: 1,
    });

    renderWithRouter(<AdminNavbar />);

    await waitFor(() => {
      expect(
        screen.getByTestId("admin-navbar_notification-badge"),
      ).toBeInTheDocument();
    });
  });

  it("hides notification badge when there are no new orders", async () => {
    renderWithRouter(<AdminNavbar />);

    await waitFor(() => {
      expect(
        screen.queryByTestId("admin-navbar_notification-badge"),
      ).not.toBeInTheDocument();
    });
  });

  it("closes notifications panel when close button is clicked", async () => {
    const user = userEvent.setup();
    renderWithRouter(<AdminNavbar />);

    const bellButton = screen.getByTestId("admin-navbar_notifications");
    await user.click(bellButton);
    expect(screen.getByTestId("notifications-panel")).toBeInTheDocument();

    const closeButton = screen.getByTestId("notifications-panel_close");
    await user.click(closeButton);

    await waitFor(() => {
      expect(
        screen.queryByTestId("notifications-panel"),
      ).not.toBeInTheDocument();
    });
  });

  it("navigates to order detail when notification is selected", async () => {
    mockGetOrders.mockResolvedValue({
      orders: [
        {
          id: "cs_test_1",
          created: 2000000,
          orderStatus: "New",
          customerEmail: "alice@test.com",
          customerName: "Alice",
          amountTotal: 2500,
          currency: "usd",
          customerPhone: null,
          amountSubtotal: 2500,
          status: "open",
          paymentStatus: "unpaid",
          mode: "payment",
          metadata: {},
          url: null,
          description: null,
          shippingAddress: null,
        },
      ],
      hasMore: false,
      lastId: "cs_test_1",
      totalCount: 1,
    });

    const user = userEvent.setup();
    renderWithRouter(<AdminNavbar />);

    const bellButton = screen.getByTestId("admin-navbar_notifications");
    await user.click(bellButton);

    await waitFor(() => {
      expect(
        screen.getByTestId("notifications-panel_item"),
      ).toBeInTheDocument();
    });

    const item = screen.getByTestId("notifications-panel_item");
    await user.click(item);

    expect(mockNavigate).toHaveBeenCalledWith("/orders/cs_test_1");
  });

  describe("SSE event handlers", () => {
    /**
     * Pull the most recently constructed MockEventSource (set in admin/src/test/setup.ts)
     * and dispatch a synthetic SSE message of the given type with the given JSON payload.
     */
    function dispatchSse(type: string, payload: unknown) {
      const EventSourceCtor = globalThis.EventSource as unknown as {
        lastInstance: { dispatchEvent: (e: Event) => boolean } | null;
      };
      const inst = EventSourceCtor.lastInstance;
      if (!inst)
        throw new Error("No MockEventSource instance has been constructed");
      // MessageEvent carries `data: string`; the navbar JSON.parse-s this.
      const evt = new MessageEvent(type, { data: JSON.stringify(payload) });
      inst.dispatchEvent(evt);
    }

    it("rebroadcasts product-updated SSE events as a window CustomEvent", async () => {
      renderWithRouter(<AdminNavbar />);
      // Wait for the EventSource to be constructed and 'connected' to fire (microtask).
      await waitFor(() => {
        expect(
          (globalThis.EventSource as unknown as { lastInstance: unknown })
            .lastInstance,
        ).not.toBeNull();
      });

      const listener = vi.fn();
      window.addEventListener(PRODUCT_UPDATED_EVENT, listener);
      try {
        dispatchSse("product-updated", {
          type: "product-updated",
          productId: "prod_42",
        });
        await waitFor(() => expect(listener).toHaveBeenCalled());
        const ce = listener.mock.calls[0][0] as CustomEvent;
        expect(ce.detail).toMatchObject({ productId: "prod_42" });
      } finally {
        window.removeEventListener(PRODUCT_UPDATED_EVENT, listener);
      }
    });

    it("rebroadcasts product-deleted SSE events as a window CustomEvent", async () => {
      renderWithRouter(<AdminNavbar />);
      await waitFor(() => {
        expect(
          (globalThis.EventSource as unknown as { lastInstance: unknown })
            .lastInstance,
        ).not.toBeNull();
      });

      const listener = vi.fn();
      window.addEventListener(PRODUCT_DELETED_EVENT, listener);
      try {
        dispatchSse("product-deleted", {
          type: "product-deleted",
          productId: "prod_42",
        });
        await waitFor(() => expect(listener).toHaveBeenCalled());
      } finally {
        window.removeEventListener(PRODUCT_DELETED_EVENT, listener);
      }
    });

    it("rebroadcasts order-status-changed SSE events and refetches notifications", async () => {
      renderWithRouter(<AdminNavbar />);
      await waitFor(() => {
        expect(
          (globalThis.EventSource as unknown as { lastInstance: unknown })
            .lastInstance,
        ).not.toBeNull();
      });
      // 'connected' fires once initially; we want to detect the refetch on order-status-changed.
      mockGetOrders.mockClear();

      const listener = vi.fn();
      window.addEventListener(ORDER_STATUS_CHANGED_EVENT, listener);
      try {
        dispatchSse("order-status-changed", {
          type: "order-status-changed",
          orderId: "cs_test_1",
          prevStatus: "new",
          nextStatus: "shipped",
        });
        await waitFor(() => expect(listener).toHaveBeenCalled());
        const ce = listener.mock.calls[0][0] as CustomEvent;
        expect(ce.detail).toMatchObject({ nextStatus: "shipped" });
        // Navbar refetched the notification list.
        await waitFor(() => expect(mockGetOrders).toHaveBeenCalled());
      } finally {
        window.removeEventListener(ORDER_STATUS_CHANGED_EVENT, listener);
      }
    });

    it("tolerates SSE events with malformed JSON payloads", async () => {
      renderWithRouter(<AdminNavbar />);
      await waitFor(() => {
        expect(
          (globalThis.EventSource as unknown as { lastInstance: unknown })
            .lastInstance,
        ).not.toBeNull();
      });

      const listener = vi.fn();
      window.addEventListener(PRODUCT_UPDATED_EVENT, listener);
      try {
        const EventSourceCtor = globalThis.EventSource as unknown as {
          lastInstance: { dispatchEvent: (e: Event) => boolean };
        };
        // Fire an event whose data isn't valid JSON. The handler should still rebroadcast.
        EventSourceCtor.lastInstance.dispatchEvent(
          new MessageEvent("product-updated", { data: "{not json" }),
        );
        await waitFor(() => expect(listener).toHaveBeenCalled());
        const ce = listener.mock.calls[0][0] as CustomEvent;
        expect(ce.detail).toBeNull();
      } finally {
        window.removeEventListener(PRODUCT_UPDATED_EVENT, listener);
      }
    });
  });

  describe("SSE credentials + health indicator (review I9)", () => {
    /**
     * The /notifications/stream endpoint is gated by the worker's
     * resolveCaller, which verifies the `bea_at` access-token cookie
     * (Phase 9 trust chain). EventSource must open with
     * `{ withCredentials: true }` or the cookie won't ride the handshake
     * and every SSE connection silently 401s.
     *
     * Health UI: the navbar exposes a small badge that reflects whether the
     * stream is connected, reconnecting, or down. Without it, a broken SSE
     * shows up as "notifications just stopped arriving" — confusing.
     */

    it("constructs EventSource with withCredentials: true", async () => {
      renderWithRouter(<AdminNavbar />);
      await waitFor(() => {
        const inst = (
          globalThis.EventSource as unknown as {
            lastInstance: { initOptions?: EventSourceInit } | null;
          }
        ).lastInstance;
        expect(inst).not.toBeNull();
        expect(inst?.initOptions?.withCredentials).toBe(true);
      });
    });

    it("renders a connected badge after the SSE opens", async () => {
      renderWithRouter(<AdminNavbar />);
      await waitFor(() => {
        expect(screen.getByTestId("admin-navbar_sse-health")).toHaveAttribute(
          "data-sse-health",
          "connected",
        );
      });
    });

    it("flips the badge to reconnecting on the first SSE error", async () => {
      renderWithRouter(<AdminNavbar />);
      await waitFor(() => {
        expect(
          (globalThis.EventSource as unknown as { lastInstance: unknown })
            .lastInstance,
        ).not.toBeNull();
      });
      const inst = (
        globalThis.EventSource as unknown as {
          lastInstance: { dispatchEvent: (e: Event) => boolean };
        }
      ).lastInstance;
      inst.dispatchEvent(new Event("error"));
      await waitFor(() => {
        expect(screen.getByTestId("admin-navbar_sse-health")).toHaveAttribute(
          "data-sse-health",
          "reconnecting",
        );
      });
    });

    it("flips the badge to down after repeated errors", async () => {
      renderWithRouter(<AdminNavbar />);
      await waitFor(() => {
        expect(
          (globalThis.EventSource as unknown as { lastInstance: unknown })
            .lastInstance,
        ).not.toBeNull();
      });
      const inst = (
        globalThis.EventSource as unknown as {
          lastInstance: { dispatchEvent: (e: Event) => boolean };
        }
      ).lastInstance;
      // Four consecutive errors → "down" (threshold: > 3).
      inst.dispatchEvent(new Event("error"));
      inst.dispatchEvent(new Event("error"));
      inst.dispatchEvent(new Event("error"));
      inst.dispatchEvent(new Event("error"));
      await waitFor(() => {
        expect(screen.getByTestId("admin-navbar_sse-health")).toHaveAttribute(
          "data-sse-health",
          "down",
        );
      });
    });

    it("returns to connected on the next 'connected' event after errors", async () => {
      renderWithRouter(<AdminNavbar />);
      await waitFor(() => {
        expect(
          (globalThis.EventSource as unknown as { lastInstance: unknown })
            .lastInstance,
        ).not.toBeNull();
      });
      const inst = (
        globalThis.EventSource as unknown as {
          lastInstance: { dispatchEvent: (e: Event) => boolean };
        }
      ).lastInstance;
      inst.dispatchEvent(new Event("error"));
      await waitFor(() => {
        expect(screen.getByTestId("admin-navbar_sse-health")).toHaveAttribute(
          "data-sse-health",
          "reconnecting",
        );
      });
      inst.dispatchEvent(new Event("connected"));
      await waitFor(() => {
        expect(screen.getByTestId("admin-navbar_sse-health")).toHaveAttribute(
          "data-sse-health",
          "connected",
        );
      });
    });
  });

  describe("SSE connection gating + reconnect", () => {
    it("does not open an EventSource until the caller is authenticated", async () => {
      mockCaller = null;
      renderWithRouter(<AdminNavbar />);

      // Give the mount effects a chance to run.
      await Promise.resolve();
      await new Promise((r) => setTimeout(r, 5));

      expect(
        (globalThis.EventSource as unknown as { instanceCount: number })
          .instanceCount,
      ).toBe(0);
    });

    it("opens an EventSource once a caller is present", async () => {
      mockCaller = { email: "owner@test", role: "OWNER" };
      renderWithRouter(<AdminNavbar />);

      await waitFor(() => {
        expect(
          (globalThis.EventSource as unknown as { instanceCount: number })
            .instanceCount,
        ).toBe(1);
      });
    });

    it("reconnects (opens a new EventSource) after a fatal error closes the stream", async () => {
      vi.useFakeTimers();
      try {
        mockCaller = { email: "owner@test", role: "OWNER" };
        renderWithRouter(<AdminNavbar />);

        // Initial connection.
        await vi.advanceTimersByTimeAsync(1);
        expect(
          (globalThis.EventSource as unknown as { instanceCount: number })
            .instanceCount,
        ).toBe(1);

        // Simulate a fatal handshake failure: the browser closes the stream
        // (readyState CLOSED) and fires 'error'. This models the 401 the worker
        // returns when the auth cookie isn't valid yet.
        const inst = (
          globalThis.EventSource as unknown as {
            lastInstance: {
              readyState: number;
              CLOSED: number;
              dispatchEvent: (e: Event) => boolean;
            };
          }
        ).lastInstance;
        inst.readyState = inst.CLOSED;
        inst.dispatchEvent(new Event("error"));

        // The component must schedule a reconnect and open a fresh EventSource.
        await vi.advanceTimersByTimeAsync(5_000);
        expect(
          (globalThis.EventSource as unknown as { instanceCount: number })
            .instanceCount,
        ).toBeGreaterThanOrEqual(2);
      } finally {
        vi.useRealTimers();
      }
    });
  });
});
