/**
 * Tests for UserMenu (Task 10.13).
 *
 * UserMenu replaces the passive user chip in AdminNavbar with an interactive
 * dropdown containing three actions:
 *   1. Edit name        — inline edit → api.updateMe + dispatch(fetchCaller())
 *   2. Change password  — opens ChangePasswordModal
 *   3. Log out          — useAuthActions().logout() + navigate('/login')
 *
 * Tests stub out `api.updateMe`, `api.logout`, `api.changePassword`, and
 * `api.getAuthPolicy` (the modal fetches policy on mount) and use a real
 * authSlice reducer so the dispatched fetchCaller thunk has somewhere to
 * land. The test router colocates a `/login` placeholder so we can assert
 * post-logout navigation without mocking `useNavigate`.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Provider } from "react-redux";
import { configureStore } from "@reduxjs/toolkit";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import authReducer from "../../../store/authSlice";
import * as apiModule from "../../../utils/api";
import { UserMenu } from "../UserMenu";
import type { ICaller } from "../../../types";
import { EStaffRole } from "../../../types";

vi.mock("../../../utils/api", async () => {
  const actual =
    await vi.importActual<typeof import("../../../utils/api")>(
      "../../../utils/api",
    );
  return {
    ...actual,
    api: {
      ...actual.api,
      updateMe: vi.fn(),
      logout: vi.fn(),
      getWhoami: vi.fn(),
      getAuthPolicy: vi.fn(),
      changePassword: vi.fn(),
    },
  };
});

function makeStore(caller: ICaller | null) {
  const store = configureStore({ reducer: { auth: authReducer } });
  // Seed the auth slice with the desired caller by dispatching a fulfilled
  // fetchCaller action shape — cheaper than a real thunk round-trip.
  store.dispatch({
    type: "auth/fetchCaller/fulfilled",
    payload: { caller, bootstrapAvailable: null },
  });
  return store;
}

function renderMenu(caller: ICaller | null) {
  const store = makeStore(caller);
  return {
    store,
    ...render(
      <MemoryRouter initialEntries={["/dashboard"]}>
        <Provider store={store}>
          <Routes>
            <Route path="/dashboard" element={<UserMenu />} />
            <Route path="/login" element={<div data-testid="login-page" />} />
          </Routes>
        </Provider>
      </MemoryRouter>,
    ),
  };
}

const callerWithName: ICaller = {
  email: "alice@example.com",
  role: EStaffRole.OWNER,
  via: "cookie",
  displayName: "Alice",
};

const callerNoName: ICaller = {
  email: "bob@example.com",
  role: EStaffRole.EMPLOYEE,
  via: "cookie",
};

describe("UserMenu", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // getWhoami is called by fetchCaller after updateMe success. Keep it
    // resolved so the dispatched thunk doesn't dangle.
    (apiModule.api.getWhoami as ReturnType<typeof vi.fn>).mockResolvedValue({
      caller: callerWithName,
      bootstrapAvailable: null,
    });
    (apiModule.api.getAuthPolicy as ReturnType<typeof vi.fn>).mockResolvedValue(
      {
        schemaVersion: 1,
        minLength: 12,
        checkBreachCorpus: false,
        notifyOnPasswordChange: true,
        updatedAt: 0,
        updatedBy: "system@bootstrap.local",
      },
    );
  });

  it("renders caller.displayName when present, else email", () => {
    const { unmount } = renderMenu(callerWithName);
    const trigger = screen.getByTestId("user-menu_trigger");
    expect(trigger.textContent).toContain("Alice");
    unmount();

    renderMenu(callerNoName);
    const trigger2 = screen.getByTestId("user-menu_trigger");
    expect(trigger2.textContent).toContain("bob@example.com");
  });

  it("clicking trigger opens the dropdown; clicking again closes it", async () => {
    const user = userEvent.setup();
    renderMenu(callerWithName);

    expect(screen.queryByTestId("user-menu_dropdown")).toBeNull();

    await user.click(screen.getByTestId("user-menu_trigger"));
    expect(screen.getByTestId("user-menu_dropdown")).toBeTruthy();
    expect(screen.getByTestId("user-menu_edit-name")).toBeTruthy();
    expect(screen.getByTestId("user-menu_change-password")).toBeTruthy();
    expect(screen.getByTestId("user-menu_logout")).toBeTruthy();

    await user.click(screen.getByTestId("user-menu_trigger"));
    expect(screen.queryByTestId("user-menu_dropdown")).toBeNull();
  });

  it("Edit name swaps to inline input; Save calls api.updateMe and exits edit mode", async () => {
    const user = userEvent.setup();
    (apiModule.api.updateMe as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      email: "alice@example.com",
      role: "OWNER",
      status: "ACTIVE",
      displayName: "Alice Updated",
    });

    renderMenu(callerWithName);

    await user.click(screen.getByTestId("user-menu_trigger"));
    await user.click(screen.getByTestId("user-menu_edit-name"));

    const input = screen.getByTestId(
      "user-menu_edit-input",
    ) as HTMLInputElement;
    expect(input.value).toBe("Alice");

    await user.clear(input);
    await user.type(input, "Alice Updated");
    await user.click(screen.getByTestId("user-menu_edit-save"));

    await waitFor(() => {
      expect(apiModule.api.updateMe).toHaveBeenCalledWith({
        displayName: "Alice Updated",
      });
    });
    // Edit mode exited — input gone.
    await waitFor(() => {
      expect(screen.queryByTestId("user-menu_edit-input")).toBeNull();
    });
  });

  it("Log out calls api.logout and navigates to /login", async () => {
    const user = userEvent.setup();
    (apiModule.api.logout as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      undefined,
    );

    renderMenu(callerWithName);

    await user.click(screen.getByTestId("user-menu_trigger"));
    await user.click(screen.getByTestId("user-menu_logout"));

    await screen.findByTestId("login-page");
    expect(apiModule.api.logout).toHaveBeenCalledTimes(1);
  });

  it("Change password menu item opens the ChangePasswordModal", async () => {
    const user = userEvent.setup();
    renderMenu(callerWithName);

    await user.click(screen.getByTestId("user-menu_trigger"));
    await user.click(screen.getByTestId("user-menu_change-password"));

    expect(screen.getByTestId("change-password_modal")).toBeTruthy();
  });
});
