import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { SettingsPage } from "../SettingsPage";
import type { ICaller } from "../../types";
import { EStaffRole } from "../../types";

const { mockGetSettings, mockSaveSettings } = vi.hoisted(() => ({
  mockGetSettings: vi.fn(),
  mockSaveSettings: vi.fn(),
}));

vi.mock("../../utils/api", async () => {
  // Use importOriginal so ApiError + apiErrorMessage carry their real
  // implementations through; only the `api` namespace is mocked.
  const actual =
    await vi.importActual<typeof import("../../utils/api")>("../../utils/api");
  return {
    ...actual,
    api: {
      getSettings: mockGetSettings,
      saveSettings: mockSaveSettings,
      getWhoami: vi.fn().mockResolvedValue({ caller: null }),
    },
  };
});

vi.mock("../settings/UsersTab", () => ({
  UsersTab: () => <div data-testid="users-tab">UsersTab mock</div>,
}));

vi.mock("../settings/SecurityTab", () => ({
  SecurityTab: () => <div data-testid="security-tab">SecurityTab mock</div>,
}));

const mockCaller = vi.fn<() => ICaller | null>(() => null);
vi.mock("../../hooks/useCaller", () => ({
  useCaller: () => ({
    caller: mockCaller(),
    status: "succeeded",
    error: null,
    refetch: vi.fn(),
  }),
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
    mockSaveSettings.mockResolvedValue(undefined);
    mockCaller.mockReturnValue(null);
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

  it("shows Users and Security tabs for OWNER", () => {
    mockCaller.mockReturnValue({
      email: "owner@test.com",
      role: EStaffRole.OWNER,
      via: "bearer",
    });
    renderWithRouter();
    expect(screen.getByText("Users")).toBeInTheDocument();
    expect(screen.getByText("Security")).toBeInTheDocument();
  });

  it("hides Users and Security tabs for non-owner", () => {
    mockCaller.mockReturnValue({
      email: "manager@test.com",
      role: EStaffRole.MANAGER,
      via: "bearer",
    });
    renderWithRouter();
    expect(screen.queryByText("Users")).not.toBeInTheDocument();
    expect(screen.queryByText("Security")).not.toBeInTheDocument();
  });

  it("does not show Staff tab (replaced by Users and Security)", () => {
    mockCaller.mockReturnValue({
      email: "owner@test.com",
      role: EStaffRole.OWNER,
      via: "bearer",
    });
    renderWithRouter();
    expect(screen.queryByText("Staff")).not.toBeInTheDocument();
  });

  it("shows admin tab by default", async () => {
    renderWithRouter();
    expect(await screen.findByText("API Configuration")).toBeInTheDocument();
  });

  it("clicking Users tab renders UsersTab", async () => {
    const user = userEvent.setup();
    mockCaller.mockReturnValue({
      email: "owner@test.com",
      role: EStaffRole.OWNER,
      via: "bearer",
    });
    renderWithRouter();
    await user.click(screen.getByText("Users"));
    expect(screen.getByTestId("users-tab")).toBeInTheDocument();
  });

  it("clicking Security tab renders SecurityTab", async () => {
    const user = userEvent.setup();
    mockCaller.mockReturnValue({
      email: "owner@test.com",
      role: EStaffRole.OWNER,
      via: "bearer",
    });
    renderWithRouter();
    await user.click(screen.getByText("Security"));
    expect(screen.getByTestId("security-tab")).toBeInTheDocument();
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

  describe("handleSaveSetting handlers (review I8 coverage)", () => {
    // Saves go through handleSaveSetting(type) which is a single function
    // exercising one switch branch per tab plus success/error transitions.
    // The save button is disabled unless the per-tab content differs from
    // its initialContentRef, so we have to flip a flag first.

    async function flipSiteContent(user: ReturnType<typeof userEvent.setup>) {
      // Type a single character into Business Name to mark the form dirty.
      await user.click(screen.getByText("Site Content"));
      const businessName = (
        await screen.findAllByDisplayValue(/Bee Epic Apiary/i)
      )[0];
      await user.type(businessName, "!");
    }

    it("saves Site Content (success path)", async () => {
      const user = userEvent.setup();
      renderWithRouter();
      await flipSiteContent(user);
      const saveBtn = screen.getByTestId("settings-page_save-site-btn");
      fireEvent.click(saveBtn);
      await waitFor(() =>
        expect(mockSaveSettings).toHaveBeenCalledWith(
          "site",
          expect.any(Object),
        ),
      );
    });

    it("renders an error banner when saveSettings rejects", async () => {
      mockSaveSettings.mockRejectedValueOnce(new Error("Network down"));
      const user = userEvent.setup();
      renderWithRouter();
      await flipSiteContent(user);
      const saveBtn = screen.getByTestId("settings-page_save-site-btn");
      fireEvent.click(saveBtn);
      await screen.findByText("Network down");
    });

    it("renders an error banner with the IApiError envelope message when present", async () => {
      // The slice now extracts user-facing messages via apiErrorMessage,
      // which understands the structured IApiError envelope wrapped in
      // ApiError. BAD_REQUEST is the simplest "carry a message" code.
      const { ApiError } =
        await vi.importActual<typeof import("../../utils/api")>(
          "../../utils/api",
        );
      mockSaveSettings.mockRejectedValueOnce(
        new ApiError({ code: "BAD_REQUEST", message: "Validation failed" }),
      );
      const user = userEvent.setup();
      renderWithRouter();
      await flipSiteContent(user);
      const saveBtn = screen.getByTestId("settings-page_save-site-btn");
      fireEvent.click(saveBtn);
      await screen.findByText("Validation failed");
    });
  });

  describe("Process tab add/remove handlers", () => {
    it("adds a process step and enables Save", async () => {
      const user = userEvent.setup();
      renderWithRouter();
      await user.click(screen.getByText("Process"));
      const initialSteps = screen.queryAllByLabelText("Title").length;
      await user.click(screen.getByText("Add Step"));
      const afterSteps = screen.queryAllByLabelText("Title").length;
      expect(afterSteps).toBe(initialSteps + 1);
    });

    it("removes a process step", async () => {
      const user = userEvent.setup();
      renderWithRouter();
      await user.click(screen.getByText("Process"));
      const initial = screen.queryAllByLabelText("Title").length;
      const removeBtn = screen.getByLabelText("Remove process step 1");
      fireEvent.click(removeBtn);
      const after = screen.queryAllByLabelText("Title").length;
      expect(after).toBe(initial - 1);
    });
  });

  describe("Testimonials tab add/remove handlers", () => {
    it("adds a testimonial", async () => {
      const user = userEvent.setup();
      renderWithRouter();
      await user.click(screen.getByText("Testimonials"));
      const initial = screen.queryAllByLabelText("Name").length;
      await user.click(screen.getByText("Add Testimonial"));
      const after = screen.queryAllByLabelText("Name").length;
      expect(after).toBe(initial + 1);
    });

    it("removes a testimonial", async () => {
      const user = userEvent.setup();
      renderWithRouter();
      await user.click(screen.getByText("Testimonials"));
      const initial = screen.queryAllByLabelText("Name").length;
      const removeBtn = screen.getByLabelText("Remove testimonial 1");
      fireEvent.click(removeBtn);
      const after = screen.queryAllByLabelText("Name").length;
      expect(after).toBe(initial - 1);
    });
  });

  describe("Categories tab add/remove handlers", () => {
    it("adds a category", async () => {
      const user = userEvent.setup();
      renderWithRouter();
      await user.click(screen.getByText("Categories"));
      const initial = screen.queryAllByPlaceholderText("HONEY").length;
      await user.click(screen.getByText("Add Category"));
      const after = screen.queryAllByPlaceholderText("HONEY").length;
      expect(after).toBe(initial + 1);
    });
  });
});
