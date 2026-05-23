import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AdminNavbar } from "../AdminNavbar";

const mockGetSettings = vi.fn();

vi.mock("../../../utils/api", () => ({
  api: {
    getSettings: (...args: any[]) => mockGetSettings(...args),
  },
}));

describe("AdminNavbar", () => {
  it("renders fallback title while loading, then business name from API", async () => {
    mockGetSettings.mockResolvedValue({ businessName: "Test Apiary" });
    render(<AdminNavbar />);

    expect(screen.getAllByText("Admin").length).toBeGreaterThanOrEqual(1);

    await waitFor(() => {
      const titles = screen.getAllByText("Test Apiary Admin");
      expect(titles.length).toBe(2);
    });
    expect(mockGetSettings).toHaveBeenCalledWith("site");
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
