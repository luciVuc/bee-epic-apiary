import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AdminConfigTab } from "../AdminConfigTab";
import type { ISiteContent } from "../../../types/settings";
import type { ICaller } from "../../../types";
import { EStaffRole } from "../../../types";
import { DEFAULT_SITE } from "../../../utils/constants";

const defaultSite: ISiteContent = { ...DEFAULT_SITE };

const mockCaller = vi.fn<() => ICaller | null>(() => null);
vi.mock("../../../hooks/useCaller", () => ({
  useCaller: () => ({
    caller: mockCaller(),
    status: "succeeded",
    error: null,
    refetch: vi.fn(),
  }),
}));

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
    vi.clearAllMocks();
    mockCaller.mockReturnValue(null);
  });

  it("renders all sections", () => {
    renderTab();
    expect(screen.getByText("API Configuration")).toBeInTheDocument();
    expect(screen.getByText("Authentication")).toBeInTheDocument();
    expect(screen.getByText("Stripe Configuration")).toBeInTheDocument();
    expect(screen.getByText("Formspark Configuration")).toBeInTheDocument();
    expect(screen.getByText("Email Notifications")).toBeInTheDocument();
  });

  it("shows API URL as read-only", () => {
    renderTab();
    const urlInput = screen.getByLabelText("API URL (Cloudflare Worker)");
    expect(urlInput).toBeDisabled();
  });

  it("shows not authenticated when caller is null", () => {
    renderTab();
    expect(screen.getByText("Not authenticated")).toBeInTheDocument();
  });

  it("shows caller email and role when authenticated", () => {
    mockCaller.mockReturnValue({
      email: "owner@test.com",
      role: EStaffRole.OWNER,
      via: "cookie",
    });
    renderTab();
    expect(screen.getByText("owner@test.com")).toBeInTheDocument();
    expect(screen.getByText("OWNER")).toBeInTheDocument();
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

  it("calls onSiteChange for formspark form ID", async () => {
    const user = userEvent.setup();
    const onSiteChange = vi.fn();
    renderTab({ onSiteChange });

    const inputs = screen.getAllByRole("textbox");
    const formsparkInput = inputs.find(
      (input) => input.getAttribute("placeholder") === "your-form-id",
    );
    expect(formsparkInput).toBeTruthy();
    if (formsparkInput) {
      await user.type(formsparkInput, "x");
      expect(onSiteChange).toHaveBeenCalledWith("formsparkFormId", "x");
    }
  });

  it("renders email format select", () => {
    renderTab();
    const select = screen.getByLabelText("Notification Email Format");
    expect(select).toBeInTheDocument();
  });

  it("calls onSiteChange for email format", async () => {
    const user = userEvent.setup();
    const onSiteChange = vi.fn();
    renderTab({ onSiteChange });

    const select = screen.getByLabelText("Notification Email Format");
    await user.selectOptions(select, "markdown");
    expect(onSiteChange).toHaveBeenCalledWith("emailFormat", "markdown");
  });

  it("does not render save button", () => {
    renderTab();
    expect(screen.queryByText("Save Admin Settings")).not.toBeInTheDocument();
  });

  it("does not render 'Cloudflare Access' anywhere (regression guard)", () => {
    renderTab();
    expect(screen.queryByText("Cloudflare Access")).not.toBeInTheDocument();
  });

  it("renders new authentication copy about bea_at cookie, Users tab, and Security tab", () => {
    renderTab();
    expect(
      screen.getByText(
        /Identity is verified via the bea_at cookie issued at login/i,
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/User accounts and roles are managed on the Users tab/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Password policy is managed on the Security tab/i),
    ).toBeInTheDocument();
  });
});
