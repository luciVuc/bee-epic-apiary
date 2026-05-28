/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Provider } from "react-redux";
import { configureStore } from "@reduxjs/toolkit";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { ProductDetailPage } from "../ProductDetailPage";
import productsReducer from "../../store/productsSlice";
import type { IProduct } from "../../types";
import { EProductCategory } from "../../types";

const mockGetSettings = vi.fn();
const mockGetProductById = vi.fn();

vi.mock("../../utils/api", () => ({
  api: {
    getSettings: (...args: any[]) => mockGetSettings(...args),
    getProductById: (...args: any[]) => mockGetProductById(...args),
    deleteProduct: vi.fn(),
  },
}));

const mockProduct: IProduct = {
  id: "prod_1",
  name: "Wildflower Honey",
  slug: "wildflower-honey",
  description: "Delicious wildflower honey from California meadows",
  longDescription: "A very long description about this amazing honey.",
  price: 1299,
  category: EProductCategory.HONEY,
  imageUrls: ["https://example.com/img.png"],
  thumbnailUrls: ["https://example.com/thumb.png"],
  inStock: true,
  featured: true,
  weight: "16 oz",
  tags: ["wildflower", "raw", "organic"],
  stripePriceId: "price_abc123",
};

function createStore(preloadedState?: any) {
  return configureStore({
    reducer: { products: productsReducer },
    preloadedState: preloadedState || {
      products: {
        items: [],
        loading: false,
        error: null,
        selectedProduct: null,
        hasMore: false,
        lastId: null,
        totalCount: 0,
        lastFetchParams: null,
        scrollPosition: 0,
      },
    },
  } as any);
}

function renderWithProviders(
  ui: React.ReactElement,
  {
    store,
    initialEntries = ["/products/prod_1"],
  }: { store?: any; initialEntries?: string[] } = {},
) {
  const defaultStore = createStore();
  return render(
    <Provider store={store || defaultStore}>
      <MemoryRouter initialEntries={initialEntries}>
        <Routes>
          <Route path="/products/:id" element={ui} />
          <Route path="/products/:id/edit" element={ui} />
        </Routes>
      </MemoryRouter>
    </Provider>,
  );
}

describe("ProductDetailPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetProductById.mockResolvedValue(mockProduct);
  });

  it("renders loading state initially", () => {
    const store = createStore({
      products: {
        items: [],
        loading: true,
        error: null,
        selectedProduct: null,
        hasMore: false,
        lastId: null,
        totalCount: 0,
        lastFetchParams: null,
        scrollPosition: 0,
      },
    });
    renderWithProviders(<ProductDetailPage />, { store });
    expect(document.querySelector(".animate-spin")).toBeInTheDocument();
  });

  it("renders product details when loaded", async () => {
    const store = createStore({
      products: {
        items: [mockProduct],
        loading: false,
        error: null,
        selectedProduct: mockProduct,
        hasMore: false,
        lastId: null,
        totalCount: 1,
        lastFetchParams: null,
        scrollPosition: 0,
      },
    });
    renderWithProviders(<ProductDetailPage />, { store });

    expect(await screen.findByText("Wildflower Honey")).toBeInTheDocument();
    expect(
      screen.getByText("Delicious wildflower honey from California meadows"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("A very long description about this amazing honey."),
    ).toBeInTheDocument();
  });

  it("renders error state", () => {
    const store = createStore({
      products: {
        items: [],
        loading: false,
        error: "Product not found",
        selectedProduct: null,
        hasMore: false,
        lastId: null,
        totalCount: 0,
        lastFetchParams: null,
        scrollPosition: 0,
      },
    });
    renderWithProviders(<ProductDetailPage />, { store });

    expect(screen.getByText("Product Not Found")).toBeInTheDocument();
    expect(screen.getByText("Back to Products")).toBeInTheDocument();
  });

  it("renders stock status badge", async () => {
    const store = createStore({
      products: {
        items: [mockProduct],
        loading: false,
        error: null,
        selectedProduct: mockProduct,
        hasMore: false,
        lastId: null,
        totalCount: 1,
        lastFetchParams: null,
        scrollPosition: 0,
      },
    });
    renderWithProviders(<ProductDetailPage />, { store });

    expect(await screen.findByText("In Stock")).toBeInTheDocument();
  });

  it("renders featured badge", async () => {
    const store = createStore({
      products: {
        items: [mockProduct],
        loading: false,
        error: null,
        selectedProduct: mockProduct,
        hasMore: false,
        lastId: null,
        totalCount: 1,
        lastFetchParams: null,
        scrollPosition: 0,
      },
    });
    renderWithProviders(<ProductDetailPage />, { store });

    expect(await screen.findByText("Yes")).toBeInTheDocument();
  });

  it("renders tags section when product has tags", async () => {
    const store = createStore({
      products: {
        items: [mockProduct],
        loading: false,
        error: null,
        selectedProduct: mockProduct,
        hasMore: false,
        lastId: null,
        totalCount: 1,
        lastFetchParams: null,
        scrollPosition: 0,
      },
    });
    renderWithProviders(<ProductDetailPage />, { store });

    expect(await screen.findByText("wildflower")).toBeInTheDocument();
    expect(screen.getByText("raw")).toBeInTheDocument();
    expect(screen.getByText("organic")).toBeInTheDocument();
  });

  it("renders Stripe price ID", async () => {
    const store = createStore({
      products: {
        items: [mockProduct],
        loading: false,
        error: null,
        selectedProduct: mockProduct,
        hasMore: false,
        lastId: null,
        totalCount: 1,
        lastFetchParams: null,
        scrollPosition: 0,
      },
    });
    renderWithProviders(<ProductDetailPage />, { store });

    expect(await screen.findByText("price_abc123")).toBeInTheDocument();
  });

  it("shows Edit and Delete buttons", async () => {
    const store = createStore({
      products: {
        items: [mockProduct],
        loading: false,
        error: null,
        selectedProduct: mockProduct,
        hasMore: false,
        lastId: null,
        totalCount: 1,
        lastFetchParams: null,
        scrollPosition: 0,
      },
    });
    renderWithProviders(<ProductDetailPage />, { store });

    expect(await screen.findByText("Edit")).toBeInTheDocument();
    expect(screen.getByText("Delete")).toBeInTheDocument();
  });

  it("opens delete confirmation dialog", async () => {
    const user = userEvent.setup();
    const store = createStore({
      products: {
        items: [mockProduct],
        loading: false,
        error: null,
        selectedProduct: mockProduct,
        hasMore: false,
        lastId: null,
        totalCount: 1,
        lastFetchParams: null,
        scrollPosition: 0,
      },
    });
    renderWithProviders(<ProductDetailPage />, { store });

    await user.click(await screen.findByText("Delete"));
    expect(screen.getByText("Confirm Delete")).toBeInTheDocument();
  });

  it('shows "No" for featured when not featured', async () => {
    const nonFeatured = { ...mockProduct, featured: false };
    mockGetProductById.mockResolvedValue(nonFeatured);
    const store = createStore({
      products: {
        items: [nonFeatured],
        loading: false,
        error: null,
        selectedProduct: nonFeatured,
        hasMore: false,
        lastId: null,
        totalCount: 1,
        lastFetchParams: null,
        scrollPosition: 0,
      },
    });
    renderWithProviders(<ProductDetailPage />, { store });

    expect(await screen.findByText("No")).toBeInTheDocument();
  });
});
