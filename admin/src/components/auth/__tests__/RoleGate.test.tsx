/**
 * Tests for RoleGate (Task 11.1).
 *
 * RoleGate is a UX-only conditional-render helper that gates privileged UI
 * behind role and status checks. It reads the caller via `useCaller()` which
 * selects from `state.auth`. Tests use a real authSlice reducer with a seeded
 * store — same pattern as UserMenu.test.tsx.
 *
 * Cases covered:
 *  1. Renders children when caller.role === minRole (equal rank passes).
 *  2. Renders children when caller.role is strictly above minRole (OWNER vs MANAGER).
 *  3. Renders fallback (null) when caller.role is below minRole and no fallback given.
 *  4. Renders custom fallback when caller.role is below minRole and fallback is supplied.
 *  5. Renders fallback when caller is null (unauthenticated).
 *  6. Renders fallback when caller.status === DISABLED regardless of role.
 *  7. Renders fallback when caller.role === VENDOR and minRole === EMPLOYEE (VENDOR is below EMPLOYEE).
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Provider } from "react-redux";
import { configureStore } from "@reduxjs/toolkit";
import authReducer from "../../../store/authSlice";
import { RoleGate } from "../RoleGate";
import type { ICaller } from "../../../types";
import { EStaffRole, EUserStatus } from "../../../types";

/** Seed the store with the given caller (or null for unauthenticated). */
function makeStore(caller: ICaller | null) {
  const store = configureStore({ reducer: { auth: authReducer } });
  store.dispatch({
    type: "auth/fetchCaller/fulfilled",
    payload: { caller, bootstrapAvailable: null },
  });
  return store;
}

function renderGate(
  caller: ICaller | null,
  props: { minRole: EStaffRole; fallback?: React.ReactNode },
) {
  const store = makeStore(caller);
  return render(
    <Provider store={store}>
      <RoleGate {...props}>
        <span data-testid="privileged-content">Secret Content</span>
      </RoleGate>
    </Provider>,
  );
}

const ownerCaller: ICaller = {
  email: "owner@example.com",
  role: EStaffRole.OWNER,
  via: "cookie",
};

const managerCaller: ICaller = {
  email: "manager@example.com",
  role: EStaffRole.MANAGER,
  via: "cookie",
};

const employeeCaller: ICaller = {
  email: "employee@example.com",
  role: EStaffRole.EMPLOYEE,
  via: "cookie",
};

describe("RoleGate", () => {
  it("renders children when caller.role === minRole (equal rank passes)", () => {
    renderGate(managerCaller, { minRole: EStaffRole.MANAGER });
    expect(screen.getByTestId("privileged-content")).toBeInTheDocument();
  });

  it("renders children when caller.role is strictly above minRole (OWNER vs MANAGER)", () => {
    renderGate(ownerCaller, { minRole: EStaffRole.MANAGER });
    expect(screen.getByTestId("privileged-content")).toBeInTheDocument();
  });

  it("renders null (no fallback) when caller.role is below minRole", () => {
    renderGate(employeeCaller, { minRole: EStaffRole.MANAGER });
    expect(screen.queryByTestId("privileged-content")).not.toBeInTheDocument();
  });

  it("renders custom fallback when caller.role is below minRole and fallback is supplied", () => {
    renderGate(employeeCaller, {
      minRole: EStaffRole.MANAGER,
      fallback: <span data-testid="access-denied">Access Denied</span>,
    });
    expect(screen.queryByTestId("privileged-content")).not.toBeInTheDocument();
    expect(screen.getByTestId("access-denied")).toBeInTheDocument();
  });

  it("renders fallback when caller is null (unauthenticated)", () => {
    renderGate(null, {
      minRole: EStaffRole.EMPLOYEE,
      fallback: <span data-testid="not-authenticated">Not Authenticated</span>,
    });
    expect(screen.queryByTestId("privileged-content")).not.toBeInTheDocument();
    expect(screen.getByTestId("not-authenticated")).toBeInTheDocument();
  });

  it("renders fallback when caller.status === DISABLED regardless of role (DISABLED OWNER)", () => {
    const disabledOwner: ICaller = {
      ...ownerCaller,
      status: EUserStatus.DISABLED,
    };
    renderGate(disabledOwner, {
      minRole: EStaffRole.OWNER,
      fallback: <span data-testid="disabled-fallback">Account Disabled</span>,
    });
    expect(screen.queryByTestId("privileged-content")).not.toBeInTheDocument();
    expect(screen.getByTestId("disabled-fallback")).toBeInTheDocument();
  });

  it("renders fallback when caller.role === VENDOR and minRole === EMPLOYEE (VENDOR is below EMPLOYEE)", () => {
    const vendorCaller: ICaller = {
      email: "vendor@example.com",
      role: EStaffRole.VENDOR,
      via: "cookie",
    };
    renderGate(vendorCaller, {
      minRole: EStaffRole.EMPLOYEE,
      fallback: <span data-testid="vendor-fallback">Access Denied</span>,
    });
    expect(screen.queryByTestId("privileged-content")).not.toBeInTheDocument();
    expect(screen.getByTestId("vendor-fallback")).toBeInTheDocument();
  });
});
