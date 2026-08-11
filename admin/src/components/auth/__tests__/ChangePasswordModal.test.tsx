/**
 * Tests for ChangePasswordModal (Task 10.13).
 *
 * The modal:
 *  - fetches the active auth policy on mount so `PasswordField` renders
 *    the correct min-length hint;
 *  - client-side validates that new / confirm match before hitting the API;
 *  - submits via useAuthActions().changePassword (which does
 *    dispatch(changePassword(...)).unwrap()) — on rejection the thrown
 *    value is the IApiError payload (the slice does
 *    `rejectWithValue(err.apiError)`);
 *  - renders `INVALID_CREDENTIALS` as "Current password is incorrect.";
 *  - renders `WEAK_PASSWORD` reasons as a `<ul>`;
 *  - on success shows the exact copy
 *    "Password updated. Other sessions have been logged out." and calls
 *    onClose after a 2-second delay.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Provider } from "react-redux";
import { configureStore } from "@reduxjs/toolkit";
import { MemoryRouter } from "react-router-dom";
import authReducer from "../../../store/authSlice";
import * as apiModule from "../../../utils/api";
import { ApiError } from "../../../utils/api";
import { ChangePasswordModal } from "../ChangePasswordModal";

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
      changePassword: vi.fn(),
    },
  };
});

function renderModal(onClose: () => void = vi.fn()) {
  const store = configureStore({ reducer: { auth: authReducer } });
  return render(
    <MemoryRouter>
      <Provider store={store}>
        <ChangePasswordModal onClose={onClose} />
      </Provider>
    </MemoryRouter>,
  );
}

const samplePolicy = {
  schemaVersion: 1 as const,
  minLength: 12,
  checkBreachCorpus: false,
  notifyOnPasswordChange: true,
  updatedAt: 0,
  updatedBy: "system@bootstrap.local",
};

describe("ChangePasswordModal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (apiModule.api.getAuthPolicy as ReturnType<typeof vi.fn>).mockResolvedValue(
      samplePolicy,
    );
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows inline error and does NOT call changePassword when confirm does not match", async () => {
    const user = userEvent.setup();
    renderModal();

    await user.type(screen.getByLabelText("Current password"), "OldPass!");
    await user.type(screen.getByLabelText("New password"), "NewSecurePass123!");
    await user.type(
      screen.getByLabelText("Confirm new password"),
      "different-value",
    );
    await user.click(screen.getByTestId("change-password_submit"));

    const alert = await screen.findByTestId("change-password_error");
    expect(alert.textContent).toBe("Passwords do not match.");
    expect(apiModule.api.changePassword).not.toHaveBeenCalled();
  });

  it("shows success banner then closes after 2 seconds on a successful change", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    (
      apiModule.api.changePassword as ReturnType<typeof vi.fn>
    ).mockResolvedValueOnce(undefined);
    const onClose = vi.fn();
    const user = userEvent.setup({
      advanceTimers: vi.advanceTimersByTime.bind(vi),
    });
    renderModal(onClose);

    await user.type(screen.getByLabelText("Current password"), "OldPass!");
    await user.type(screen.getByLabelText("New password"), "NewSecurePass123!");
    await user.type(
      screen.getByLabelText("Confirm new password"),
      "NewSecurePass123!",
    );
    await user.click(screen.getByTestId("change-password_submit"));

    const success = await screen.findByTestId("change-password_success");
    expect(success.textContent).toBe(
      "Password updated. Other sessions have been logged out.",
    );
    // Form is gone in the success view.
    expect(screen.queryByTestId("change-password_submit")).toBeNull();

    // Advance the 2-second auto-close timer.
    await act(async () => {
      vi.advanceTimersByTime(2000);
    });

    await waitFor(() => {
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });

  it("renders 'Current password is incorrect.' on INVALID_CREDENTIALS", async () => {
    (
      apiModule.api.changePassword as ReturnType<typeof vi.fn>
    ).mockRejectedValueOnce(
      new ApiError({ code: "INVALID_CREDENTIALS" } as never),
    );
    const user = userEvent.setup();
    renderModal();

    await user.type(screen.getByLabelText("Current password"), "wrong-pw");
    await user.type(screen.getByLabelText("New password"), "NewSecurePass123!");
    await user.type(
      screen.getByLabelText("Confirm new password"),
      "NewSecurePass123!",
    );
    await user.click(screen.getByTestId("change-password_submit"));

    const alert = await screen.findByTestId("change-password_error");
    expect(alert.textContent).toBe("Current password is incorrect.");
  });

  it("renders WEAK_PASSWORD reasons as a <ul> in the error region", async () => {
    (
      apiModule.api.changePassword as ReturnType<typeof vi.fn>
    ).mockRejectedValueOnce(
      new ApiError({
        code: "WEAK_PASSWORD",
        reasons: ["too_short", "pwned"],
      } as never),
    );
    const user = userEvent.setup();
    renderModal();

    await user.type(screen.getByLabelText("Current password"), "OldPass!");
    await user.type(screen.getByLabelText("New password"), "NewSecurePass123!");
    await user.type(
      screen.getByLabelText("Confirm new password"),
      "NewSecurePass123!",
    );
    await user.click(screen.getByTestId("change-password_submit"));

    const alert = await screen.findByTestId("change-password_error");
    const list = alert.querySelector("ul");
    expect(list).not.toBeNull();
    expect(list!.querySelectorAll("li").length).toBe(2);
    expect(screen.getByText("too_short")).toBeTruthy();
    expect(screen.getByText("pwned")).toBeTruthy();
  });

  it("focuses the current-password field on mount", async () => {
    renderModal();
    const input = await screen.findByLabelText("Current password");
    expect(document.activeElement).toBe(input);
  });

  it("closes on Escape", async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    renderModal(onClose);
    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalled();
  });
});
