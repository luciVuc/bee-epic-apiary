import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SiteContentTab } from "../SiteContentTab";
import { DEFAULT_SITE } from "../../../utils/constants";

function renderTab(
  props: Partial<React.ComponentProps<typeof SiteContentTab>> = {},
) {
  return render(
    <SiteContentTab
      siteContent={DEFAULT_SITE}
      updateSite={vi.fn()}
      addAboutParagraph={vi.fn()}
      updateAboutParagraph={vi.fn()}
      removeAboutParagraph={vi.fn()}
      addAboutImage={vi.fn()}
      updateAboutImage={vi.fn()}
      removeAboutImage={vi.fn()}
      addNavLink={vi.fn()}
      updateNavLink={vi.fn()}
      removeNavLink={vi.fn()}
      {...props}
    />,
  );
}

describe("SiteContentTab", () => {
  it("renders all sections", () => {
    renderTab();
    expect(screen.getByText("Business Info")).toBeInTheDocument();
    expect(screen.getByText("Hero Section")).toBeInTheDocument();
    expect(screen.getByText("About Section")).toBeInTheDocument();
    expect(screen.getByText("Section Titles")).toBeInTheDocument();
    expect(screen.getByText("Stats Bar")).toBeInTheDocument();
    expect(screen.getByText("Navigation Links")).toBeInTheDocument();
    expect(screen.getByText("Social Links")).toBeInTheDocument();
    expect(screen.getByText("Order Confirmation")).toBeInTheDocument();
    expect(screen.getByText("Other")).toBeInTheDocument();
  });

  it("renders about paragraphs from site content", () => {
    renderTab();
    const textareas = screen.getAllByRole("textbox");
    expect(textareas.length).toBeGreaterThan(0);
  });

  it("calls addAboutParagraph when Add Paragraph is clicked", async () => {
    const user = userEvent.setup();
    const addAboutParagraph = vi.fn();
    renderTab({ addAboutParagraph });
    await user.click(screen.getByText("Add Paragraph"));
    expect(addAboutParagraph).toHaveBeenCalledTimes(1);
  });

  it("calls addNavLink when Add Nav Link is clicked", async () => {
    const user = userEvent.setup();
    const addNavLink = vi.fn();
    renderTab({ addNavLink });
    await user.click(screen.getByText("Add Nav Link"));
    expect(addNavLink).toHaveBeenCalledTimes(1);
  });

  it("calls removeAboutParagraph when remove button is clicked", async () => {
    const user = userEvent.setup();
    const removeAboutParagraph = vi.fn();
    renderTab({ removeAboutParagraph });
    const removeButtons = screen.getAllByLabelText(/Remove paragraph/);
    await user.click(removeButtons[0]);
    expect(removeAboutParagraph).toHaveBeenCalledWith(0);
  });

  it("calls updateSite when a text field changes", async () => {
    const user = userEvent.setup();
    const updateSite = vi.fn();
    renderTab({ updateSite });

    const inputs = screen.getAllByRole("textbox");
    await user.type(inputs[0], "x");
    expect(updateSite).toHaveBeenCalled();
  });

  it("renders social link fields", () => {
    renderTab();
    const inputs = screen.getAllByRole("textbox");
    const socialValues = [
      "https://instagram.com/beeepicapiary",
      "https://facebook.com/beeepicapiary",
      "https://etsy.com/shop/beeepicapiary",
    ];
    const found = inputs.filter((input) =>
      socialValues.includes(input.getAttribute("value") || ""),
    );
    expect(found.length).toBeGreaterThanOrEqual(1);
  });
});
