import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CategoriesTab } from "../CategoriesTab";
import { DEFAULT_CATEGORIES } from "../../../utils/constants";

const defaultCategories = DEFAULT_CATEGORIES;

function renderTab(
  props: Partial<React.ComponentProps<typeof CategoriesTab>> = {},
) {
  return render(
    <CategoriesTab
      categoriesContent={defaultCategories}
      addCategoryItem={vi.fn()}
      updateCategoryItem={vi.fn()}
      removeCategoryItem={vi.fn()}
      {...props}
    />,
  );
}

describe("CategoriesTab", () => {
  it("renders all categories", () => {
    renderTab();
    expect(screen.getByText("Category 1")).toBeInTheDocument();
    expect(screen.getByText("Category 4")).toBeInTheDocument();
  });

  it("renders the description", () => {
    renderTab();
    expect(
      screen.getByText(
        "Define and manage product categories used across the store.",
      ),
    ).toBeInTheDocument();
  });

  it("calls addCategoryItem when Add Category is clicked", async () => {
    const user = userEvent.setup();
    const addCategoryItem = vi.fn();
    renderTab({ addCategoryItem });
    await user.click(screen.getByText("Add Category"));
    expect(addCategoryItem).toHaveBeenCalledTimes(1);
  });

  it("calls removeCategoryItem when delete is clicked", async () => {
    const user = userEvent.setup();
    const removeCategoryItem = vi.fn();
    renderTab({ removeCategoryItem });
    const buttons = screen.getAllByLabelText(/Remove category/);
    await user.click(buttons[0]);
    expect(removeCategoryItem).toHaveBeenCalledWith(0);
  });

  it("calls updateCategoryItem when ID field changes", async () => {
    const user = userEvent.setup();
    const updateCategoryItem = vi.fn();
    renderTab({ updateCategoryItem });

    const inputs = screen.getAllByRole("textbox");
    await user.type(inputs[0], "x");
    expect(updateCategoryItem).toHaveBeenCalled();
  });

  it("calls updateCategoryItem when Label field changes", async () => {
    const user = userEvent.setup();
    const updateCategoryItem = vi.fn();
    renderTab({ updateCategoryItem });

    const inputs = screen.getAllByRole("textbox");
    await user.type(inputs[1], "x");
    expect(updateCategoryItem).toHaveBeenCalled();
  });
});
