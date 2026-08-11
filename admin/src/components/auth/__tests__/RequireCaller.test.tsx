import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Provider } from "react-redux";
import { configureStore } from "@reduxjs/toolkit";
import type { ReactNode } from "react";
import { MemoryRouter, Routes, Route, useLocation } from "react-router-dom";
import { RequireCaller } from "../RequireCaller";
import authReducer from "../../../store/authSlice";
import * as api from "../../../utils/api";
import { EStaffRole } from "../../../types";

/**
 * RequireCaller renders one of four states from the useCaller hook:
 *  - idle/loading → polite "verifying" placeholder
 *  - error        → retry alert
 *  - succeeded + caller=null → <Navigate to="/login" state={{from: location}}>
 *  - succeeded + caller       → children
 *
 * The first failure mode (rendering children before auth resolves) is the
 * one this gate exists to prevent (review I2) — without it the admin layout
 * mounts and hits product/orders endpoints before the whoami probe finishes,
 * which makes 401s look like crashes.
 */
function makeStore(preload?: {
  caller: { email: string; role: EStaffRole } | null;
  status: "idle" | "loading" | "succeeded" | "error";
  error: string | null;
}) {
  const store = configureStore({ reducer: { auth: authReducer } });
  if (preload) {
    store.dispatch({
      type: "auth/__test__/setState",
      payload: preload,
    });
  }
  return store;
}

function wrap(
  store: ReturnType<typeof makeStore>,
  children: ReactNode,
  initialEntries: string[] = ["/"],
) {
  return (
    <MemoryRouter initialEntries={initialEntries}>
      <Provider store={store}>{children}</Provider>
    </MemoryRouter>
  );
}

describe("RequireCaller", () => {
  it("renders the verifying-access placeholder while auth is loading", async () => {
    // useCaller's effect will dispatch fetchCaller from 'idle' → 'loading';
    // pin the network so the test resolves deterministically and the loading
    // state is observable for at least a tick.
    vi.spyOn(api.api, "getWhoami").mockImplementation(
      () => new Promise(() => {}), // never resolves
    );
    const store = makeStore();
    render(
      wrap(
        store,
        <RequireCaller>
          <div data-testid="protected" />
        </RequireCaller>,
      ),
    );
    expect(screen.getByTestId("require-caller_loading")).toBeTruthy();
    expect(screen.queryByTestId("protected")).toBeNull();
  });

  it("redirects to /login with state.from when caller is null after probe", async () => {
    vi.spyOn(api.api, "getWhoami").mockResolvedValue({ caller: null });
    const store = makeStore();

    function LoginProbe() {
      const location = useLocation();
      return (
        <div
          data-testid="login-page"
          data-from-pathname={
            (location.state as { from?: { pathname?: string } })?.from
              ?.pathname ?? ""
          }
        />
      );
    }

    render(
      <MemoryRouter initialEntries={["/products/123"]}>
        <Provider store={store}>
          <Routes>
            <Route
              path="/products/*"
              element={
                <RequireCaller>
                  <div data-testid="protected" />
                </RequireCaller>
              }
            />
            <Route path="/login" element={<LoginProbe />} />
          </Routes>
        </Provider>
      </MemoryRouter>,
    );
    // wait one microtask for thunk to fulfill
    await new Promise((r) => setTimeout(r, 0));
    // old unauth alert is gone entirely
    expect(screen.queryByTestId("require-caller_unauth")).toBeNull();
    // children do not mount when unauthenticated
    expect(screen.queryByTestId("protected")).toBeNull();
    // Navigate rendered the /login route
    const loginPage = screen.getByTestId("login-page");
    expect(loginPage).toBeTruthy();
    // state.from preserves the original location for post-login bounce-back
    expect(loginPage.getAttribute("data-from-pathname")).toBe("/products/123");
  });

  it("renders the error alert with a retry button when whoami fails", async () => {
    vi.spyOn(api.api, "getWhoami").mockRejectedValue(new Error("JWT broken"));
    const store = makeStore();
    render(
      wrap(
        store,
        <RequireCaller>
          <div data-testid="protected" />
        </RequireCaller>,
      ),
    );
    await new Promise((r) => setTimeout(r, 0));
    expect(screen.getByTestId("require-caller_error")).toBeTruthy();
    expect(screen.queryByTestId("protected")).toBeNull();
    // Retry button is present so a transient JWKS hiccup is recoverable.
    const retry = screen.getByRole("button", { name: /retry/i });
    expect(retry).toBeTruthy();
    fireEvent.click(retry); // does not throw — slice resets and refetches
  });

  it("renders children once whoami resolves with a caller", async () => {
    vi.spyOn(api.api, "getWhoami").mockResolvedValue({
      caller: {
        email: "alice@example.com",
        role: EStaffRole.OWNER,
        via: "cookie" as const,
      },
    });
    const store = makeStore();
    render(
      wrap(
        store,
        <RequireCaller>
          <div data-testid="protected" />
        </RequireCaller>,
      ),
    );
    await new Promise((r) => setTimeout(r, 0));
    expect(screen.getByTestId("protected")).toBeTruthy();
  });
});
