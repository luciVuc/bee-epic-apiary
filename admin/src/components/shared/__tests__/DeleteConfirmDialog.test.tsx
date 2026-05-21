import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DeleteConfirmDialog } from "../DeleteConfirmDialog";

describe("DeleteConfirmDialog", () => {
  it("renders nothing when isOpen is false", () => {
    render(
      <DeleteConfirmDialog
        isOpen={false}
        productName="Test"
        onCancel={() => {}}
        onConfirm={() => {}}
      />,
    );
    expect(screen.queryByText("Confirm Delete")).not.toBeInTheDocument();
  });

  it("renders dialog when isOpen is true", () => {
    render(
      <DeleteConfirmDialog
        isOpen={true}
        productName="Test Honey"
        onCancel={() => {}}
        onConfirm={() => {}}
      />,
    );
    expect(screen.getByText("Confirm Delete")).toBeInTheDocument();
    expect(
      screen.getByText(/Are you sure you want to delete "Test Honey"/),
    ).toBeInTheDocument();
  });

  it("calls onCancel when Cancel is clicked", async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    render(
      <DeleteConfirmDialog
        isOpen={true}
        productName="Test"
        onCancel={onCancel}
        onConfirm={() => {}}
      />,
    );
    await user.click(screen.getByText("Cancel"));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("calls onConfirm when Delete is clicked", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(
      <DeleteConfirmDialog
        isOpen={true}
        productName="Test"
        onCancel={() => {}}
        onConfirm={onConfirm}
      />,
    );
    await user.click(screen.getByText("Delete"));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });
});
