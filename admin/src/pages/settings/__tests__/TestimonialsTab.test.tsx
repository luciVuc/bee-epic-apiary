import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TestimonialsTab } from "../TestimonialsTab";
import { DEFAULT_TESTIMONIALS } from "../../../utils/constants";

const defaultTestimonials = DEFAULT_TESTIMONIALS;

function renderTab(
  props: Partial<React.ComponentProps<typeof TestimonialsTab>> = {},
) {
  return render(
    <TestimonialsTab
      testimonialsContent={defaultTestimonials}
      addTestimonial={vi.fn()}
      updateTestimonial={vi.fn()}
      removeTestimonial={vi.fn()}
      {...props}
    />,
  );
}

describe("TestimonialsTab", () => {
  it("renders all testimonials", () => {
    renderTab();
    expect(screen.getByText("Testimonial 1")).toBeInTheDocument();
    expect(screen.getByText("Testimonial 5")).toBeInTheDocument();
  });

  it("renders testimonial names from defaults", () => {
    renderTab();
    expect(screen.getByDisplayValue("Jennifer Walker")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Michael Torres")).toBeInTheDocument();
  });

  it("renders add button", () => {
    renderTab();
    expect(screen.getByText("Add Testimonial")).toBeInTheDocument();
  });

  it("calls addTestimonial when clicked", async () => {
    const user = userEvent.setup();
    const addTestimonial = vi.fn();
    renderTab({ addTestimonial });
    await user.click(screen.getByText("Add Testimonial"));
    expect(addTestimonial).toHaveBeenCalledTimes(1);
  });

  it("calls removeTestimonial when delete is clicked", async () => {
    const user = userEvent.setup();
    const removeTestimonial = vi.fn();
    renderTab({ removeTestimonial });
    const buttons = screen.getAllByLabelText(/Remove testimonial/);
    await user.click(buttons[0]);
    expect(removeTestimonial).toHaveBeenCalledWith(0);
  });

  it("calls updateTestimonial when a field changes", async () => {
    const user = userEvent.setup();
    const updateTestimonial = vi.fn();
    renderTab({ updateTestimonial });

    const nameInput = screen.getByDisplayValue("Jennifer Walker");
    await user.type(nameInput, "x");
    expect(updateTestimonial).toHaveBeenCalled();
  });
});
