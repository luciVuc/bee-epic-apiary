/**
 * Tests for SecurityTab (Task 11.4).
 *
 * SecurityTab is the OWNER-only interface for the /settings/auth-policy surface:
 *   - Fetch and render the policy on mount
 *   - Edit minLength (with floor/ceiling validation), checkBreachCorpus, notifyOnPasswordChange
 *   - Save fires putAuthPolicy and shows a green success banner (auto-dismissing)
 *   - Save errors show a red banner; VALIDATION_FAILED gets explicit friendly copy
 *   - Read-only metadata row shows updatedBy + updatedAt (or "Never edited" when updatedAt === 0)
 *
 * Test wiring mirrors UsersTab.test.tsx: mocks api + useCaller directly,
 * no Redux Provider needed.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SecurityTab } from "../SecurityTab";
import * as apiModule from "../../../utils/api";
import { ApiError } from "../../../utils/api";
import type { IAuthPolicy } from "@bee-epic/shared";
import type { IApiError } from "@bee-epic/shared";

/* ─── mock api ───────────────────────────────────────────────────────── */

vi.mock("../../../utils/api", async () => {
  const actual =
    await vi.importActual<typeof import("../../../utils/api")>(
      "../../../utils/api",
    );
  return {
    ...actual,
    api: {
      ...actual.api,
      getAuthPolicy: vi.fn(),
      putAuthPolicy: vi.fn(),
    },
    apiErrorMessage: vi.fn((err: unknown, fallback: string) => {
      return actual.apiErrorMessage(err, fallback);
    }),
  };
});

/* ─── mock useCaller (SecurityTab doesn't use it, but keeps import clean) */

vi.mock("../../../hooks/useCaller", () => ({
  useCaller: () => ({
    caller: { email: "owner@example.com", role: "OWNER", via: "cookie" },
    status: "succeeded",
    error: null,
    refetch: vi.fn(),
  }),
}));

/* ─── test data ──────────────────────────────────────────────────────── */

const basePolicy: IAuthPolicy = {
  schemaVersion: 1,
  minLength: 12,
  checkBreachCorpus: true,
  notifyOnPasswordChange: true,
  updatedAt: 1700000000000,
  updatedBy: "owner@example.com",
};

const neverEditedPolicy: IAuthPolicy = {
  ...basePolicy,
  updatedAt: 0,
  updatedBy: "system@bootstrap.local",
};

/* ─── shorthand access to mocks ─────────────────────────────────────── */

type ApiMock = {
  getAuthPolicy: ReturnType<typeof vi.fn>;
  putAuthPolicy: ReturnType<typeof vi.fn>;
};

function mockApi(): ApiMock {
  return apiModule.api as unknown as ApiMock;
}

/* ─── helper: make a real ApiError ──────────────────────────────────── */

function makeApiError(code: string, extra?: Record<string, unknown>): ApiError {
  return new ApiError({ code, ...extra } as IApiError);
}

/* ─── render helper ──────────────────────────────────────────────────── */

function renderTab() {
  return render(<SecurityTab />);
}

/* ═══════════════════════════════════════════════════════════════════════
   Tests
   ═══════════════════════════════════════════════════════════════════════ */

