/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { Provider } from "react-redux";
import { configureStore } from "@reduxjs/toolkit";
import { MemoryRouter } from "react-router-dom";
import { DashboardPage } from "../DashboardPage";
import productsReducer from "../../store/productsSlice";
import type { IProduct } from "../../types";
import { EProductCategory } from "../../types";

const mockSettings = vi.fn();
const mockGetOrders = vi.fn();

vi.mock("../../utils/api", () => ({
  api: {
    getSettings: (...args: any[]) => mockSettings(...args),
    getOrders: (...args: any[]) => mockGetOrders(...args),
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
    tags: ["wildflower"],
  },
  {
    id: "prod_2",
    name: "Beeswax Candle",
    slug: "beeswax-candle",
    description: "Handmade beeswax candle",
    price: 2499,
    category: EProductCategory.BEESWAX,
    imageUrls: [],
    thumbnailUrls: [],
    inStock: true,
    featured: false,
    weight: "8 oz",
    tags: ["candle"],
  },
  {
    id: "prod_3",
    name: "Monthly Subscription",
    slug: "monthly-sub",
    description: "Monthly honey subscription",
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
  { store }: { store?: any } = {},
) {
  const defaultStore = createStore();
  return render(
    <Provider store={store || defaultStore}>
      <MemoryRouter initialEntries={["/dashboard"]}>{ui}</MemoryRouter>
    </Provider>,
  );
}

describe("DashboardPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSettings.mockResolvedValue([
      { id: "HONEY", label: "Honey" },
      { id: "BEESWAX", label: "Beeswax" },
    ]);
    mockGetOrders.mockResolvedValue({
      orders: [],
      hasMore: false,
      lastId: null,
      totalCount: 0,
    });
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
    renderWithProviders(<DashboardPage />, { store });
    expect(document.querySelector(".animate-spin")).toBeInTheDocument();
  });

  it("renders dashboard title and Add Product link", async () => {
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
    renderWithProviders(<DashboardPage />, { store });

    expect(await screen.findByText("Dashboard")).toBeInTheDocument();
    expect(screen.getByText("Add Product")).toBeInTheDocument();
  });

  it("renders stat cards with correct values", async () => {
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
    renderWithProviders(<DashboardPage />, { store });

    expect(await screen.findByText("New Orders")).toBeInTheDocument();
    expect(
      await screen.findByText("Total Active Products"),
    ).toBeInTheDocument();
    expect(await screen.findByText("Featured")).toBeInTheDocument();
    expect(await screen.findByText("Categories")).toBeInTheDocument();
  });

  it("renders recent products limited to 5", async () => {
    const manyProducts = Array.from({ length: 7 }, (_, i) => ({
      ...mockProducts[0],
      id: `prod_${i}`,
      name: `Product ${i + 1}`,
    }));
    const store = createStore({
      products: {
        items: manyProducts,
        loading: false,
        error: null,
        selectedProduct: null,
        hasMore: false,
        lastId: null,
        totalCount: 7,
        lastFetchParams: null,
        scrollPosition: 0,
      },
    });
    renderWithProviders(<DashboardPage />, { store });

    expect(await screen.findByText("Recent Products")).toBeInTheDocument();
    expect(screen.getAllByRole("link").length).toBeGreaterThanOrEqual(5);
  });

  it("renders quick actions section", async () => {
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
    renderWithProviders(<DashboardPage />, { store });

    expect(await screen.findByText("Manage Products")).toBeInTheDocument();
    expect(screen.getByText("Add New Product")).toBeInTheDocument();
    expect(screen.getByText("Update Settings")).toBeInTheDocument();
  });

  it("renders subscription pricing info", async () => {
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
    renderWithProviders(<DashboardPage />, { store });

    expect(await screen.findByText(/every 1 month/)).toBeInTheDocument();
  });

  it("renders category breakdown section", async () => {
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
    renderWithProviders(<DashboardPage />, { store });

    expect(await screen.findByText("Products by Category")).toBeInTheDocument();
  });
});
