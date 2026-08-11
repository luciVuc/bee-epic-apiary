/**
 * Tests for the LoginPage (Task 10.1).
 *
 * The page is a plain full-viewport centered form that:
 *  - normalizes the email (`trim().toLowerCase()`) BEFORE calling the API;
 *  - dispatches the `login` thunk via `useAuthActions()`;
 *  - on success, navigates to `location.state.from.pathname` (or `/dashboard`);
 *  - on failure, maps `IApiError.code` to a user-facing message and renders it
 *    in a `role="alert"` region — using identical copy for `INVALID_CREDENTIALS`
 *    and `ACCOUNT_DISABLED` to avoid user enumeration.
 *
 * Tests deliberately DO NOT mock `useNavigate`: instead we co-locate the
 * `/dashboard` and `/orders/xyz` routes inside the test `MemoryRouter` and
 * assert their placeholder markers appear after login (mirrors the pattern
 * used by RequireCaller's redirect test).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Provider } from "react-redux";
import { configureStore } from "@reduxjs/toolkit";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { LoginPage } from "../LoginPage";
import authReducer, { login } from "../../store/authSlice";
import { ApiError } from "../../utils/api";
import * as apiModule from "../../utils/api";
import type { ICaller } from "../../types";
import { EStaffRole } from "../../types";

vi.mock("../../utils/api", async () => {
  const actual =
    await vi.importActual<typeof import("../../utils/api")>("../../utils/api");
  return {
    ...actual,
    api: {
      ...actual.api,
      login: vi.fn(),
    },
  };
});

function makeStore() {
  return configureStore({ reducer: { auth: authReducer } });
}

function renderLoginPage(
  store: ReturnType<typeof makeStore>,
  initialEntries: Array<string | { pathname: string; state?: unknown }> = [
    "/login",
  ],
) {
  return render(
    <Provider store={store}>
      <MemoryRouter initialEntries={initialEntries}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route
            path="/dashboard"
            element={<div data-testid="dashboard-page" />}
          />
          <Route
            path="/orders/xyz"
            element={<div data-testid="orders-xyz-page" />}
          />
          <Route
            path="/request-reset"
            element={<div data-testid="request-reset-page" />}
          />
        </Routes>
      </MemoryRouter>
    </Provider>,
  );
}

const mockCaller: ICaller = {
  email: "admin@test.com",
  role: EStaffRole.OWNER,
  via: "cookie",
};

describe("LoginPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders email + password + submit + forgot-password link; email is autofocused", () => {
    const store = makeStore();
    renderLoginPage(store);

    const emailInput = screen.getByLabelText("Email");
    expect(emailInput).toBeTruthy();
    expect(screen.getByLabelText("Password")).toBeTruthy();
    expect(screen.getByRole("button", { name: /sign in/i })).toBeTruthy();
    expect(
      screen.getByRole("link", { name: /forgot your password/i }),
    ).toBeTruthy();

    // Email should be autofocused on mount.
    expect(document.activeElement).toBe(emailInput);
  });

  it("does not call the API when the form is submitted empty", () => {
    const store = makeStore();
    renderLoginPage(store);

    // Native `required` blocks submission; clicking Sign in should not call the API.
    fireEvent.click(screen.getByRole("button", { name: /sign in/i }));

    expect(apiModule.api.login).not.toHaveBeenCalled();
  });

  it("normalizes email (trim + lowercase) and navigates to /dashboard on success", async () => {
    const user = userEvent.setup();
    const store = makeStore();
    (apiModule.api.login as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockCaller,
    );
    renderLoginPage(store);

    await user.type(screen.getByLabelText("Email"), "  ADMIN@Test.COM  ");
    await user.type(screen.getByLabelText("Password"), "secret");

    await user.click(screen.getByRole("button", { name: /sign in/i }));

    await waitFor(() => {
      expect(apiModule.api.login).toHaveBeenCalledTimes(1);
    });
    expect(apiModule.api.login).toHaveBeenCalledWith({
      email: "admin@test.com",
      password: "secret",
    });

    await waitFor(() => {
      expect(screen.getByTestId("dashboard-page")).toBeTruthy();
    });
  });

  it("renders the same generic error for INVALID_CREDENTIALS", async () => {
    const user = userEvent.setup();
    const store = makeStore();
    (apiModule.api.login as ReturnType<typeof vi.fn>).mockRejectedValue(
      new ApiError({ code: "INVALID_CREDENTIALS" }),
    );
    renderLoginPage(store);

    await user.type(screen.getByLabelText("Email"), "admin@test.com");
    await user.type(screen.getByLabelText("Password"), "wrong");
    await user.click(screen.getByRole("button", { name: /sign in/i }));

    const alert = await screen.findByTestId("login_error");
    expect(alert.textContent).toBe("Invalid email or password.");
  });

  it("renders the same generic error for ACCOUNT_DISABLED", async () => {
    const user = userEvent.setup();
    const store = makeStore();
    (apiModule.api.login as ReturnType<typeof vi.fn>).mockRejectedValue(
      new ApiError({ code: "ACCOUNT_DISABLED" }),
    );
    renderLoginPage(store);

    await user.type(screen.getByLabelText("Email"), "admin@test.com");
    await user.type(screen.getByLabelText("Password"), "secret");
    await user.click(screen.getByRole("button", { name: /sign in/i }));

    const alert = await screen.findByTestId("login_error");
    expect(alert.textContent).toBe("Invalid email or password.");
  });

  it("renders the retry-after copy for RATE_LIMITED", async () => {
    const user = userEvent.setup();
    const store = makeStore();
    (apiModule.api.login as ReturnType<typeof vi.fn>).mockRejectedValue(
      new ApiError({ code: "RATE_LIMITED", retryAfter: 30 }),
    );
    renderLoginPage(store);

    await user.type(screen.getByLabelText("Email"), "admin@test.com");
    await user.type(screen.getByLabelText("Password"), "secret");
    await user.click(screen.getByRole("button", { name: /sign in/i }));

    const alert = await screen.findByTestId("login_error");
    expect(alert.textContent).toBe(
      "Too many attempts. Please try again in a few minutes.",
    );
  });

  it("navigates to state.from.pathname on successful login", async () => {
    const user = userEvent.setup();
    const store = makeStore();
    (apiModule.api.login as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockCaller,
    );
    renderLoginPage(store, [
      { pathname: "/login", state: { from: { pathname: "/orders/xyz" } } },
    ]);

    await user.type(screen.getByLabelText("Email"), "admin@test.com");
    await user.type(screen.getByLabelText("Password"), "secret");
    await user.click(screen.getByRole("button", { name: /sign in/i }));

    await waitFor(() => {
      expect(screen.getByTestId("orders-xyz-page")).toBeTruthy();
    });
  });

  it("disables the submit button while loginInFlight is true", () => {
    const store = makeStore();
    // Dispatch a synthetic `login.pending` action to flip the flag.
    store.dispatch(
      login.pending("test-request-id", { email: "", password: "" }),
    );
    renderLoginPage(store);

    const button = screen.getByRole("button", {
      name: /sign in/i,
    }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
  });
});
