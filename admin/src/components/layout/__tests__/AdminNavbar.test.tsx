import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AdminNavbar } from "../AdminNavbar";

describe("AdminNavbar", () => {
  it("renders the title and user info", () => {
    render(<AdminNavbar />);
    const titles = screen.getAllByText("Bee Epic Apiary Admin");
    expect(titles.length).toBe(2);
    expect(screen.getByText("Admin")).toBeInTheDocument();
  });

  it("renders notification bell button", () => {
    render(<AdminNavbar />);
    expect(screen.getByLabelText("Notifications")).toBeInTheDocument();
  });

  it("calls onMenuClick when menu button is clicked", async () => {
    const user = userEvent.setup();
    const onMenuClick = vi.fn();
    render(<AdminNavbar onMenuClick={onMenuClick} />);
    const menuButton = screen.getByLabelText("Toggle navigation menu");
    await user.click(menuButton);
    expect(onMenuClick).toHaveBeenCalledTimes(1);
  });
});
