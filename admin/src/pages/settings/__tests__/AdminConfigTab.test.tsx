import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AdminConfigTab } from "../AdminConfigTab";
import type { ISiteContent } from "../../../types/settings";
import { DEFAULT_SITE } from "../../../utils/constants";

const defaultSite: ISiteContent = { ...DEFAULT_SITE };

function renderTab(
  props: Partial<React.ComponentProps<typeof AdminConfigTab>> = {},
) {
  return render(
    <AdminConfigTab
      siteContent={defaultSite}
      onSiteChange={vi.fn()}
      {...props}
    />,
  );
}

describe("AdminConfigTab", () => {
  beforeEach(() => {
    vi.stubEnv("VITE_API_SECRET_KEY", "");
  });

  it("renders all sections", () => {
    renderTab();
    expect(screen.getByText("API Configuration")).toBeInTheDocument();
    expect(screen.getByText("API Secret Key")).toBeInTheDocument();
    expect(screen.getByText("Stripe Configuration")).toBeInTheDocument();
    expect(screen.getByText("Formspree Configuration")).toBeInTheDocument();
  });

  it("shows API URL as read-only", () => {
    renderTab();
    const urlInput = screen.getByLabelText("API URL (Cloudflare Worker)");
    expect(urlInput).toBeDisabled();
  });

  it("shows secret key status indicator", () => {
    renderTab();
    expect(
      screen.getByText("No API secret key configured"),
    ).toBeInTheDocument();
  });

  it("calls onSiteChange for stripe publishable key", async () => {
    const user = userEvent.setup();
    const onSiteChange = vi.fn();
    renderTab({ onSiteChange });

    const inputs = screen.getAllByRole("textbox");
    const stripeInput = inputs.find(
      (input) => input.getAttribute("placeholder") === "pk_test_...",
    );
    expect(stripeInput).toBeTruthy();
    if (stripeInput) {
      await user.type(stripeInput, "x");
      expect(onSiteChange).toHaveBeenCalledWith("stripePublishableKey", "x");
    }
  });

  it("calls onSiteChange for formspree form ID", async () => {
    const user = userEvent.setup();
    const onSiteChange = vi.fn();
    renderTab({ onSiteChange });

    const inputs = screen.getAllByRole("textbox");
    const formspreeInput = inputs.find(
      (input) => input.getAttribute("placeholder") === "xoqblgva",
    );
    expect(formspreeInput).toBeTruthy();
    if (formspreeInput) {
      await user.type(formspreeInput, "x");
      expect(onSiteChange).toHaveBeenCalledWith("formspreeFormId", "x");
    }
  });

  it("does not render save button", () => {
    renderTab();
    expect(screen.queryByText("Save Admin Settings")).not.toBeInTheDocument();
  });
});
