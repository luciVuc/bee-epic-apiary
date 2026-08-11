/**
 * Router-wiring tests for `App.tsx` (Task 10.11).
 *
 * The App component itself owns nothing but the route tree — the actual
 * page components are heavy (each pulls in the whole world) and each has
 * its own dedicated test file, so here we mock every mounted page + the
 * AdminLayout to tiny stubs. The tests then assert only that
 *
 *   1. the correct stub renders for a given URL, and
 *   2. the two layout guards (`BootstrapGuard`, `RequireCaller`) let the
 *      right traffic through / redirect the wrong traffic.
 *
 * We inject a fresh `MemoryRouter` per test (rather than reusing the
 * `BrowserRouter` from `main.tsx`) so URLs can be seeded per case.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { Provider } from "react-redux";
import { MemoryRouter } from "react-router-dom";
import { configureStore } from "@reduxjs/toolkit";
import App from "../App";
import authReducer from "../store/authSlice";

/* ─── Page + layout stubs ───────────────────────────────────────────────
 * The AdminLayout is a layout route — it must render an <Outlet /> so
 * its child routes (dashboard, products, …) actually show up. We import
 * `react-router-dom` lazily inside the factory (via `vi.importActual`)
 * to sidestep vi.mock's hoisting rules.
 */
vi.mock("../components/layout/AdminLayout", async () => {
  const rrd =
    await vi.importActual<typeof import("react-router-dom")>(
      "react-router-dom",
    );
  return {
    AdminLayout: () => (
      <div data-testid="admin-layout">
        <rrd.Outlet />
      </div>
    ),
  };
});

vi.mock("../pages/DashboardPage", () => ({
  DashboardPage: () => <div data-testid="dashboard-page" />,
}));
vi.mock("../pages/LoginPage", () => ({
  LoginPage: () => <div data-testid="login-page" />,
}));
vi.mock("../pages/BootstrapOwnerPage", () => ({
  BootstrapOwnerPage: () => <div data-testid="bootstrap-page" />,
}));
vi.mock("../pages/AcceptInvitePage", () => ({
  AcceptInvitePage: () => <div data-testid="accept-invite-page" />,
}));
vi.mock("../pages/RequestResetPage", () => ({
  RequestResetPage: () => <div data-testid="request-reset-page" />,
}));
vi.mock("../pages/CompleteResetPage", () => ({
  CompleteResetPage: () => <div data-testid="complete-reset-page" />,
}));
vi.mock("../pages/ProductsPage", () => ({
  ProductsPage: () => <div data-testid="products-page" />,
}));
vi.mock("../pages/ProductDetailPage", () => ({
  ProductDetailPage: () => <div data-testid="product-detail-page" />,
}));
vi.mock("../pages/OrdersPage", () => ({
  OrdersPage: () => <div data-testid="orders-page" />,
}));
vi.mock("../pages/OrderDetailPage", () => ({
  OrderDetailPage: () => <div data-testid="order-detail-page" />,
}));
vi.mock("../pages/SettingsPage", () => ({
  SettingsPage: () => <div data-testid="settings-page" />,
}));

/* ─── API mock ─────────────────────────────────────────────────────────
 * `useCaller` (via the authSlice `fetchCaller` thunk) hits
 * `api.getWhoami` on mount. Each test overrides its resolution.
 */
const mockGetWhoami = vi.fn();
vi.mock("../utils/api", () => ({
  api: {
    getWhoami: (...args: any[]) => mockGetWhoami(...args),
  },
  // The real api.ts exports these; the authSlice imports the bare module
  // (`import * as api`) so we must expose the shape it uses. We stub
  // ApiError as a tiny class so `instanceof` checks in the slice work.
  ApiError: class ApiError extends Error {
    apiError: unknown;
    constructor(msg: string) {
      super(msg);
      this.apiError = { code: msg };
    }
  },
  bindStore: () => {},
}));

function makeStore() {
  return configureStore({ reducer: { auth: authReducer } });
}

function renderAt(initialPath: string) {
  const store = makeStore();
  return render(
    <Provider store={store}>
      <MemoryRouter initialEntries={[initialPath]}>
        <App />
      </MemoryRouter>
    </Provider>,
  );
}

describe("App router wiring", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("mounts LoginPage at /login when no OWNER bootstrap is available", async () => {
    mockGetWhoami.mockResolvedValueOnce({
      caller: null,
      bootstrapAvailable: false,
    });

    renderAt("/login");

    await waitFor(() => {
      expect(screen.getByTestId("login-page")).toBeTruthy();
    });
    expect(screen.queryByTestId("bootstrap-page")).toBeNull();
  });

  it("redirects /dashboard to /login when the caller is unauthenticated", async () => {
    mockGetWhoami.mockResolvedValueOnce({
      caller: null,
      bootstrapAvailable: false,
    });

    renderAt("/dashboard");

    await waitFor(() => {
      expect(screen.getByTestId("login-page")).toBeTruthy();
    });
    expect(screen.queryByTestId("dashboard-page")).toBeNull();
    expect(screen.queryByTestId("admin-layout")).toBeNull();
  });

  it("renders DashboardPage inside AdminLayout for an authenticated caller at /dashboard", async () => {
    mockGetWhoami.mockResolvedValueOnce({
      caller: { email: "u@x", role: "OWNER", via: "cookie" },
    });

    renderAt("/dashboard");

    await waitFor(() => {
      expect(screen.getByTestId("dashboard-page")).toBeTruthy();
    });
    expect(screen.getByTestId("admin-layout")).toBeTruthy();
    expect(screen.queryByTestId("login-page")).toBeNull();
  });

  it("redirects / to /dashboard when the caller is authenticated", async () => {
    mockGetWhoami.mockResolvedValueOnce({
      caller: { email: "u@x", role: "OWNER", via: "cookie" },
    });

    renderAt("/");

    await waitFor(() => {
      expect(screen.getByTestId("dashboard-page")).toBeTruthy();
    });
    expect(screen.getByTestId("admin-layout")).toBeTruthy();
  });
});
