/**
 * Tests for the CompleteResetPage (Task 10.4).
 *
 * The page:
 *  - reads a `?token=...` query string; if absent, renders an invalid-link
 *    error and does NOT call the API;
 *  - fetches the active auth policy on mount so `PasswordField` can render
 *    the correct min-length hint;
 *  - accepts a new password + confirmation (client-side match check);
 *  - calls `api.completeReset({token, password})` and on success navigates
 *    to `/dashboard?reset=complete` — the query flag lets a future one-time
 *    banner on DashboardPage inform the user that "all other sessions were
 *    logged out" (the server-side contract of complete-reset);
 *  - maps `INVALID_TOKEN` / `EXPIRED_TOKEN` to a shared invalid-link copy;
 *  - renders `WEAK_PASSWORD` reasons as a `<ul>` inside the error region.
 *
 * Structurally near-identical to AcceptInvitePage.test.tsx (Task 10.2). The
 * only novel bit is the `DashboardProbe` route helper: it reads
 * `useLocation().search` into a `data-search` attribute so we can assert the
 * post-success URL carries `?reset=complete`.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route, useLocation } from "react-router-dom";
import { CompleteResetPage } from "../CompleteResetPage";
import { ApiError } from "../../utils/api";
import * as apiModule from "../../utils/api";
import type { IAuthPolicy } from "@bee-epic/shared";

vi.mock("../../utils/api", async () => {
  const actual =
    await vi.importActual<typeof import("../../utils/api")>("../../utils/api");
  return {
    ...actual,
    api: {
      ...actual.api,
      getAuthPolicy: vi.fn(),
      completeReset: vi.fn(),
    },
  };
});

/**
 * Probe rendered under the `/dashboard` route: exposes
 * `useLocation().search` on a `data-search` attribute so tests can assert
 * the query string carried by the post-success navigation.
 */
function DashboardProbe() {
  const location = useLocation();
  return <div data-testid="dashboard-probe" data-search={location.search} />;
}

function renderPage(
  initialEntries: string[] = ["/complete-reset?token=abc123"],
) {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <Routes>
        <Route path="/complete-reset" element={<CompleteResetPage />} />
        <Route path="/login" element={<div data-testid="login-page" />} />
        <Route path="/dashboard" element={<DashboardProbe />} />
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

describe("CompleteResetPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the invalid-link message and does NOT call the API when the token is missing", () => {
    renderPage(["/complete-reset"]);

    const noToken = screen.getByTestId("complete-reset_no-token");
    expect(noToken.textContent?.toLowerCase()).toContain("invalid");

    // Neither API method should be called.
    expect(
      (apiModule.api.getAuthPolicy as ReturnType<typeof vi.fn>).mock.calls
        .length,
    ).toBe(0);
    expect(
      (apiModule.api.completeReset as ReturnType<typeof vi.fn>).mock.calls
        .length,
    ).toBe(0);

    // Form is not rendered.
    expect(
      screen.queryByRole("button", { name: /update password/i }),
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
      screen.getByRole("button", { name: /update password/i }),
    ).toBeTruthy();
  });

  it("shows an inline error and does NOT call completeReset when the confirm password does not match", async () => {
    (
      apiModule.api.getAuthPolicy as ReturnType<typeof vi.fn>
    ).mockResolvedValueOnce(samplePolicy);
    const user = userEvent.setup();
    renderPage();

    await user.type(screen.getByLabelText("New password"), "CorrectHorse123!");
    await user.type(screen.getByLabelText("Confirm password"), "different");
    await user.click(screen.getByRole("button", { name: /update password/i }));

    const alert = await screen.findByTestId("complete-reset_error");
    expect(alert.textContent).toBe("Passwords do not match.");
    expect(apiModule.api.completeReset).not.toHaveBeenCalled();
  });

  it("navigates to /dashboard?reset=complete on a successful reset", async () => {
    (
      apiModule.api.getAuthPolicy as ReturnType<typeof vi.fn>
    ).mockResolvedValueOnce(samplePolicy);
    (
      apiModule.api.completeReset as ReturnType<typeof vi.fn>
    ).mockResolvedValueOnce(undefined);
    const user = userEvent.setup();
    renderPage();

    await user.type(screen.getByLabelText("New password"), "CorrectHorse123!");
    await user.type(
      screen.getByLabelText("Confirm password"),
      "CorrectHorse123!",
    );
    await user.click(screen.getByRole("button", { name: /update password/i }));

    // Dashboard probe appears — confirms the redirect happened AND the
    // query-string flag is present. Rolled into this single test because
    // splitting "did we navigate" from "did we carry the flag" would just
    // double up the same setup.
    const probe = await screen.findByTestId("dashboard-probe");
    expect(probe.getAttribute("data-search")).toBe("?reset=complete");

    await waitFor(() => {
      expect(apiModule.api.completeReset).toHaveBeenCalledTimes(1);
    });
    expect(apiModule.api.completeReset).toHaveBeenCalledWith({
      token: "abc123",
      password: "CorrectHorse123!",
    });
  });

  it("renders each WEAK_PASSWORD reason as a <li> in the error region", async () => {
    (
      apiModule.api.getAuthPolicy as ReturnType<typeof vi.fn>
    ).mockResolvedValueOnce(samplePolicy);
    (
      apiModule.api.completeReset as ReturnType<typeof vi.fn>
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
    await user.click(screen.getByRole("button", { name: /update password/i }));

    const alert = await screen.findByTestId("complete-reset_error");
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
      apiModule.api.completeReset as ReturnType<typeof vi.fn>
    ).mockRejectedValueOnce(new ApiError({ code: "EXPIRED_TOKEN" } as never));
    const user = userEvent.setup();
    renderPage();

    await user.type(screen.getByLabelText("New password"), "CorrectHorse123!");
    await user.type(
      screen.getByLabelText("Confirm password"),
      "CorrectHorse123!",
    );
    await user.click(screen.getByRole("button", { name: /update password/i }));

    const alert = await screen.findByTestId("complete-reset_error");
    expect(alert.textContent).toBe(
      "This password-reset link is invalid or has expired. Request a new one from the sign-in page.",
    );
  });
});
