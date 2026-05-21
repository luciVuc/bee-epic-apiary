import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AdminConfigTab } from "../AdminConfigTab";
import type { IAdminSettings } from "../../../types";

const defaultSettings: IAdminSettings = {
  apiUrl: "",
  stripePublishableKey: "",
  apiSecretKey: "",
};

function renderTab(
  props: Partial<React.ComponentProps<typeof AdminConfigTab>> = {},
) {
  return render(
    <AdminConfigTab
      adminSettings={defaultSettings}
      adminSaved={false}
      adminError=""
      onAdminChange={vi.fn()}
      onAdminSave={vi.fn()}
      {...props}
    />,
  );
}

describe("AdminConfigTab", () => {
  it("renders all sections", () => {
    renderTab();
    expect(screen.getByText("API Configuration")).toBeInTheDocument();
    expect(screen.getAllByText("API Secret Key").length).toBeGreaterThanOrEqual(
      1,
    );
    expect(screen.getByText("Stripe Configuration")).toBeInTheDocument();
  });

  it("renders admin error message", () => {
    renderTab({ adminError: "Something went wrong" });
    expect(screen.getByText("Something went wrong")).toBeInTheDocument();
  });

  it("renders saved success message", () => {
    renderTab({ adminSaved: true });
    expect(
      screen.getByText("Admin settings saved successfully!"),
    ).toBeInTheDocument();
  });

  it("calls onAdminSave when save button is clicked", async () => {
    const user = userEvent.setup();
    const onAdminSave = vi.fn();
    renderTab({ onAdminSave });
    await user.click(screen.getByText("Save Admin Settings"));
    expect(onAdminSave).toHaveBeenCalledTimes(1);
  });

  it("calls onAdminChange when API URL changes", async () => {
    const user = userEvent.setup();
    const onAdminChange = vi.fn();
    renderTab({ onAdminChange });

    const inputs = screen.getAllByRole("textbox");
    await user.type(inputs[0], "x");
    expect(onAdminChange).toHaveBeenCalledWith("apiUrl", "x");
  });

  it("calls onAdminChange for secret key", async () => {
    const user = userEvent.setup();
    const onAdminChange = vi.fn();
    const { container } = renderTab({ onAdminChange });

    const secretInput = container.querySelector('input[type="password"]');
    expect(secretInput).not.toBeNull();
    await user.type(secretInput!, "x");
    expect(onAdminChange).toHaveBeenCalledWith("apiSecretKey", "x");
  });

  it("calls onAdminChange for stripe key", async () => {
    const user = userEvent.setup();
    const onAdminChange = vi.fn();
    renderTab({ onAdminChange });

    const inputs = screen.getAllByRole("textbox");
    await user.type(inputs[1], "x");
    expect(onAdminChange).toHaveBeenCalledWith("stripePublishableKey", "x");
  });
});
