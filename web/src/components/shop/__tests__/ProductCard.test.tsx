import { describe, it, expect, beforeEach, vi } from "vitest";
import { screen, fireEvent } from "@testing-library/react";
import { ProductCard } from "../ProductCard";
import { makeProduct, renderWithProviders } from "../../../test/helpers";

describe("ProductCard", () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it("renders name, price, and a detail link", () => {
    renderWithProviders(<ProductCard product={makeProduct()} />);
    expect(screen.getByText("Wildflower Honey")).toBeInTheDocument();
    expect(screen.getByText("$12.50")).toBeInTheDocument();
    // The image-wrapping link + the name link both point at the detail route.
    const links = screen.getAllByRole("link");
    expect(links[0]).toHaveAttribute("href", "/products/wildflower-honey");
  });

  it("adds to cart when the add button is clicked", () => {
    const { store } = renderWithProviders(
      <ProductCard product={makeProduct({ id: "prod_x", slug: "s" })} />,
    );
    fireEvent.click(screen.getByTestId("product-card_s_add-btn"));
    expect(store.getState().cart.items).toHaveLength(1);
    expect(store.getState().cart.items[0].product.id).toBe("prod_x");
  });

  it("disables the add button and does not add when out of stock", () => {
    const { store } = renderWithProviders(
      <ProductCard product={makeProduct({ slug: "oos", inStock: false })} />,
    );
    const btn = screen.getByTestId("product-card_oos_add-btn");
    expect(btn).toBeDisabled();
    fireEvent.click(btn);
    expect(store.getState().cart.items).toHaveLength(0);
    expect(screen.getByText("Out of Stock")).toBeInTheDocument();
  });

  it("saves scroll position and URL to sessionStorage before navigating", () => {
    vi.spyOn(window, "scrollY", "get").mockReturnValue(742);
    renderWithProviders(<ProductCard product={makeProduct({ slug: "nav" })} />);
    // Click the name link (navigates to detail).
    fireEvent.click(screen.getByTestId("product-card_nav_name-link"));
    expect(sessionStorage.getItem("products_page_scroll")).toBe("742");
    expect(sessionStorage.getItem("products_page_url")).toBe(
      window.location.href,
    );
  });

  it("renders the honey placeholder when there are no images", () => {
    renderWithProviders(
      <ProductCard product={makeProduct({ slug: "noimg", imageUrls: [] })} />,
    );
    expect(screen.getByText("🍯")).toBeInTheDocument();
  });
});
