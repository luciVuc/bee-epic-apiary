import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BrowserRouter } from "react-router-dom";
import { Sidebar } from "../Sidebar";

function renderWithRouter(ui: React.ReactElement) {
  return render(<BrowserRouter>{ui}</BrowserRouter>);
}

describe("Sidebar", () => {
  it("renders all navigation items", () => {
    renderWithRouter(<Sidebar />);
    expect(screen.getByText("Dashboard")).toBeInTheDocument();
    expect(screen.getByText("Products")).toBeInTheDocument();
    expect(screen.getByText("Settings")).toBeInTheDocument();
  });

  it("renders the admin panel title", () => {
    renderWithRouter(<Sidebar />);
    expect(screen.getByText("Admin Panel")).toBeInTheDocument();
  });

  it("renders all links with correct hrefs", () => {
    renderWithRouter(<Sidebar />);
    const links = screen.getAllByRole("link");
    const hrefs = links.map((link) => link.getAttribute("href"));
    expect(hrefs).toContain("/dashboard");
    expect(hrefs).toContain("/products");
    expect(hrefs).toContain("/settings");
  });

  it("calls onClose when close button is clicked", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    renderWithRouter(<Sidebar onClose={onClose} />);
    const closeButton = screen.getByLabelText("Close sidebar");
    await user.click(closeButton);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("calls onClose when a nav link is clicked", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    renderWithRouter(<Sidebar onClose={onClose} />);
    await user.click(screen.getByText("Products"));
    expect(onClose).toHaveBeenCalled();
  });

  it("does not render close button on desktop (lg:hidden)", () => {
    renderWithRouter(<Sidebar />);
    const closeButton = screen.getByLabelText("Close sidebar");
    expect(closeButton.className).toContain("lg:hidden");
  });
});
