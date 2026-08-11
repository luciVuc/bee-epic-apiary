/**
 * Tests for the BootstrapOwnerPage (Task 10.5).
 *
 * The page:
 *  - is a plain full-viewport centered form (no Redux);
 *  - normalizes the email (`trim().toLowerCase()`) before calling the API;
 *  - calls `api.bootstrapOwner({email})`; on 2xx swaps the form for a
 *    "check your email" confirmation copy (EXACT literal — the parent spec
 *    asserts the string);
 *  - on `ApiError` with `code === "BOOTSTRAP_DISABLED"` renders a special
 *    "already claimed" alert containing a Link back to /login (the initial
 *    OWNER has already been set up, so the flow must redirect users to the
 *    normal sign-in surface);
 *  - on any other failure renders the message from `apiErrorMessage` in a
 *    `role="alert"` region and leaves the form editable.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { BootstrapOwnerPage } from "../BootstrapOwnerPage";
import * as apiModule from "../../utils/api";

vi.mock("../../utils/api", async () => {
  const actual =
    await vi.importActual<typeof import("../../utils/api")>("../../utils/api");
  return {
    ...actual,
    api: {
      ...actual.api,
      bootstrapOwner: vi.fn(),
    },
  };
});

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/bootstrap"]}>
      <Routes>
        <Route path="/bootstrap" element={<BootstrapOwnerPage />} />
        <Route path="/login" element={<div data-testid="login-page" />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("BootstrapOwnerPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the email input and submit button", () => {
    renderPage();
    expect(screen.getByLabelText("Email")).toBeTruthy();
    expect(
      screen.getByRole("button", { name: /send setup link/i }),
    ).toBeTruthy();
  });

  it("shows the exact check-your-email copy and hides the form on success", async () => {
    const user = userEvent.setup();
    (
      apiModule.api.bootstrapOwner as ReturnType<typeof vi.fn>
    ).mockResolvedValueOnce(undefined);
    renderPage();

    await user.type(screen.getByLabelText("Email"), "owner@example.com");
    await user.click(screen.getByRole("button", { name: /send setup link/i }));

    const success = await screen.findByTestId("bootstrap-owner_success");
    // EXACT literal — do NOT paraphrase.
    expect(success.textContent).toBe(
      "Check your email for the setup link. If you don't see it within a few minutes, check spam or ask your hosting provider about email delivery.",
    );

    // Form has been replaced by the success state.
    expect(screen.queryByLabelText("Email")).toBeNull();
    expect(
      screen.queryByRole("button", { name: /send setup link/i }),
    ).toBeNull();
  });

  it("renders the 'already claimed' copy + /login link on BOOTSTRAP_DISABLED", async () => {
    const user = userEvent.setup();
    (
      apiModule.api.bootstrapOwner as ReturnType<typeof vi.fn>
    ).mockRejectedValueOnce(
      new apiModule.ApiError({ code: "BOOTSTRAP_DISABLED" } as never),
    );
    renderPage();

    await user.type(screen.getByLabelText("Email"), "owner@example.com");
    await user.click(screen.getByRole("button", { name: /send setup link/i }));

    const alert = await screen.findByTestId("bootstrap-owner_error");
    // EXACT literal — do NOT paraphrase.
    expect(alert.textContent).toContain(
      "The initial owner has already been claimed. Please sign in instead.",
    );

    // A link to /login is present so the user can proceed to sign in.
    const signInLink = screen.getByRole("link", { name: /sign in/i });
    expect(signInLink.getAttribute("href")).toBe("/login");
  });
});
