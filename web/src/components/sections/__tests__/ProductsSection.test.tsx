import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { screen, fireEvent, waitFor } from "@testing-library/react";
import { ProductsSection } from "../ProductsSection";
import { makeProduct, renderWithProviders } from "../../../test/helpers";
import * as api from "../../../utils/api";
import type { ICategory, ISiteContent } from "../../../types";

const content = {
  productsTitle: "Our Products",
  productsSubtitle: "Fresh from the hive",
  noProductsFound: "No products found",
} as unknown as ISiteContent;

const categories: ICategory[] = [
  { id: "HONEY", label: "Honey" } as unknown as ICategory,
];

function mockPaginated(
  products: ReturnType<typeof makeProduct>[],
  hasMore = false,
  totalCount = products.length,
) {
  return vi
    .spyOn(api, "fetchProductsPaginated")
    .mockResolvedValue({ products, hasMore, totalCount } as never);
}

describe("ProductsSection", () => {
  beforeEach(() => {
    sessionStorage.clear();
  });
  afterEach(() => vi.restoreAllMocks());

  it("renders the fetched product grid and results count", async () => {
    mockPaginated(
      [
        makeProduct({ id: "1", slug: "a", name: "Alpha" }),
        makeProduct({ id: "2", slug: "b", name: "Beta" }),
      ],
      false,
      2,
    );
    renderWithProviders(
      <ProductsSection content={content} categories={categories} />,
      { route: "/products" },
    );

    await screen.findByText("Alpha");
    expect(screen.getByText("Beta")).toBeInTheDocument();
    expect(
      screen.getByTestId("products-section_results-count"),
    ).toHaveTextContent("Showing 2 of 2 products");
  });

  it("shows the empty state when no products are returned", async () => {
    mockPaginated([], false, 0);
    renderWithProviders(
      <ProductsSection content={content} categories={categories} />,
      { route: "/products" },
    );
    await screen.findByTestId("products-section_empty");
    expect(screen.getByText("No products found")).toBeInTheDocument();
  });

  it('loads more products when "Load More" is clicked', async () => {
    const spy = mockPaginated(
      [makeProduct({ id: "1", slug: "a", name: "Alpha" })],
      true,
      2,
    );
    renderWithProviders(
      <ProductsSection content={content} categories={categories} />,
      { route: "/products" },
    );
    await screen.findByText("Alpha");

    // Second page.
    spy.mockResolvedValueOnce({
      products: [makeProduct({ id: "2", slug: "b", name: "Beta" })],
      hasMore: false,
      totalCount: 2,
    } as never);

    fireEvent.click(screen.getByTestId("products-section_load-more-btn"));
    await screen.findByText("Beta");
    expect(screen.getByText("Alpha")).toBeInTheDocument();
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it("restores saved scroll position on mount (back-nav) and clears the keys", async () => {
    sessionStorage.setItem("products_page_scroll", "512");
    sessionStorage.setItem("products_page_url", "http://localhost/products");
    const scrollSpy = vi.spyOn(window, "scrollTo").mockImplementation(() => {});
    mockPaginated(
      [makeProduct({ id: "1", slug: "a", name: "Alpha" })],
      false,
      1,
    );

    renderWithProviders(
      <ProductsSection content={content} categories={categories} />,
      { route: "/products" },
    );
    await screen.findByText("Alpha");

    await waitFor(() => expect(scrollSpy).toHaveBeenCalledWith(0, 512));
    expect(sessionStorage.getItem("products_page_scroll")).toBeNull();
    expect(sessionStorage.getItem("products_page_url")).toBeNull();
  });
});
