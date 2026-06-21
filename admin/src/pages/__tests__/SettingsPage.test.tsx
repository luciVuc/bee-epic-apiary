import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { SettingsPage } from "../SettingsPage";

const { mockGetSettings } = vi.hoisted(() => ({
  mockGetSettings: vi.fn(),
}));

vi.mock("../../utils/api", () => ({
  api: {
    getSettings: mockGetSettings,
    saveSettings: vi.fn().mockResolvedValue(undefined),
  },
}));

function renderWithRouter() {
  return render(
    <MemoryRouter>
      <SettingsPage />
    </MemoryRouter>,
  );
}

describe("SettingsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    mockGetSettings.mockResolvedValue(null);
  });

  it("renders settings title", () => {
    renderWithRouter();
    expect(screen.getByText("Settings")).toBeInTheDocument();
  });

  it("renders all tab buttons", () => {
    renderWithRouter();
    expect(screen.getByText("Admin Config")).toBeInTheDocument();
    expect(screen.getByText("Site Content")).toBeInTheDocument();
    expect(screen.getByText("Process")).toBeInTheDocument();
    expect(screen.getByText("Testimonials")).toBeInTheDocument();
    expect(screen.getByText("Categories")).toBeInTheDocument();
  });

  it("shows admin tab by default", async () => {
    renderWithRouter();
    expect(await screen.findByText("API Configuration")).toBeInTheDocument();
  });

  it("switches to site content tab", async () => {
    const user = userEvent.setup();
    renderWithRouter();

    await user.click(screen.getByText("Site Content"));
    expect(screen.getByText("Business Info")).toBeInTheDocument();
    expect(screen.getByText("Hero Section")).toBeInTheDocument();
    expect(screen.getByText("Save Site Content")).toBeInTheDocument();
  });

  it("switches to process tab", async () => {
    const user = userEvent.setup();
    renderWithRouter();

    await user.click(screen.getByText("Process"));
    expect(screen.getByText("Add Step")).toBeInTheDocument();
    expect(screen.getByText("Save Process Steps")).toBeInTheDocument();
  });

  it("switches to testimonials tab", async () => {
    const user = userEvent.setup();
    renderWithRouter();

    await user.click(screen.getByText("Testimonials"));
    expect(screen.getByText("Add Testimonial")).toBeInTheDocument();
    expect(screen.getByText("Save Testimonials")).toBeInTheDocument();
  });

  it("switches to categories tab", async () => {
    const user = userEvent.setup();
    renderWithRouter();

    await user.click(screen.getByText("Categories"));
    expect(screen.getByText("Add Category")).toBeInTheDocument();
    expect(screen.getByText("Save Categories")).toBeInTheDocument();
  });

  it("shows loading state when content is loading", async () => {
    mockGetSettings.mockImplementation(() => new Promise(() => {}));

    renderWithRouter();
    expect(document.querySelector(".animate-spin")).toBeInTheDocument();
  });
});
