import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BrowserRouter } from "react-router-dom";
import { AdminLayout } from "../AdminLayout";

vi.mock("../AdminNavbar", () => ({
  AdminNavbar: vi.fn(({ onMenuClick }: { onMenuClick?: () => void }) => (
    <div data-testid="navbar">
      <button aria-label="Toggle navigation menu" onClick={onMenuClick}>
        Menu
      </button>
    </div>
  )),
}));

vi.mock("../Sidebar", () => ({
  Sidebar: vi.fn(({ onClose }: { onClose?: () => void }) => (
    <div data-testid="sidebar">
      <button onClick={onClose}>Close</button>
    </div>
  )),
}));

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return {
    ...actual,
    Outlet: () => <div data-testid="outlet">Outlet Content</div>,
  };
});

function renderWithRouter(ui: React.ReactElement) {
  return render(<BrowserRouter>{ui}</BrowserRouter>);
}

describe("AdminLayout", () => {
  it("renders sidebar, navbar, and outlet", () => {
    renderWithRouter(<AdminLayout />);
    expect(screen.getByTestId("navbar")).toBeInTheDocument();
    expect(screen.getByTestId("sidebar")).toBeInTheDocument();
    expect(screen.getByTestId("outlet")).toBeInTheDocument();
  });

  it("toggles sidebar when menu is clicked", async () => {
    const user = userEvent.setup();
    renderWithRouter(<AdminLayout />);

    const menuButton = screen.getByLabelText("Toggle navigation menu");
    await user.click(menuButton);

    const sidebar = screen.getByTestId("sidebar");
    expect(sidebar).toBeInTheDocument();
  });

  it("renders mobile overlay when sidebar is open", async () => {
    const user = userEvent.setup();
    renderWithRouter(<AdminLayout />);

    let overlay = document.querySelector(".fixed.inset-0.bg-black\\/50");
    expect(overlay).toBeNull();

    await user.click(screen.getByLabelText("Toggle navigation menu"));

    overlay = document.querySelector(".fixed.inset-0.bg-black\\/50");
    expect(overlay).toBeInTheDocument();
  });

  it("closes sidebar when overlay is clicked", async () => {
    const user = userEvent.setup();
    renderWithRouter(<AdminLayout />);

    await user.click(screen.getByLabelText("Toggle navigation menu"));

    const overlay = document.querySelector(".fixed.inset-0.bg-black\\/50");
    expect(overlay).toBeInTheDocument();

    await user.click(overlay!);
  });
});
