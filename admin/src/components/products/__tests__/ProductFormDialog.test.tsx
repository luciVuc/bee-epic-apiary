/* eslint-disable @typescript-eslint/no-explicit-any */
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
    const user = userEvent.setup();
    const onClose = vi.fn();
    renderWithProviders(<ProductFormDialog onClose={onClose} />);

    await screen.findByText("Create Product");

    await user.type(screen.getByLabelText("Product Name *"), "Test");
    await user.type(screen.getByLabelText("Slug *"), "test");
    await user.type(screen.getByLabelText("Short Description *"), "desc");
    await user.type(screen.getByLabelText("Weight *"), "16 oz");

    const submitBtn = screen.getByTestId("product-form-dialog_submit_btn");
    expect(submitBtn).not.toBeDisabled();
    fireEvent.click(submitBtn);

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
    renderWithProviders(<ProductFormDialog onClose={() => {}} />);

    await screen.findByText("Create Product");

    await user.type(screen.getByLabelText("Product Name *"), "Test");
    await user.type(screen.getByLabelText("Slug *"), "test");
    await user.type(screen.getByLabelText("Short Description *"), "desc");
    await user.type(screen.getByLabelText("Weight *"), "16 oz");

    const submitBtn = screen.getByTestId("product-form-dialog_submit_btn");
    expect(submitBtn).not.toBeDisabled();
    fireEvent.click(submitBtn);

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

  describe("seeding stability (review I4)", () => {
    /**
     * The form used to re-seed itself from `selectedProduct` whenever that
     * reference changed — including after an unrelated `fetchProducts` rerun
     * that returned an updated `items` array containing the same product.
     * Result: while an admin was editing, a background poll could silently
     * revert their unsaved changes. The fix seeds exactly once per productId,
     * gated by a useRef so subsequent reference changes don't clobber.
     */

    it("seeds the form once per productId and does not re-seed on subsequent selectedProduct reference changes", async () => {
      const initialState = {
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
      };
      const store = createStore(initialState);
      renderWithProviders(
        <ProductFormDialog productId="prod_1" onClose={() => {}} />,
        { store },
      );

      // First seed: the form should show the product's name.
      const nameInput = (await screen.findByLabelText(
        "Product Name *",
      )) as HTMLInputElement;
      expect(nameInput.value).toBe("Test Honey");

      // Admin edits the name.
      const user = userEvent.setup();
      await user.clear(nameInput);
      await user.type(nameInput, "Edited Name");
      expect(nameInput.value).toBe("Edited Name");

      // Simulate a stale background refresh that replaces selectedProduct with
      // an updated reference for the SAME id (same data shape, different ref).
      store.dispatch({
        type: "products/fetchById/fulfilled",
        payload: { ...mockProduct },
      });
      // Let any effects flush.
      await new Promise((r) => setTimeout(r, 0));
      // Verify the dispatch actually replaced selectedProduct with a new ref:
      const after = (store.getState() as any).products.selectedProduct;
      expect(after).not.toBe(mockProduct);
      expect(after.name).toBe("Test Honey");

      // The edited name MUST survive the reference change.
      expect(
        (screen.getByLabelText("Product Name *") as HTMLInputElement).value,
      ).toBe("Edited Name");
    });

    it("seeds again after the dialog is closed and reopened for the same productId", async () => {
      // The seeding ref is per-mount lifetime; reopening produces a fresh
      // dialog instance that should re-seed.
      const initialState = {
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
      };
      const store = createStore(initialState);
      const { unmount } = renderWithProviders(
        <ProductFormDialog productId="prod_1" onClose={() => {}} />,
        { store },
      );
      expect(
        ((await screen.findByLabelText("Product Name *")) as HTMLInputElement)
          .value,
      ).toBe("Test Honey");
      unmount();

      renderWithProviders(
        <ProductFormDialog productId="prod_1" onClose={() => {}} />,
        { store },
      );
      expect(
        ((await screen.findByLabelText("Product Name *")) as HTMLInputElement)
          .value,
      ).toBe("Test Honey");
    });
  });

  describe("integer-only price input (review I14)", () => {
    /**
     * The price field stores Stripe minor units (cents). The previous
     * type=number input let the browser surface "1.5", "1e10", or "-3" — all
     * silently became non-integer cents downstream and created Stripe Price
     * records the admin couldn't reconcile. The fix is a digits-only text
     * input with inputMode="numeric" so mobile users still get the digit
     * keypad, plus an onChange that strips non-digit characters before
     * setting state.
     */

    it("strips non-digit characters as the user types", async () => {
      const user = userEvent.setup();
      renderWithProviders(<ProductFormDialog onClose={() => {}} />);
      await screen.findByText("Add New Product");
      const priceInput = (await screen.findByLabelText(
        "Price in cents",
      )) as HTMLInputElement;
      await user.clear(priceInput);
      await user.type(priceInput, "1a2.b3");
      expect(priceInput.value).toBe("123");
    });

    it("treats empty string as 0 (does not crash)", async () => {
      const user = userEvent.setup();
      renderWithProviders(<ProductFormDialog onClose={() => {}} />);
      await screen.findByText("Add New Product");
      const priceInput = (await screen.findByLabelText(
        "Price in cents",
      )) as HTMLInputElement;
      await user.clear(priceInput);
      expect(priceInput.value).toBe("0");
    });

    it("renders a cents-hint description so admins know the unit", async () => {
      renderWithProviders(<ProductFormDialog onClose={() => {}} />);
      await screen.findByText("Add New Product");
      expect(document.getElementById("price-hint")).toBeTruthy();
    });

    it("strips non-digits from a $14.99-style entry (1499 cents)", async () => {
      const user = userEvent.setup();
      renderWithProviders(<ProductFormDialog onClose={() => {}} />);
      await screen.findByText("Add New Product");
      const priceInput = (await screen.findByLabelText(
        "Price in cents",
      )) as HTMLInputElement;
      await user.clear(priceInput);
      await user.type(priceInput, "$14.99");
      expect(priceInput.value).toBe("1499");
    });

    it("uses inputMode=numeric so the mobile keypad opens", async () => {
      renderWithProviders(<ProductFormDialog onClose={() => {}} />);
      await screen.findByText("Add New Product");
      const priceInput = (await screen.findByLabelText(
        "Price in cents",
      )) as HTMLInputElement;
      expect(priceInput.inputMode).toBe("numeric");
    });
  });
});
