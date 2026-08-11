import { describe, it, expect, afterEach, vi } from "vitest";
import { screen, fireEvent, waitFor } from "@testing-library/react";
import { CartDrawer } from "../CartDrawer";
import { makeCartItem, renderWithProviders } from "../../../test/helpers";

describe("CartDrawer", () => {
  afterEach(() => vi.restoreAllMocks());

  it("renders nothing when the cart is closed", () => {
    renderWithProviders(<CartDrawer />, { cartOpen: false });
    expect(screen.queryByTestId("cart-drawer")).not.toBeInTheDocument();
  });

  it("shows the empty state when open with no items", () => {
    renderWithProviders(<CartDrawer />, { cartOpen: true, preloadedCart: [] });
    expect(screen.getByTestId("cart-drawer")).toBeInTheDocument();
    expect(screen.getByText("Your cart is empty")).toBeInTheDocument();
    // No checkout button in the empty state.
    expect(
      screen.queryByTestId("cart-drawer_checkout-btn"),
    ).not.toBeInTheDocument();
  });

  it("lists line items and the running subtotal", () => {
    renderWithProviders(<CartDrawer />, {
      cartOpen: true,
      preloadedCart: [
        makeCartItem({ id: "a", slug: "a", name: "Honey A", price: 1000 }, 2),
        makeCartItem({ id: "b", slug: "b", name: "Honey B", price: 500 }, 1),
      ],
    });
    expect(screen.getByText("Honey A")).toBeInTheDocument();
    expect(screen.getByText("Honey B")).toBeInTheDocument();
    // Subtotal = 2*1000 + 1*500 = 2500 cents → $25.00
    expect(screen.getByText("$25.00")).toBeInTheDocument();
  });

  it("closes on the close button", () => {
    const { store } = renderWithProviders(<CartDrawer />, {
      cartOpen: true,
      preloadedCart: [makeCartItem()],
    });
    fireEvent.click(screen.getByTestId("cart-drawer_close-btn"));
    expect(store.getState().ui.isCartOpen).toBe(false);
  });

  it("triggers checkout (POSTs to the worker) when the checkout button is clicked", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        ok: true,
        data: {
          sessions: ["https://stripe/cs_1"],
          message: "Single checkout session created",
        },
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    renderWithProviders(<CartDrawer />, {
      cartOpen: true,
      preloadedCart: [makeCartItem({ stripePriceId: "price_1" }, 1)],
    });

    fireEvent.click(screen.getByTestId("cart-drawer_checkout-btn"));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toMatch(/\/checkout$/);
    expect(init.method).toBe("POST");
  });

  it("surfaces a checkout error inline", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        json: async () => ({
          ok: false,
          error: { code: "VALIDATION_FAILED", fields: { line_items: "bad" } },
        }),
      }),
    );

    renderWithProviders(<CartDrawer />, {
      cartOpen: true,
      preloadedCart: [makeCartItem({ stripePriceId: "price_1" }, 1)],
    });

    fireEvent.click(screen.getByTestId("cart-drawer_checkout-btn"));
    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
  });
});
