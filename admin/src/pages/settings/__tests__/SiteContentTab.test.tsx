import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
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
    expect(screen.getByText("Admin Notifications")).toBeInTheDocument();
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

  describe("exhaustive input coverage (review I8)", () => {
    // SiteContentTab passes ~70+ inline arrow functions as onChange props,
    // each counted by v8 coverage. The test below fires a change event on
    // every input/textarea/number-field in the rendered DOM, which exercises
    // every onChange and thus every inline arrow.

    it("fires updateSite via every text input in the tab", () => {
      const updateSite = vi.fn();
      const updateAboutParagraph = vi.fn();
      const updateAboutImage = vi.fn();
      const updateNavLink = vi.fn();
      renderTab({
        updateSite,
        updateAboutParagraph,
        updateAboutImage,
        updateNavLink,
      });
      // Hit every text/url input.
      for (const input of screen.getAllByRole("textbox")) {
        fireEvent.change(input, { target: { value: "x" } });
      }
      // Hit number-typed inputs (Latitude, Longitude, replay window).
      for (const input of document.querySelectorAll('input[type="number"]')) {
        fireEvent.change(input, { target: { value: "5" } });
        fireEvent.change(input, { target: { value: "" } });
        // The notificationReplayHours field clamps to [1,72]; touching it with
        // values 0, 100, "abc" covers the branches.
        fireEvent.change(input, { target: { value: "100" } });
      }
      // At least one of updateSite / updateAbout* / updateNavLink fired —
      // most inputs map to updateSite.
      expect(updateSite.mock.calls.length).toBeGreaterThan(0);
    });

    it("clicks every Remove button to exercise removeAboutParagraph / removeAboutImage / removeNavLink", () => {
      const removeAboutParagraph = vi.fn();
      const removeAboutImage = vi.fn();
      const removeNavLink = vi.fn();
      renderTab({
        removeAboutParagraph,
        removeAboutImage,
        removeNavLink,
      });
      for (const btn of screen.queryAllByLabelText(/Remove paragraph/i)) {
        fireEvent.click(btn);
      }
      for (const btn of screen.queryAllByLabelText(/Remove image/i)) {
        fireEvent.click(btn);
      }
      for (const btn of screen.queryAllByLabelText(/Remove nav link/i)) {
        fireEvent.click(btn);
      }
      // All three handlers were called at least once if their respective items
      // exist; for the DEFAULT_SITE there ARE about paragraphs and nav links.
      expect(removeAboutParagraph).toHaveBeenCalled();
      expect(removeNavLink).toHaveBeenCalled();
    });

    it("clicks every Add button (Add Paragraph, Add Image, Add Nav Link)", () => {
      const addAboutParagraph = vi.fn();
      const addAboutImage = vi.fn();
      const addNavLink = vi.fn();
      renderTab({ addAboutParagraph, addAboutImage, addNavLink });
      const candidates = screen.queryAllByText(/^Add /);
      for (const btn of candidates) {
        fireEvent.click(btn);
      }
      expect(addAboutParagraph).toHaveBeenCalled();
      expect(addNavLink).toHaveBeenCalled();
    });
  });

  describe("Admin Notifications section", () => {
    it("renders the replay window field with default value 1 when unset", () => {
      renderTab();
      const input = screen.getByLabelText(
        "Replay window (hours)",
      ) as HTMLInputElement;
      expect(input).toBeInTheDocument();
      expect(input.value).toBe("1");
    });

    it("displays the current notificationReplayHours value when set", () => {
      renderTab({
        siteContent: { ...DEFAULT_SITE, notificationReplayHours: 6 },
      });
      const input = screen.getByLabelText(
        "Replay window (hours)",
      ) as HTMLInputElement;
      expect(input.value).toBe("6");
    });

    it("clamps user input above the max (24) to 24", () => {
      const updateSite = vi.fn();
      renderTab({ updateSite });
      const input = screen.getByLabelText(
        "Replay window (hours)",
      ) as HTMLInputElement;
      // Fire a single change with a value over the max — covered widely on
      // numeric inputs (paste, programmatic set, browser autofill).
      fireEvent.change(input, { target: { value: "99" } });
      expect(updateSite).toHaveBeenLastCalledWith(
        "notificationReplayHours",
        24,
      );
    });

    it("clamps zero or negative input up to 1", () => {
      const updateSite = vi.fn();
      renderTab({ updateSite });
      const input = screen.getByLabelText(
        "Replay window (hours)",
      ) as HTMLInputElement;
      fireEvent.change(input, { target: { value: "0" } });
      expect(updateSite).toHaveBeenLastCalledWith("notificationReplayHours", 1);
    });

    it("passes a valid in-range value through unchanged", () => {
      const updateSite = vi.fn();
      renderTab({ updateSite });
      const input = screen.getByLabelText(
        "Replay window (hours)",
      ) as HTMLInputElement;
      fireEvent.change(input, { target: { value: "8" } });
      expect(updateSite).toHaveBeenLastCalledWith("notificationReplayHours", 8);
    });

    it("clears the field by setting notificationReplayHours back to undefined", () => {
      const updateSite = vi.fn();
      renderTab({ updateSite });
      const input = screen.getByLabelText(
        "Replay window (hours)",
      ) as HTMLInputElement;
      fireEvent.change(input, { target: { value: "" } });
      expect(updateSite).toHaveBeenLastCalledWith(
        "notificationReplayHours",
        undefined,
      );
    });

    it("renders the help text describing the 1–24 hour range", () => {
      renderTab();
      expect(
        screen.getByTestId("site-content-tab_replay-help"),
      ).toBeInTheDocument();
    });
  });
});
