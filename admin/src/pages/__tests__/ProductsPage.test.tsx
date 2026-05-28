/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { Provider } from "react-redux";
import { configureStore } from "@reduxjs/toolkit";
import { MemoryRouter } from "react-router-dom";
import { ProductsPage } from "../ProductsPage";
import productsReducer from "../../store/productsSlice";
import type { IProduct } from "../../types";
import { EProductCategory } from "../../types";

const mockGetSettings = vi.fn();
const mockGetProducts = vi.fn();
const mockGetProductsCount = vi.fn();

vi.mock("../../utils/api", () => ({
  api: {
    getSettings: (...args: any[]) => mockGetSettings(...args),
    getProducts: (...args: any[]) => mockGetProducts(...args),
    getProductsCount: (...args: any[]) => mockGetProductsCount(...args),
  },
}));

const mockProducts: IProduct[] = [
  {
    id: "prod_1",
    name: "Wildflower Honey",
    slug: "wildflower-honey",
    description: "Delicious wildflower honey",
    price: 1299,
    category: EProductCategory.HONEY,
    imageUrls: [],
    thumbnailUrls: [],
    inStock: true,
    featured: true,
    weight: "16 oz",
    tags: [],
  },
  {
    id: "prod_2",
    name: "Beeswax Candle",
    slug: "beeswax-candle",
    description: "Handmade candle",
    price: 2499,
    category: EProductCategory.BEESWAX,
    imageUrls: [],
    thumbnailUrls: [],
    inStock: false,
    featured: false,
    weight: "8 oz",
    tags: [],
  },
  {
    id: "prod_3",
    name: "Monthly Sub",
    slug: "monthly-sub",
    description: "Monthly subscription",
    price: 2999,
    category: EProductCategory.SUBSCRIPTIONS,
    imageUrls: [],
    thumbnailUrls: [],
    inStock: true,
    featured: false,
    weight: "",
    tags: [],
    recurringInterval: "month",
    recurringIntervalCount: 1,
  },
];

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
    initialEntries = ["/products"],
  }: { store?: any; initialEntries?: string[] } = {},
) {
  const defaultStore = createStore();
  return render(
    <Provider store={store || defaultStore}>
      <MemoryRouter initialEntries={initialEntries}>{ui}</MemoryRouter>
    </Provider>,
  );
}

describe("ProductsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    mockGetSettings.mockResolvedValue([
      { id: "HONEY", label: "Honey" },
      { id: "BEESWAX", label: "Beeswax" },
    ]);
    mockGetProducts.mockResolvedValue({
      products: [],
      hasMore: false,
      lastId: undefined,
      totalCount: 0,
    });
    mockGetProductsCount.mockResolvedValue(0);
  });

  it("renders loading state when no products and loading", () => {
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
    renderWithProviders(<ProductsPage />, { store });
    expect(document.querySelector(".animate-spin")).toBeInTheDocument();
  });

  it("renders empty state when no products", async () => {
    const store = createStore({
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
    });
    renderWithProviders(<ProductsPage />, { store });

    expect(await screen.findByText("No products found")).toBeInTheDocument();
  });

  it("renders product list with correct data", async () => {
    mockGetProducts.mockResolvedValue({
      products: mockProducts,
      hasMore: false,
      lastId: "prod_3",
      totalCount: 3,
    });
    const store = createStore({
      products: {
        items: mockProducts,
        loading: false,
        error: null,
        selectedProduct: null,
        hasMore: false,
        lastId: null,
        totalCount: 3,
        lastFetchParams: null,
        scrollPosition: 0,
      },
    });
    renderWithProviders(<ProductsPage />, { store });

    const honeyElements = await screen.findAllByText("Wildflower Honey");
    expect(honeyElements.length).toBeGreaterThanOrEqual(1);
  });

  it("renders product count info", async () => {
    const store = createStore({
      products: {
        items: mockProducts,
        loading: false,
        error: null,
        selectedProduct: null,
        hasMore: false,
        lastId: null,
        totalCount: 3,
        lastFetchParams: null,
        scrollPosition: 0,
      },
    });
    renderWithProviders(<ProductsPage />, { store });

    expect(
      await screen.findByText(/Showing 3 of 3 products/),
    ).toBeInTheDocument();
  });

  it("renders error message when present", async () => {
    mockGetProducts.mockRejectedValue(new Error("Failed to load products"));
    const store = createStore({
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
    });
    renderWithProviders(<ProductsPage />, { store });

    expect(
      await screen.findByText("Failed to load products"),
    ).toBeInTheDocument();
  });

  it("shows subscription badge for subscription products", async () => {
    mockGetProducts.mockResolvedValue({
      products: mockProducts,
      hasMore: false,
      lastId: "prod_3",
      totalCount: 3,
    });
    const store = createStore({
      products: {
        items: mockProducts,
        loading: false,
        error: null,
        selectedProduct: null,
        hasMore: false,
        lastId: null,
        totalCount: 3,
        lastFetchParams: null,
        scrollPosition: 0,
      },
    });
    renderWithProviders(<ProductsPage />, { store });

    const elements = await screen.findAllByText("Subscription");
    expect(elements.length).toBeGreaterThanOrEqual(1);
  });

  it("shows load more button when hasMore is true", async () => {
    mockGetProducts.mockResolvedValue({
      products: mockProducts,
      hasMore: true,
      lastId: "prod_3",
      totalCount: 10,
    });
    const store = createStore({
      products: {
        items: mockProducts,
        loading: false,
        error: null,
        selectedProduct: null,
        hasMore: true,
        lastId: "prod_3",
        totalCount: 10,
        lastFetchParams: null,
        scrollPosition: 0,
      },
    });
    renderWithProviders(<ProductsPage />, { store });

    expect(await screen.findByText("Load More Products")).toBeInTheDocument();
  });

  it("shows ProductFormDialog when on /products/new route", () => {
    const store = createStore({
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
    });
    renderWithProviders(<ProductsPage />, {
      store,
      initialEntries: ["/products/new"],
    });

    expect(screen.getByText("Add New Product")).toBeInTheDocument();
  });

  it("renders search input", async () => {
    const store = createStore({
      products: {
        items: mockProducts,
        loading: false,
        error: null,
        selectedProduct: null,
        hasMore: false,
        lastId: null,
        totalCount: 3,
        lastFetchParams: null,
        scrollPosition: 0,
      },
    });
    renderWithProviders(<ProductsPage />, { store });

    expect(
      await screen.findByPlaceholderText("Search products..."),
    ).toBeInTheDocument();
  });

  it("renders category filter dropdown", async () => {
    const store = createStore({
      products: {
        items: mockProducts,
        loading: false,
        error: null,
        selectedProduct: null,
        hasMore: false,
        lastId: null,
        totalCount: 3,
        lastFetchParams: null,
        scrollPosition: 0,
      },
    });
    renderWithProviders(<ProductsPage />, { store });

    expect(
      await screen.findByLabelText("Filter by category"),
    ).toBeInTheDocument();
  });

  it("shows loading overlay when loading with existing products", () => {
    const store = createStore({
      products: {
        items: mockProducts,
        loading: true,
        error: null,
        selectedProduct: null,
        hasMore: false,
        lastId: null,
        totalCount: 3,
        lastFetchParams: null,
        scrollPosition: 0,
      },
    });
    const { container } = renderWithProviders(<ProductsPage />, { store });

    const spinner = container.querySelector(".absolute.inset-0 .animate-spin");
    expect(spinner).toBeTruthy();
  });
});