describe("SecurityTab", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockApi().getAuthPolicy.mockResolvedValue(basePolicy);
  });

  /* 1 ── spinner while getAuthPolicy is in flight ──────────────────── */

  it("renders a spinner while getAuthPolicy is in flight", async () => {
    let resolve!: (v: IAuthPolicy) => void;
    mockApi().getAuthPolicy.mockReturnValueOnce(
      new Promise<IAuthPolicy>((res) => {
        resolve = res;
      }),
    );
    renderTab();
    expect(screen.getByTestId("security-tab_loading")).toBeInTheDocument();
    // Resolve so the component can clean up.
    resolve(basePolicy);
    await waitFor(() =>
      expect(
        screen.queryByTestId("security-tab_loading"),
      ).not.toBeInTheDocument(),
    );
  });

  /* 2 ── red alert + Retry on fetch failure ────────────────────────── */

  it("renders a red alert and Retry button on fetch failure", async () => {
    mockApi().getAuthPolicy.mockRejectedValueOnce(new Error("network error"));
    renderTab();
    await screen.findByTestId("security-tab_fetch-error");
    expect(screen.getByTestId("security-tab_retry-btn")).toBeInTheDocument();
  });

  /* 3 ── Retry button re-invokes getAuthPolicy ─────────────────────── */

  it("Retry button re-invokes getAuthPolicy", async () => {
    mockApi()
      .getAuthPolicy.mockRejectedValueOnce(new Error("network error"))
      .mockResolvedValueOnce(basePolicy);

    const user = userEvent.setup();
    renderTab();
    await screen.findByTestId("security-tab_retry-btn");
    await user.click(screen.getByTestId("security-tab_retry-btn"));
    await waitFor(() =>
      expect(mockApi().getAuthPolicy).toHaveBeenCalledTimes(2),
    );
  });

  /* 4 ── renders fetched policy values in form fields ─────────────── */

  it("renders the fetched policy values in form fields", async () => {
    renderTab();
    await screen.findByTestId("security-tab");

    const minInput = screen.getByTestId(
      "security-tab_min-length",
    ) as HTMLInputElement;
    expect(minInput.value).toBe("12");

    const corpusCheckbox = screen.getByTestId(
      "security-tab_check-breach-corpus",
    ) as HTMLInputElement;
    expect(corpusCheckbox.checked).toBe(true);

    const notifyCheckbox = screen.getByTestId(
      "security-tab_notify-on-change",
    ) as HTMLInputElement;
    expect(notifyCheckbox.checked).toBe(true);
  });

  /* 5a ── metadata row with updatedAt > 0 ─────────────────────────── */

  it("renders 'Last updated by' metadata when updatedAt > 0", async () => {
    renderTab();
    await screen.findByTestId("security-tab_metadata");
    const meta = screen.getByTestId("security-tab_metadata");
    expect(meta.textContent).toContain("owner@example.com");
    expect(meta.textContent).toContain(
      new Date(basePolicy.updatedAt).toLocaleDateString(),
    );
  });

  /* 5b ── metadata row with updatedAt === 0 ────────────────────────── */

  it("renders 'Never edited' when updatedAt === 0", async () => {
    mockApi().getAuthPolicy.mockResolvedValueOnce(neverEditedPolicy);
    renderTab();
    await screen.findByTestId("security-tab_metadata");
    expect(screen.getByTestId("security-tab_metadata").textContent).toContain(
      "Never edited",
    );
  });

  /* 6 ── form starts non-dirty → Save button disabled ─────────────── */

  it("Save button is disabled when form is not dirty", async () => {
    renderTab();
    await screen.findByTestId("security-tab");
    const saveBtn = screen.getByTestId(
      "security-tab_save-btn",
    ) as HTMLButtonElement;
    expect(saveBtn).toBeDisabled();
  });

  /* 7 ── changing a field enables Save; clicking Save fires putAuthPolicy */

  it("changing a field enables Save; clicking Save fires putAuthPolicy with correct payload", async () => {
    const updatedPolicy: IAuthPolicy = {
      ...basePolicy,
      minLength: 16,
      updatedAt: 1700001000000,
    };
    mockApi().putAuthPolicy.mockResolvedValueOnce(updatedPolicy);

    const user = userEvent.setup();
    renderTab();
    await screen.findByTestId("security-tab");

    // Change minLength to 16.
    const minInput = screen.getByTestId(
      "security-tab_min-length",
    ) as HTMLInputElement;
    await user.clear(minInput);
    await user.type(minInput, "16");

    const saveBtn = screen.getByTestId("security-tab_save-btn");
    expect(saveBtn).not.toBeDisabled();

    await user.click(saveBtn);

    await waitFor(() => {
      expect(mockApi().putAuthPolicy).toHaveBeenCalledWith(
        expect.objectContaining({
          schemaVersion: 1,
          minLength: 16,
          checkBreachCorpus: true,
          notifyOnPasswordChange: true,
        }),
      );
    });
  });

  /* 8 ── Save success shows green banner ──────────────────────────── */

  it("Save success shows green banner", async () => {
    const updatedPolicy: IAuthPolicy = { ...basePolicy, minLength: 14 };
    mockApi().putAuthPolicy.mockResolvedValueOnce(updatedPolicy);

    const user = userEvent.setup();
    renderTab();
    await screen.findByTestId("security-tab");

    const minInput = screen.getByTestId("security-tab_min-length");
    await user.clear(minInput);
    await user.type(minInput, "14");

    await user.click(screen.getByTestId("security-tab_save-btn"));

    await screen.findByTestId("security-tab_save-success");
    expect(screen.getByTestId("security-tab_save-success")).toBeInTheDocument();
  });

  /* 8b ── Save button re-disables after successful save ───────────── */

  it("Save button goes disabled after successful save (dirty resets)", async () => {
    const updatedPolicy: IAuthPolicy = {
      ...basePolicy,
      minLength: 14,
      updatedAt: 1700001000000,
    };
    mockApi().putAuthPolicy.mockResolvedValueOnce(updatedPolicy);

    const user = userEvent.setup();
    renderTab();
    await screen.findByTestId("security-tab");

    // Make a change so Save becomes enabled.
    const minInput = screen.getByTestId("security-tab_min-length");
    await user.clear(minInput);
    await user.type(minInput, "14");

    const saveBtn = screen.getByTestId(
      "security-tab_save-btn",
    ) as HTMLButtonElement;
    expect(saveBtn).not.toBeDisabled();

    // Save.
    await user.click(saveBtn);
    await screen.findByTestId("security-tab_save-success");

    // After a successful save, initial is updated to the server response and
    // draft matches it — so dirty is false and Save re-disables.
    expect(saveBtn).toBeDisabled();
  });

  /* 9 ── minLength below floor → inline error + Save disabled ─────── */

  it("minLength below floor shows inline error and disables Save", async () => {
    const user = userEvent.setup();
    renderTab();
    await screen.findByTestId("security-tab");

    const minInput = screen.getByTestId("security-tab_min-length");
    await user.clear(minInput);
    await user.type(minInput, "5");

    expect(
      screen.getByTestId("security-tab_min-length-error"),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("security-tab_min-length-error").textContent,
    ).toContain("cannot be below 8");

    const saveBtn = screen.getByTestId(
      "security-tab_save-btn",
    ) as HTMLButtonElement;
    expect(saveBtn).toBeDisabled();
  });

  it("putAuthPolicy NOT called when Save clicked while minLength is below floor", async () => {
    const user = userEvent.setup();
    renderTab();
    await screen.findByTestId("security-tab");

    const minInput = screen.getByTestId("security-tab_min-length");
    await user.clear(minInput);
    await user.type(minInput, "3");

    // Attempt to click (button is disabled, but verify API not called).
    const saveBtn = screen.getByTestId("security-tab_save-btn");
    expect(saveBtn).toBeDisabled();
    expect(mockApi().putAuthPolicy).not.toHaveBeenCalled();
  });

  /* 10 ── minLength above ceiling → inline error + Save disabled ───── */

  it("minLength above ceiling shows inline error and disables Save", async () => {
    const user = userEvent.setup();
    renderTab();
    await screen.findByTestId("security-tab");

    const minInput = screen.getByTestId("security-tab_min-length");
    await user.clear(minInput);
    await user.type(minInput, "129");

    expect(
      screen.getByTestId("security-tab_min-length-error"),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("security-tab_min-length-error").textContent,
    ).toContain("cannot exceed 128");

    expect(
      screen.getByTestId("security-tab_save-btn") as HTMLButtonElement,
    ).toBeDisabled();
  });

  /* 11 ── Save VALIDATION_FAILED → explicit friendly copy ──────────── */

  it("Save VALIDATION_FAILED shows explicit friendly copy (bypasses apiErrorMessage trap)", async () => {
    mockApi().putAuthPolicy.mockRejectedValueOnce(
      makeApiError("VALIDATION_FAILED", { fields: { minLength: "too short" } }),
    );

    const user = userEvent.setup();
    renderTab();
    await screen.findByTestId("security-tab");

    // Make a valid change to enable Save.
    const corpusCheckbox = screen.getByTestId(
      "security-tab_check-breach-corpus",
    );
    await user.click(corpusCheckbox);

    await user.click(screen.getByTestId("security-tab_save-btn"));

    await screen.findByTestId("security-tab_save-error");
    expect(screen.getByTestId("security-tab_save-error").textContent).toContain(
      "Please check your inputs and try again.",
    );
  });

  /* 12 ── Save generic 500 → apiErrorMessage fallback copy ─────────── */

  it("Save generic error shows fallback copy from apiErrorMessage", async () => {
    mockApi().putAuthPolicy.mockRejectedValueOnce(
      new Error("Internal Server Error"),
    );

    const user = userEvent.setup();
    renderTab();
    await screen.findByTestId("security-tab");

    const corpusCheckbox = screen.getByTestId(
      "security-tab_check-breach-corpus",
    );
    await user.click(corpusCheckbox);

    await user.click(screen.getByTestId("security-tab_save-btn"));

    await screen.findByTestId("security-tab_save-error");
    // For a generic Error, apiErrorMessage returns err.message.
    expect(screen.getByTestId("security-tab_save-error").textContent).toContain(
      "Internal Server Error",
    );
  });
});
