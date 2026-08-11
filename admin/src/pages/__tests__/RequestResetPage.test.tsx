/**
 * Tests for the RequestResetPage (Task 10.3).
 *
 * The page:
 *  - is a plain full-viewport centered form (no Redux);
 *  - normalizes the email (`trim().toLowerCase()`) BEFORE calling the API;
 *  - calls `api.requestReset({email})` and on 2xx swaps the form for a
 *    generic success message (deliberately does NOT distinguish between
 *    "email exists" vs "no such user" — that leak is the whole point of
 *    the endpoint's uniform 200 response);
 *  - on failure renders the error in a `role="alert"` region and leaves
 *    the form editable (no auto-redirect);
 *  - offers a "Back to sign in" link to `/login` always.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { RequestResetPage } from "../RequestResetPage";
import * as apiModule from "../../utils/api";

vi.mock("../../utils/api", async () => {
  const actual =
    await vi.importActual<typeof import("../../utils/api")>("../../utils/api");
  return {
    ...actual,
    api: {
      ...actual.api,
      requestReset: vi.fn(),
    },
  };
});

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/request-reset"]}>
      <Routes>
        <Route path="/request-reset" element={<RequestResetPage />} />
        <Route path="/login" element={<div data-testid="login-page" />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("RequestResetPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("submits and shows the exact generic success copy", async () => {
    const user = userEvent.setup();
    (
      apiModule.api.requestReset as ReturnType<typeof vi.fn>
    ).mockResolvedValueOnce(undefined);
    renderPage();

    await user.type(screen.getByLabelText("Email"), "user@example.com");
    await user.click(screen.getByRole("button", { name: /send reset link/i }));

    const success = await screen.findByTestId("request-reset_success");
    // Exact literal — do NOT paraphrase.
    expect(success.textContent).toBe(
      "If an account with that email exists, we've sent a reset link.",
    );
  });

  it("hides the form entirely after a successful submit", async () => {
    const user = userEvent.setup();
    (
      apiModule.api.requestReset as ReturnType<typeof vi.fn>
    ).mockResolvedValueOnce(undefined);
    renderPage();

    await user.type(screen.getByLabelText("Email"), "user@example.com");
    await user.click(screen.getByRole("button", { name: /send reset link/i }));

    await screen.findByTestId("request-reset_success");

    expect(
      screen.queryByRole("button", { name: /send reset link/i }),
    ).toBeNull();
    expect(screen.queryByLabelText("Email")).toBeNull();
  });

  it("shows a network error and leaves the form editable", async () => {
    const user = userEvent.setup();
    (
      apiModule.api.requestReset as ReturnType<typeof vi.fn>
    ).mockRejectedValueOnce(new Error("network down"));
    renderPage();

    await user.type(screen.getByLabelText("Email"), "user@example.com");
    await user.click(screen.getByRole("button", { name: /send reset link/i }));

    const alert = await screen.findByTestId("request-reset_error");
    // apiErrorMessage(new Error("network down"), fallback) returns the raw message.
    expect(alert.textContent).toBe("network down");

    // Form still editable.
    expect(screen.getByLabelText("Email")).toBeTruthy();
    // Success is NOT rendered.
    expect(screen.queryByTestId("request-reset_success")).toBeNull();
  });

  it("falls back to the generic error copy when the thrown value has no message", async () => {
    const user = userEvent.setup();
    (
      apiModule.api.requestReset as ReturnType<typeof vi.fn>
    ).mockRejectedValueOnce(new Error(""));
    renderPage();

    await user.type(screen.getByLabelText("Email"), "user@example.com");
    await user.click(screen.getByRole("button", { name: /send reset link/i }));

    const alert = await screen.findByTestId("request-reset_error");
    expect(alert.textContent).toBe("Request failed. Please try again.");
    expect(screen.getByLabelText("Email")).toBeTruthy();
    expect(screen.queryByTestId("request-reset_success")).toBeNull();
  });

  it("trims and lowercases the email before POSTing", async () => {
    const user = userEvent.setup();
    (
      apiModule.api.requestReset as ReturnType<typeof vi.fn>
    ).mockResolvedValueOnce(undefined);
    renderPage();

    await user.type(screen.getByLabelText("Email"), "  ADMIN@Test.COM  ");
    await user.click(screen.getByRole("button", { name: /send reset link/i }));

    await waitFor(() => {
      expect(apiModule.api.requestReset).toHaveBeenCalledTimes(1);
    });
    expect(apiModule.api.requestReset).toHaveBeenCalledWith({
      email: "admin@test.com",
    });
  });
});
