/**
 * Tests for the BootstrapGuard (Task 10.5).
 *
 * The guard reads `state.auth.bootstrapAvailable` and `state.auth.status` and
 * ensures that `/login` and `/bootstrap` are mutually exclusive:
 *   - bootstrapAvailable === null && status === "idle" → dispatch fetchCaller,
 *     render a "checking" spinner (prevents a first-load flash of the wrong page).
 *   - path === "/bootstrap" && bootstrapAvailable === false → Navigate to /login.
 *   - path === "/login"     && bootstrapAvailable === true  → Navigate to /bootstrap.
 *   - otherwise render children.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { Provider } from "react-redux";
import { configureStore } from "@reduxjs/toolkit";
import type { ReactNode } from "react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { BootstrapGuard } from "../BootstrapGuard";
import authReducer, { type IAuthState } from "../../../store/authSlice";
import * as api from "../../../utils/api";

vi.mock("../../../utils/api", async () => {
  const actual =
    await vi.importActual<typeof import("../../../utils/api")>(
      "../../../utils/api",
    );
  return {
    ...actual,
    api: {
      ...actual.api,
      getWhoami: vi.fn(),
    },
  };
});

const initialState: IAuthState = {
  caller: null,
  status: "idle",
  error: null,
  bootstrapAvailable: null,
  loginInFlight: false,
  logoutInFlight: false,
  refreshInFlight: false,
};

/**
 * Build a Redux store. When `preload` is provided we use a stub reducer that
 * always returns the preloaded state — this is far cheaper than replaying
 * synthetic actions through the real slice, and the guard only ever *reads*
 * from the store so a frozen state is fine. When `preload` is absent the
 * real `authReducer` is used so `fetchCaller()` dispatches actually process.
 */
function makeStore(preload?: Partial<IAuthState>) {
  if (preload) {
    const preloadedState = { ...initialState, ...preload };
    return configureStore({
      reducer: {
        auth: (state = preloadedState) => state,
      },
    });
  }
  return configureStore({ reducer: { auth: authReducer } });
}

function wrap(
  store: ReturnType<typeof makeStore>,
  ui: ReactNode,
  initialEntries: string[] = ["/"],
  routes?: ReactNode,
) {
  return (
    <MemoryRouter initialEntries={initialEntries}>
      <Provider store={store}>{routes ?? ui}</Provider>
    </MemoryRouter>
  );
}

describe("BootstrapGuard", () => {
  it("renders the checking spinner and dispatches fetchCaller when bootstrapAvailable is unknown", () => {
    // Hang the whoami probe so the loading state is observable.
    (api.api.getWhoami as ReturnType<typeof vi.fn>).mockImplementation(
      () => new Promise(() => {}),
    );

    const store = makeStore();
    render(
      wrap(
        store,
        <BootstrapGuard>
          <div data-testid="child" />
        </BootstrapGuard>,
      ),
    );

    expect(screen.getByTestId("bootstrap-guard_loading")).toBeTruthy();
    expect(screen.queryByTestId("child")).toBeNull();
    expect(api.api.getWhoami).toHaveBeenCalled();
  });

  it("redirects /bootstrap → /login when bootstrapAvailable is false", () => {
    const store = makeStore({
      bootstrapAvailable: false,
      status: "succeeded",
      caller: null,
    });
    render(
      wrap(
        store,
        null,
        ["/bootstrap"],
        <Routes>
          <Route
            path="/bootstrap"
            element={
              <BootstrapGuard>
                <div data-testid="bootstrap-child" />
              </BootstrapGuard>
            }
          />
          <Route path="/login" element={<div data-testid="login-page" />} />
        </Routes>,
      ),
    );

    expect(screen.getByTestId("login-page")).toBeTruthy();
    expect(screen.queryByTestId("bootstrap-child")).toBeNull();
  });

  it("redirects /login → /bootstrap when bootstrapAvailable is true", () => {
    const store = makeStore({
      bootstrapAvailable: true,
      status: "succeeded",
      caller: null,
    });
    render(
      wrap(
        store,
        null,
        ["/login"],
        <Routes>
          <Route
            path="/login"
            element={
              <BootstrapGuard>
                <div data-testid="login-child" />
              </BootstrapGuard>
            }
          />
          <Route
            path="/bootstrap"
            element={<div data-testid="bootstrap-page" />}
          />
        </Routes>,
      ),
    );

    expect(screen.getByTestId("bootstrap-page")).toBeTruthy();
    expect(screen.queryByTestId("login-child")).toBeNull();
  });

  it("renders children when the flag matches the route intent", () => {
    // Case A: on /login with bootstrapAvailable=false → children render.
    const storeA = makeStore({
      bootstrapAvailable: false,
      status: "succeeded",
      caller: null,
    });
    const { unmount } = render(
      wrap(
        storeA,
        null,
        ["/login"],
        <Routes>
          <Route
            path="/login"
            element={
              <BootstrapGuard>
                <div data-testid="login-child" />
              </BootstrapGuard>
            }
          />
          <Route
            path="/bootstrap"
            element={<div data-testid="bootstrap-page" />}
          />
        </Routes>,
      ),
    );
    expect(screen.getByTestId("login-child")).toBeTruthy();
    unmount();

    // Case B: on /bootstrap with bootstrapAvailable=true → children render.
    const storeB = makeStore({
      bootstrapAvailable: true,
      status: "succeeded",
      caller: null,
    });
    render(
      wrap(
        storeB,
        null,
        ["/bootstrap"],
        <Routes>
          <Route
            path="/bootstrap"
            element={
              <BootstrapGuard>
                <div data-testid="bootstrap-child" />
              </BootstrapGuard>
            }
          />
          <Route path="/login" element={<div data-testid="login-page" />} />
        </Routes>,
      ),
    );
    expect(screen.getByTestId("bootstrap-child")).toBeTruthy();
  });
});
