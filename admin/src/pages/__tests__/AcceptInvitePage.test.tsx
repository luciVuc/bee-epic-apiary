/**
 * Tests for the AcceptInvitePage (Task 10.2).
 *
 * The page:
 *  - reads a `?token=...` query string; if absent, renders an invalid-link
 *    error and does NOT call the API;
 *  - fetches the active auth policy on mount so `PasswordField` can render
 *    the correct min-length hint;
 *  - accepts a new password + confirmation (client-side match check);
 *  - calls `api.acceptInvite({token, password})` and on success navigates
 *    to `/dashboard`;
 *  - maps `INVALID_TOKEN` / `EXPIRED_TOKEN` to a shared invalid-link copy;
 *  - renders `WEAK_PASSWORD` reasons as a `<ul>` inside the error region.
 *
 * Tests deliberately DO NOT mock `useNavigate`: instead we co-locate a
 * `/dashboard` route inside the test `MemoryRouter` and assert the
 * placeholder marker appears after a successful accept (mirrors the pattern
 * used by LoginPage tests).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { AcceptInvitePage } from "../AcceptInvitePage";
import { ApiError } from "../../utils/api";
import * as apiModule from "../../utils/api";
import type { IAuthPolicy } from "@bee-epic/shared";
import type { ICaller } from "../../types";
import { EStaffRole } from "../../types";

vi.mock("../../utils/api", async () => {
  const actual =
    await vi.importActual<typeof import("../../utils/api")>("../../utils/api");
  return {
    ...actual,
    api: {
      ...actual.api,
      getAuthPolicy: vi.fn(),
      acceptInvite: vi.fn(),
    },
  };
});

function renderPage(
  initialEntries: string[] = ["/accept-invite?token=abc123"],
) {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <Routes>
        <Route path="/accept-invite" element={<AcceptInvitePage />} />
        <Route path="/login" element={<div data-testid="login-page" />} />
        <Route path="/dashboard" element={<div data-testid="dashboard" />} />
      </Routes>
    </MemoryRouter>,
  );
}

const samplePolicy: IAuthPolicy = {
  schemaVersion: 1,
  minLength: 20,
  checkBreachCorpus: false,
  notifyOnPasswordChange: true,
  updatedAt: 0,
  updatedBy: "system@bootstrap.local",
};

const mockCaller: ICaller = {
  email: "invited@test.com",
  role: EStaffRole.EMPLOYEE,
  via: "cookie",
  displayName: "Invited User",
};

describe("AcceptInvitePage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the invalid-link message and does NOT call the API when the token is missing", () => {
    renderPage(["/accept-invite"]);

    const noToken = screen.getByTestId("accept-invite_no-token");
    expect(noToken.textContent?.toLowerCase()).toContain("invalid");

    // API not called
    expect(
      (apiModule.api.getAuthPolicy as ReturnType<typeof vi.fn>).mock.calls
        .length,
    ).toBe(0);

    // Form is not rendered
    expect(
      screen.queryByRole("button", { name: /accept invitation/i }),
    ).toBeNull();
  });

  it("renders policy-driven hints when getAuthPolicy resolves", async () => {
    (
      apiModule.api.getAuthPolicy as ReturnType<typeof vi.fn>
    ).mockResolvedValueOnce(samplePolicy);
    renderPage();

    // PasswordField's evaluate() renders "At least {minLength} characters"
    // once the policy resolves.
    await screen.findByText("At least 20 characters");
  });

  it("falls back to the default min-length hint when getAuthPolicy rejects", async () => {
    (
      apiModule.api.getAuthPolicy as ReturnType<typeof vi.fn>
    ).mockRejectedValueOnce(new Error("network"));
    renderPage();

    // Default hint when policy is null.
    await screen.findByText("At least 12 characters");
    // The form still renders — the policy failure must not block the page.
    expect(
      screen.getByRole("button", { name: /accept invitation/i }),
    ).toBeTruthy();
  });

  it("shows an inline error and does NOT call acceptInvite when the confirm password does not match", async () => {
    (
      apiModule.api.getAuthPolicy as ReturnType<typeof vi.fn>
    ).mockResolvedValueOnce(samplePolicy);
    const user = userEvent.setup();
    renderPage();

    await user.type(screen.getByLabelText("New password"), "CorrectHorse123!");
    await user.type(screen.getByLabelText("Confirm password"), "different");
    await user.click(
      screen.getByRole("button", { name: /accept invitation/i }),
    );

    const alert = await screen.findByTestId("accept-invite_error");
    expect(alert.textContent).toBe("Passwords do not match.");
    expect(apiModule.api.acceptInvite).not.toHaveBeenCalled();
  });

  it("navigates to /dashboard on a successful accept", async () => {
    (
      apiModule.api.getAuthPolicy as ReturnType<typeof vi.fn>
    ).mockResolvedValueOnce(samplePolicy);
    (
      apiModule.api.acceptInvite as ReturnType<typeof vi.fn>
    ).mockResolvedValueOnce(mockCaller);
    const user = userEvent.setup();
    renderPage();

    await user.type(screen.getByLabelText("New password"), "CorrectHorse123!");
    await user.type(
      screen.getByLabelText("Confirm password"),
      "CorrectHorse123!",
    );
    await user.click(
      screen.getByRole("button", { name: /accept invitation/i }),
    );

    await screen.findByTestId("dashboard");
    await waitFor(() => {
      expect(apiModule.api.acceptInvite).toHaveBeenCalledTimes(1);
    });
    expect(apiModule.api.acceptInvite).toHaveBeenCalledWith({
      token: "abc123",
      password: "CorrectHorse123!",
    });
  });

  it("renders each WEAK_PASSWORD reason as a <li> in the error region", async () => {
    (
      apiModule.api.getAuthPolicy as ReturnType<typeof vi.fn>
    ).mockResolvedValueOnce(samplePolicy);
    (
      apiModule.api.acceptInvite as ReturnType<typeof vi.fn>
    ).mockRejectedValueOnce(
      new ApiError({
        code: "WEAK_PASSWORD",
        reasons: ["too_short", "pwned"],
      } as never),
    );
    const user = userEvent.setup();
    renderPage();

    await user.type(screen.getByLabelText("New password"), "CorrectHorse123!");
    await user.type(
      screen.getByLabelText("Confirm password"),
      "CorrectHorse123!",
    );
    await user.click(
      screen.getByRole("button", { name: /accept invitation/i }),
    );

    const alert = await screen.findByTestId("accept-invite_error");
    // Structural assertion: a <ul> with two <li>s.
    const list = alert.querySelector("ul");
    expect(list).not.toBeNull();
    expect(list!.querySelectorAll("li").length).toBe(2);
    expect(screen.getByText("too_short")).toBeTruthy();
    expect(screen.getByText("pwned")).toBeTruthy();
  });

  it("renders the exact invalid-link copy on EXPIRED_TOKEN", async () => {
    (
      apiModule.api.getAuthPolicy as ReturnType<typeof vi.fn>
    ).mockResolvedValueOnce(samplePolicy);
    (
      apiModule.api.acceptInvite as ReturnType<typeof vi.fn>
    ).mockRejectedValueOnce(new ApiError({ code: "EXPIRED_TOKEN" } as never));
    const user = userEvent.setup();
    renderPage();

    await user.type(screen.getByLabelText("New password"), "CorrectHorse123!");
    await user.type(
      screen.getByLabelText("Confirm password"),
      "CorrectHorse123!",
    );
    await user.click(
      screen.getByRole("button", { name: /accept invitation/i }),
    );

    const alert = await screen.findByTestId("accept-invite_error");
    expect(alert.textContent).toBe(
      "This invitation link is invalid or has expired. Ask your administrator to send a new one.",
    );
  });
});
