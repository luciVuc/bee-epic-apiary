import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { Provider } from "react-redux";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { HelmetProvider } from "react-helmet-async";
import { configureStore } from "@reduxjs/toolkit";
import cartReducer from "../../../store/cartSlice";
import uiReducer from "../../../store/uiSlice";
import { ProductDetailPage } from "../ProductDetailPage";
import { makeProduct } from "../../../test/helpers";
import * as api from "../../../utils/api";
import type { ICartItem } from "../../../types";

/**
 * Mounts ProductDetailPage at `/products/:slug` so `useParams` resolves, inside
 * the full provider stack it depends on (Redux for the cart, Router for
 * nav/params, Helmet for SeoHead).
 */
function renderDetail(slug: string, preloadedCart: ICartItem[] = []) {
  const store = configureStore({
    reducer: { cart: cartReducer, ui: uiReducer },
    preloadedState: {
      cart: { items: preloadedCart },
      ui: { isCartOpen: false, activeSectionId: "home", isLoading: false },
    },
  });
  const utils = render(
    <Provider store={store}>
      <HelmetProvider>
        <MemoryRouter initialEntries={[`/products/${slug}`]}>
          <Routes>
            <Route path="/products/:slug" element={<ProductDetailPage />} />
            <Route path="/products" element={<div>PRODUCTS LIST</div>} />
          </Routes>
        </MemoryRouter>
      </HelmetProvider>
    </Provider>,
  );
  return { store, ...utils };
}

describe("ProductDetailPage", () => {
  beforeEach(() => {
    sessionStorage.clear();
    vi.spyOn(window, "scrollTo").mockImplementation(() => {});
  });
  afterEach(() => vi.restoreAllMocks());

  it("scrolls to the top on mount", async () => {
    vi.spyOn(api, "fetchProductBySlug").mockResolvedValue(makeProduct());
    renderDetail("wildflower-honey");
    await waitFor(() =>
      expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
        "Wildflower Honey",
      ),
    );
    expect(window.scrollTo).toHaveBeenCalledWith(0, 0);
  });

  it("renders the fetched product with price and add-to-cart", async () => {
    vi.spyOn(api, "fetchProductBySlug").mockResolvedValue(
      makeProduct({ name: "Clover Honey", price: 999 }),
    );
    const { store } = renderDetail("clover");
    await screen.findByText("Clover Honey");
    expect(screen.getByText("$9.99")).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("product-detail-page_add-to-cart-btn"));
    expect(store.getState().cart.items).toHaveLength(1);
  });

  it("increments quantity via the stepper before adding", async () => {
    vi.spyOn(api, "fetchProductBySlug").mockResolvedValue(makeProduct());
    const { store } = renderDetail("wildflower-honey");
    await screen.findByTestId("product-detail-page_add-to-cart-btn");

    fireEvent.click(screen.getByTestId("product-detail-page_increase-qty-btn"));
    expect(
      screen.getByTestId("product-detail-page_qty-value"),
    ).toHaveTextContent("2");
    fireEvent.click(screen.getByTestId("product-detail-page_add-to-cart-btn"));
    expect(store.getState().cart.items[0].quantity).toBe(2);
  });

  it("shows the error state when the fetch rejects", async () => {
    vi.spyOn(api, "fetchProductBySlug").mockRejectedValue(
      new Error("boom from network"),
    );
    renderDetail("broken");
    await screen.findByText("Unable to load product");
    expect(screen.getByText("boom from network")).toBeInTheDocument();
  });

  it("shows the not-found state when the product is null", async () => {
    vi.spyOn(api, "fetchProductBySlug").mockResolvedValue(null);
    renderDetail("missing");
    await screen.findByText("Product not found");
  });

  it("back button navigates to the saved products URL when present", async () => {
    sessionStorage.setItem(
      "products_page_url",
      "http://localhost/products?category=HONEY",
    );
    vi.spyOn(api, "fetchProductBySlug").mockResolvedValue(makeProduct());
    renderDetail("wildflower-honey");
    await screen.findByTestId("product-detail-page_back-btn");
    fireEvent.click(screen.getByTestId("product-detail-page_back-btn"));
    // The stub route for /products renders this marker.
    expect(await screen.findByText("PRODUCTS LIST")).toBeInTheDocument();
  });
});
