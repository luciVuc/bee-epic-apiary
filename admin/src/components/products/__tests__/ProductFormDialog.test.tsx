import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Provider } from "react-redux";
import { configureStore } from "@reduxjs/toolkit";
import { BrowserRouter } from "react-router-dom";
import { ProductFormDialog } from "../ProductFormDialog";
import productsReducer from "../../../store/productsSlice";
import type { IProduct } from "../../../types";
import { EProductCategory } from "../../../types";

const mockGetSettings = vi.fn();

vi.mock("../../../utils/api", () => ({
  api: {
    getSettings: (...args: any[]) => mockGetSettings(...args),
    getProductById: vi.fn(),
    createProduct: vi.fn(),
    updateProduct: vi.fn(),
  },
}));

const mockProduct: IProduct = {
  id: "prod_1",
  name: "Test Honey",
  slug: "test-honey",
  description: "A test product",
  price: 1999,
  category: EProductCategory.HONEY,
  imageUrls: ["https://example.com/img.png"],
  thumbnailUrls: ["https://example.com/thumb.png"],
  inStock: true,
  featured: false,
  weight: "16 oz",
  tags: ["raw", "organic"],
};

function createStore(preloadedState?: any) {
  return configureStore({
    reducer: { products: productsReducer },
    preloadedState,
  } as any);
}

function renderWithProviders(
  ui: React.ReactElement,
  { store }: { store?: any } = {},
) {
  const defaultStore = createStore({
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
  return render(
    <Provider store={store || defaultStore}>
      <BrowserRouter>{ui}</BrowserRouter>
    </Provider>,
  );
}

describe("ProductFormDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSettings.mockResolvedValue([
      { id: "HONEY", label: "Honey" },
      { id: "BEESWAX", label: "Beeswax" },
      { id: "SUBSCRIPTIONS", label: "Subscriptions" },
    ]);
  });

  it("renders create mode with default values", async () => {
    renderWithProviders(<ProductFormDialog onClose={() => {}} />);

    expect(await screen.findByText("Add New Product")).toBeInTheDocument();
    expect(screen.getByText("Create Product")).toBeInTheDocument();
  });

  it("renders edit mode when productId is provided", () => {
    const store = createStore({
      products: {
        items: [],
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

    renderWithProviders(
      <ProductFormDialog productId="prod_1" onClose={() => {}} />,
      { store },
    );

    expect(screen.getByText("Edit Product")).toBeInTheDocument();
    expect(screen.getByText("Update Product")).toBeInTheDocument();
  });

  it("shows loading spinner when fetching edit data", () => {
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

    renderWithProviders(
      <ProductFormDialog productId="prod_1" onClose={() => {}} />,
      { store },
    );

    const spinners = document.querySelectorAll(".animate-spin");
    expect(spinners.length).toBeGreaterThanOrEqual(1);
  });

  it("calls onClose when cancel button is clicked", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();

    renderWithProviders(<ProductFormDialog onClose={onClose} />);

    await user.click(screen.getByText("Cancel"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("calls onClose when X button is clicked", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();

    renderWithProviders(<ProductFormDialog onClose={onClose} />);

    await user.click(screen.getByLabelText("Close dialog"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("validates price must be greater than 0", async () => {
    const onClose = vi.fn();
    const { container } = renderWithProviders(
      <ProductFormDialog onClose={onClose} />,
    );

    await screen.findByText("Create Product");
    const form = container.querySelector("form");
    expect(form).not.toBeNull();
    fireEvent.submit(form!);

    expect(
      await screen.findByText("Price must be greater than 0"),
    ).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("adds and removes tags", async () => {
    const user = userEvent.setup();
    renderWithProviders(<ProductFormDialog onClose={() => {}} />);

    const tagInput = screen.getByPlaceholderText("Add a tag");
    await user.type(tagInput, "new-tag");
    await user.click(screen.getByLabelText("Add tag"));

    expect(screen.getByText("new-tag")).toBeInTheDocument();

    await user.click(screen.getByLabelText("Remove tag new-tag"));
    expect(screen.queryByText("new-tag")).not.toBeInTheDocument();
  });

  it("does not add duplicate tags", async () => {
    const user = userEvent.setup();
    renderWithProviders(<ProductFormDialog onClose={() => {}} />);

    const tagInput = screen.getByPlaceholderText("Add a tag");
    await user.type(tagInput, "tag1");
    await user.click(screen.getByLabelText("Add tag"));
    await user.type(tagInput, "tag1");
    await user.click(screen.getByLabelText("Add tag"));

    const tagElements = screen.getAllByText("tag1");
    expect(tagElements).toHaveLength(1);
  });

  it("adds tag on Enter key", async () => {
    const user = userEvent.setup();
    renderWithProviders(<ProductFormDialog onClose={() => {}} />);

    const tagInput = screen.getByPlaceholderText("Add a tag");
    await user.type(tagInput, "enter-tag{Enter}");

    expect(screen.getByText("enter-tag")).toBeInTheDocument();
  });

  it("shows subscription fields when category is SUBSCRIPTIONS", async () => {
    const user = userEvent.setup();
    renderWithProviders(<ProductFormDialog onClose={() => {}} />);

    await screen.findByText("Add New Product");
    const categorySelect = screen.getByRole("combobox");
    await user.selectOptions(categorySelect, "SUBSCRIPTIONS");

    expect(screen.getByText("Interval")).toBeInTheDocument();
    expect(screen.getByText("Every")).toBeInTheDocument();
  });

  it("adds and removes image URLs", async () => {
    const user = userEvent.setup();
    renderWithProviders(<ProductFormDialog onClose={() => {}} />);

    await user.click(screen.getByText("Add Image URL"));
    const imageInputs = screen.getAllByPlaceholderText(
      "https://example.com/image.png",
    );
    expect(imageInputs.length).toBeGreaterThanOrEqual(2);

    await user.click(screen.getByLabelText("Remove image URL 1"));
    const remaining = screen.getAllByPlaceholderText(
      "https://example.com/image.png",
    );
    expect(remaining.length).toBeGreaterThanOrEqual(1);
  });

  it("displays and dismisses submit error", async () => {
    const user = userEvent.setup();
    const { container } = renderWithProviders(
      <ProductFormDialog onClose={() => {}} />,
    );

    await screen.findByText("Create Product");
    const form = container.querySelector("form");
    expect(form).not.toBeNull();
    fireEvent.submit(form!);

    expect(
      await screen.findByText("Price must be greater than 0"),
    ).toBeInTheDocument();

    const dismissButtons = screen.getAllByRole("button");
    const dismissButton = dismissButtons.find(
      (btn) => btn.querySelector("svg") && btn.closest(".bg-red-50"),
    );
    if (dismissButton) {
      await user.click(dismissButton);
      expect(
        screen.queryByText("Price must be greater than 0"),
      ).not.toBeInTheDocument();
    }
  });
});
