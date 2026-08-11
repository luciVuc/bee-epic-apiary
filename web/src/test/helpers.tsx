import type { ReactElement, ReactNode } from "react";
import { render } from "@testing-library/react";
import { Provider } from "react-redux";
import { MemoryRouter } from "react-router-dom";
import { configureStore } from "@reduxjs/toolkit";
import cartReducer from "../store/cartSlice";
import uiReducer from "../store/uiSlice";
import type { IProduct, ICartItem } from "../types";

/**
 * Shared test helpers for web component/integration tests. Builds a fresh store
 * per render (no cross-test cart bleed) and wraps in a MemoryRouter so
 * `<Link>` / `useSearchParams` work. Mirrors the admin `renderWithProviders`
 * convention (per-test store seeded via preloadedState).
 */

/** A minimal valid IProduct; override any field per test. */
export function makeProduct(overrides: Partial<IProduct> = {}): IProduct {
  return {
    id: "prod_1",
    slug: "wildflower-honey",
    name: "Wildflower Honey",
    description: "Golden and floral.",
    longDescription: "A longer description.",
    price: 1250,
    currency: "usd",
    category: "HONEY",
    tags: ["raw"],
    weight: "500g",
    imageUrls: [],
    inStock: true,
    featured: false,
    stripeProductId: "prod_1",
    stripePriceId: "price_1",
    ...overrides,
  } as unknown as IProduct;
}

export function makeCartItem(
  product: Partial<IProduct> = {},
  quantity = 1,
): ICartItem {
  return { product: makeProduct(product), quantity };
}

interface IRenderOptions {
  route?: string;
  preloadedCart?: ICartItem[];
  cartOpen?: boolean;
}

export function renderWithProviders(
  ui: ReactElement,
  { route = "/", preloadedCart = [], cartOpen = false }: IRenderOptions = {},
) {
  const store = configureStore({
    reducer: { cart: cartReducer, ui: uiReducer },
    preloadedState: {
      cart: { items: preloadedCart },
      ui: { isCartOpen: cartOpen, activeSectionId: "home", isLoading: false },
    },
  });

  const wrapper = ({ children }: { children: ReactNode }) => (
    <Provider store={store}>
      <MemoryRouter initialEntries={[route]}>{children}</MemoryRouter>
    </Provider>
  );

  return { store, ...render(ui, { wrapper }) };
}
