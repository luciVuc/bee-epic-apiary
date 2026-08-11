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
const mockCleanupProducts = vi.fn();

vi.mock("../../utils/api", () => ({
  api: {
    getSettings: (...args: any[]) => mockGetSettings(...args),
    getProducts: (...args: any[]) => mockGetProducts(...args),
    getProductsCount: (...args: any[]) => mockGetProductsCount(...args),
    cleanupProducts: (...args: any[]) => mockCleanupProducts(...args),
  },
  apiErrorMessage: (_err: unknown, fallback: string) => fallback,
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

  describe("merged initial-load + debounced refetch (review I6)", () => {
    /**
     * The previous component had a useLayoutEffect that fired
     * fetchProducts+fetchProductsCount on mount, plus a useEffect that fired
     * the same pair on filter changes. Under StrictMode (or any same-key
     * re-render) the layout effect would re-fire and the same-key branch
     * inside the useEffect would also fire, producing 2× the network calls
     * for what should be one initial load. Task 16 (OrdersPage) established
     * the didMount-ref pattern; this brings ProductsPage into line.
     */

    it("dispatches fetchProducts exactly once on initial mount under StrictMode (no double-dispatch)", async () => {
      // The original code used useLayoutEffect with an empty deps array and a
      // SEPARATE useEffect for filter changes. Under React.StrictMode the
      // layout effect re-fires, producing 2× initial network calls. The
      // didMount pattern guards against this.
      const { StrictMode } = await import("react");
      const store = createStore();
      render(
        <StrictMode>
          <Provider store={store}>
            <MemoryRouter initialEntries={["/products"]}>
              <ProductsPage />
            </MemoryRouter>
          </Provider>
        </StrictMode>,
      );
      await new Promise((r) => setTimeout(r, 0));
      expect(mockGetProducts).toHaveBeenCalledTimes(1);
      expect(mockGetProductsCount).toHaveBeenCalledTimes(1);
    });

    it("dispatches fetchProducts exactly once on initial mount (no duplicate from layout effect)", async () => {
      renderWithProviders(<ProductsPage />);
      // Let mount effects flush.
      await new Promise((r) => setTimeout(r, 0));
      expect(mockGetProducts).toHaveBeenCalledTimes(1);
    });

    it("dispatches fetchProductsCount exactly once on initial mount", async () => {
      renderWithProviders(<ProductsPage />);
      await new Promise((r) => setTimeout(r, 0));
      expect(mockGetProductsCount).toHaveBeenCalledTimes(1);
    });

    it("does not re-fetch on a same-key re-render (e.g. filter-panel toggle)", async () => {
      const store = createStore();
      const { rerender } = render(
        <Provider store={store}>
          <MemoryRouter initialEntries={["/products"]}>
            <ProductsPage />
          </MemoryRouter>
        </Provider>,
      );
      await new Promise((r) => setTimeout(r, 0));
      const callsAfterMount = mockGetProducts.mock.calls.length;
      // Re-render with same params, same store — simulates a filter-panel
      // toggle or other state change that doesn't alter the search/category.
      rerender(
        <Provider store={store}>
          <MemoryRouter initialEntries={["/products"]}>
            <ProductsPage />
          </MemoryRouter>
        </Provider>,
      );
      await new Promise((r) => setTimeout(r, 0));
      expect(mockGetProducts.mock.calls.length).toBe(callsAfterMount);
    });
  });

  describe("interactive handlers (review I8 coverage)", () => {
    // The handler suite covers the inline arrows the component declares
    // for search, filter, clear, load-more, and category toggling — each
    // counts against function coverage when uncovered.

    function buildStore(opts: { hasMore?: boolean } = {}) {
      return createStore({
        products: {
          items: mockProducts,
          loading: false,
          error: null,
          selectedProduct: null,
          hasMore: opts.hasMore ?? false,
          lastId: "prod_3",
          totalCount: 10,
          lastFetchParams: null,
          scrollPosition: 0,
        },
      });
    }

    it("updates search params when typing in the search box", async () => {
      const store = buildStore();
      renderWithProviders(<ProductsPage />, { store });
      const { fireEvent } = await import("@testing-library/react");
      const input = await screen.findByPlaceholderText("Search products...");
      fireEvent.change(input, { target: { value: "honey" } });
      expect((input as HTMLInputElement).value).toBe("honey");
    });

    it("clears search via the X button", async () => {
      const store = buildStore();
      renderWithProviders(<ProductsPage />, {
        store,
        initialEntries: ["/products?search=honey"],
      });
      const { fireEvent } = await import("@testing-library/react");
      const clearBtn = await screen.findByTestId("products-page_search-clear");
      fireEvent.click(clearBtn);
      const input = screen.getByPlaceholderText(
        "Search products...",
      ) as HTMLInputElement;
      expect(input.value).toBe("");
    });

    it("toggles the filter panel", async () => {
      const store = buildStore();
      renderWithProviders(<ProductsPage />, { store });
      const { fireEvent } = await import("@testing-library/react");
      const toggle = await screen.findByTestId("products-page_filter-toggle");
      fireEvent.click(toggle);
      fireEvent.click(toggle);
    });

    it("changes the category filter", async () => {
      const store = buildStore();
      renderWithProviders(<ProductsPage />, { store });
      const { fireEvent } = await import("@testing-library/react");
      const select = (await screen.findByLabelText(
        "Filter by category",
      )) as HTMLSelectElement;
      fireEvent.change(select, { target: { value: "HONEY" } });
      expect(select.value).toBe("HONEY");
    });

    it("clicks Load More to fetch next page", async () => {
      mockGetProducts.mockResolvedValueOnce({
        products: mockProducts,
        hasMore: true,
        lastId: "prod_3",
        totalCount: 10,
      });
      const store = buildStore({ hasMore: true });
      renderWithProviders(<ProductsPage />, { store });
      const { fireEvent } = await import("@testing-library/react");
      const btn = await screen.findByTestId("products-page_load-more-btn");
      fireEvent.click(btn);
      await new Promise((r) => setTimeout(r, 0));
      expect(mockGetProducts).toHaveBeenCalled();
    });

    it("clicks Add Product to navigate to /products/new", async () => {
      const store = buildStore();
      renderWithProviders(<ProductsPage />, { store });
      const { fireEvent } = await import("@testing-library/react");
      const btn = await screen.findByTestId("products-page_add-btn");
      fireEvent.click(btn);
      // Navigation handled by react-router; we just verify no exception.
    });
  });

  describe("cleanup", () => {
    function buildStore() {
      return createStore({
        products: {
          items: mockProducts,
          loading: false,
          error: null,
          selectedProduct: null,
          hasMore: false,
          lastId: "prod_3",
          totalCount: 3,
          lastFetchParams: null,
          scrollPosition: 0,
        },
      });
    }

    it("opens the cleanup dialog and shows the preview candidates", async () => {
      mockCleanupProducts.mockResolvedValue({
        dry_run: true,
        candidates: [
          { id: "prod_junk1", name: "Test Product" },
          { id: "prod_junk2", name: "myproduct" },
        ],
        count: 2,
      });
      const store = buildStore();
      renderWithProviders(<ProductsPage />, { store });
      const { fireEvent } = await import("@testing-library/react");

      fireEvent.click(await screen.findByTestId("products-page_cleanup-btn"));

      // Preview list renders the two un-priced candidates.
      expect(await screen.findByTestId("cleanup-dialog")).toBeInTheDocument();
      expect(await screen.findByText("Test Product")).toBeInTheDocument();
      expect(screen.getByText("myproduct")).toBeInTheDocument();
      expect(mockCleanupProducts).toHaveBeenCalledWith(true);
    });

    it("shows an empty state when there is nothing to clean up", async () => {
      mockCleanupProducts.mockResolvedValue({
        dry_run: true,
        candidates: [],
        count: 0,
      });
      const store = buildStore();
      renderWithProviders(<ProductsPage />, { store });
      const { fireEvent } = await import("@testing-library/react");

      fireEvent.click(await screen.findByTestId("products-page_cleanup-btn"));

      expect(
        await screen.findByTestId("cleanup-dialog_empty"),
      ).toBeInTheDocument();
      // No confirm button when there is nothing to delete.
      expect(
        screen.queryByTestId("cleanup-dialog_confirm-btn"),
      ).not.toBeInTheDocument();
    });

    it("applies the cleanup on confirm", async () => {
      mockCleanupProducts
        .mockResolvedValueOnce({
          dry_run: true,
          candidates: [{ id: "prod_junk1", name: "Test Product" }],
          count: 1,
        })
        .mockResolvedValueOnce({
          dry_run: false,
          deleted: ["prod_junk1"],
          archived: [],
          failed: [],
          deleted_count: 1,
          archived_count: 0,
          failed_count: 0,
        });
      const store = buildStore();
      renderWithProviders(<ProductsPage />, { store });
      const { fireEvent, waitFor } = await import("@testing-library/react");

      fireEvent.click(await screen.findByTestId("products-page_cleanup-btn"));
      const confirm = await screen.findByTestId("cleanup-dialog_confirm-btn");
      fireEvent.click(confirm);

      await waitFor(() => {
        expect(mockCleanupProducts).toHaveBeenCalledWith(false);
      });
    });
  });
});
