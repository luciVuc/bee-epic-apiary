/**
 * Tests for UsersTab (Task 11.2).
 *
 * UsersTab is the OWNER-only interface for the /users/* API surface:
 *   - List users with email, displayName, role, status, last login
 *   - Invite a new user with email + role + optional displayName
 *   - Change role or status inline
 *   - Re-invite INVITED users
 *   - Delete user with confirm dialog
 *   - Client-side guards for self-demotion, self-delete, last-OWNER
 *
 * Test wiring mirrors AdminConfigTab.test.tsx (useCaller mock) and
 * UserMenu.test.tsx (api mock pattern with vi.importActual).
 *
 * Data-testid convention: users-tab_* (mirrors staff-tab_*).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { UsersTab } from "../UsersTab";
import * as apiModule from "../../../utils/api";
import { ApiError } from "../../../utils/api";
import type { ICaller } from "../../../types";
import { EStaffRole, EUserStatus } from "../../../types";
import type { IUserPublic } from "@bee-epic/shared";
import type { IApiError } from "@bee-epic/shared";

/* ─── mock api ───────────────────────────────────────────────────────── */

vi.mock("../../../utils/api", async () => {
  const actual =
    await vi.importActual<typeof import("../../../utils/api")>(
      "../../../utils/api",
    );
  return {
    ...actual,
    api: {
      ...actual.api,
      listUsers: vi.fn(),
      inviteUser: vi.fn(),
      updateUser: vi.fn(),
      deleteUser: vi.fn(),
      reinviteUser: vi.fn(),
    },
    apiErrorMessage: vi.fn((err: unknown, fallback: string) => {
      // For testing, delegate to actual for ApiError instances, else return fallback.
      return actual.apiErrorMessage(err, fallback);
    }),
  };
});

/* ─── mock useCaller ─────────────────────────────────────────────────── */

const mockCaller = vi.fn<() => ICaller | null>(() => null);
vi.mock("../../../hooks/useCaller", () => ({
  useCaller: () => ({
    caller: mockCaller(),
    status: "succeeded",
    error: null,
    refetch: vi.fn(),
  }),
}));

/* ─── test data ──────────────────────────────────────────────────────── */

const ownerCaller: ICaller = {
  email: "owner@example.com",
  role: EStaffRole.OWNER,
  via: "cookie",
  displayName: "Owner Alice",
};

const activeOwner: IUserPublic = {
  schemaVersion: 1,
  email: "owner@example.com",
  displayName: "Owner Alice",
  role: EStaffRole.OWNER,
  status: EUserStatus.ACTIVE,
  createdAt: 1700000000000,
  updatedAt: 1700000000000,
  lastLoginAt: 1700100000000,
  lastLoginIp: "1.2.3.4",
};

const activeManager: IUserPublic = {
  schemaVersion: 1,
  email: "manager@example.com",
  displayName: "Bob Manager",
  role: EStaffRole.MANAGER,
  status: EUserStatus.ACTIVE,
  createdAt: 1700000001000,
  updatedAt: 1700000001000,
  lastLoginAt: null,
  lastLoginIp: null,
};

const invitedEmployee: IUserPublic = {
  schemaVersion: 1,
  email: "invited@example.com",
  displayName: "Charlie Invited",
  role: EStaffRole.EMPLOYEE,
  status: EUserStatus.INVITED,
  createdAt: 1700000002000,
  updatedAt: 1700000002000,
  lastLoginAt: null,
  lastLoginIp: null,
};

/* ─── shorthand access to mocks ─────────────────────────────────────── */

type ApiMock = {
  listUsers: ReturnType<typeof vi.fn>;
  inviteUser: ReturnType<typeof vi.fn>;
  updateUser: ReturnType<typeof vi.fn>;
  deleteUser: ReturnType<typeof vi.fn>;
  reinviteUser: ReturnType<typeof vi.fn>;
};

function mockApi(): ApiMock {
  return apiModule.api as unknown as ApiMock;
}

/* ─── helper: make a real ApiError ──────────────────────────────────── */

function makeApiError(code: string, extra?: Record<string, unknown>): ApiError {
  return new ApiError({ code, ...extra } as IApiError);
}

/* ─── render helper ──────────────────────────────────────────────────── */

function renderTab() {
  return render(<UsersTab />);
}

/* ═══════════════════════════════════════════════════════════════════════
   Tests
   ═══════════════════════════════════════════════════════════════════════ */

describe("UsersTab", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCaller.mockReturnValue(ownerCaller);
    // Default: listUsers resolves with two users.
    mockApi().listUsers.mockResolvedValue([activeOwner, activeManager]);
  });

  /* 1 ── spinner while listUsers is in flight ──────────────────────── */

  it("renders a spinner while listUsers is in flight", async () => {
    let resolve!: (v: IUserPublic[]) => void;
    mockApi().listUsers.mockReturnValueOnce(
      new Promise<IUserPublic[]>((res) => {
        resolve = res;
      }),
    );
    renderTab();
    expect(screen.getByTestId("users-tab_loading")).toBeInTheDocument();
    // Resolve so the component can clean up.
    resolve([]);
    await waitFor(() =>
      expect(screen.queryByTestId("users-tab_loading")).not.toBeInTheDocument(),
    );
  });

  /* 2 ── red alert + Retry on fetch failure ────────────────────────── */

  it("renders a red alert and Retry button on fetch failure", async () => {
    mockApi().listUsers.mockRejectedValueOnce(new Error("network error"));
    renderTab();
    await screen.findByTestId("users-tab_fetch-error");
    expect(screen.getByTestId("users-tab_retry-btn")).toBeInTheDocument();
  });

  it("Retry button re-invokes listUsers", async () => {
    mockApi()
      .listUsers.mockRejectedValueOnce(new Error("network error"))
      .mockResolvedValueOnce([]);
    const user = userEvent.setup();
    renderTab();
    await screen.findByTestId("users-tab_retry-btn");
    await user.click(screen.getByTestId("users-tab_retry-btn"));
    await waitFor(() => expect(mockApi().listUsers).toHaveBeenCalledTimes(2));
  });

  /* 3 ── renders each user's email + displayName + role + status ────── */

  it("renders each user's email, displayName, role and status", async () => {
    renderTab();
    await screen.findByTestId(`users-tab_email-${activeOwner.email}`);

    expect(
      screen.getByTestId(`users-tab_email-${activeOwner.email}`).textContent,
    ).toBe(activeOwner.email);
    expect(
      screen.getByTestId(`users-tab_displayname-${activeOwner.email}`)
        .textContent,
    ).toBe(activeOwner.displayName);

    expect(
      screen.getByTestId(`users-tab_email-${activeManager.email}`).textContent,
    ).toBe(activeManager.email);

    // Role selects show the correct value.
    const ownerRoleSelect = screen.getByTestId(
      `users-tab_role-${activeOwner.email}`,
    ) as HTMLSelectElement;
    expect(ownerRoleSelect.value).toBe(EStaffRole.OWNER);

    const managerRoleSelect = screen.getByTestId(
      `users-tab_role-${activeManager.email}`,
    ) as HTMLSelectElement;
    expect(managerRoleSelect.value).toBe(EStaffRole.MANAGER);
  });

  /* 4 ── empty list: message + invite form visible ─────────────────── */

  it("renders empty-list message and invite form when no users exist", async () => {
    mockApi().listUsers.mockResolvedValueOnce([]);
    renderTab();
    await screen.findByTestId("users-tab_empty");
    expect(screen.getByTestId("users-tab_empty").textContent).toMatch(
      /No users yet/,
    );
    expect(screen.getByTestId("users-tab_invite-form")).toBeInTheDocument();
  });

  /* 5 ── invite happy path ─────────────────────────────────────────── */

  it("invite happy path: fires inviteUser with lowercased email, then refetches list", async () => {
    const user = userEvent.setup();
    const newUser: IUserPublic = {
      schemaVersion: 1,
      email: "newuser@example.com",
      displayName: "",
      role: EStaffRole.EMPLOYEE,
      status: EUserStatus.INVITED,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      lastLoginAt: null,
      lastLoginIp: null,
    };
    mockApi().inviteUser.mockResolvedValueOnce(newUser);
    mockApi()
      .listUsers.mockResolvedValueOnce([activeOwner, activeManager]) // initial
      .mockResolvedValueOnce([activeOwner, activeManager, newUser]); // after invite

    renderTab();
    await screen.findByTestId("users-tab_invite-form");

    const emailInput = screen.getByLabelText("Email") as HTMLInputElement;
    await user.type(emailInput, "  NewUser@Example.COM  ");

    await user.click(screen.getByTestId("users-tab_invite-btn"));

    await waitFor(() => {
      expect(mockApi().inviteUser).toHaveBeenCalledWith(
        expect.objectContaining({ email: "newuser@example.com" }),
      );
    });

    // List is refetched.
    await waitFor(() => expect(mockApi().listUsers).toHaveBeenCalledTimes(2));

    // Form cleared.
    await waitFor(() => {
      expect(emailInput.value).toBe("");
    });
  });

  /* 6 ── invite VALIDATION_ERROR: inline field error, form not cleared ─ */

  it("invite VALIDATION_ERROR shows inline field error without clearing form", async () => {
    const user = userEvent.setup();
    mockApi().inviteUser.mockRejectedValueOnce(
      makeApiError("VALIDATION_FAILED", { fields: { email: "invalid email" } }),
    );

    renderTab();
    await screen.findByTestId("users-tab_invite-form");

    const emailInput = screen.getByLabelText("Email") as HTMLInputElement;
    // Use a syntactically valid email that the server rejects (type="email" is
    // now set on the input; "invalid@invalid" passes HTML5 format checks but
    // the server still returns VALIDATION_FAILED for this fixture).
    await user.type(emailInput, "invalid@invalid");

    await user.click(screen.getByTestId("users-tab_invite-btn"));

    await screen.findByTestId("users-tab_invite-email-error");
    // Form NOT cleared.
    expect(emailInput.value).toBe("invalid@invalid");
    // No invite banner.
    expect(
      screen.queryByTestId("users-tab_invite-banner"),
    ).not.toBeInTheDocument();
  });

  /* 7 ── invite USER_EXISTS (409): top banner appears ─────────────── */

  it("invite USER_EXISTS shows a top banner", async () => {
    const user = userEvent.setup();
    mockApi().inviteUser.mockRejectedValueOnce(makeApiError("USER_EXISTS"));

    renderTab();
    await screen.findByTestId("users-tab_invite-form");

    const emailInput = screen.getByLabelText("Email");
    await user.type(emailInput, "existing@example.com");
    await user.click(screen.getByTestId("users-tab_invite-btn"));

    await screen.findByTestId("users-tab_invite-banner");
    expect(screen.getByTestId("users-tab_invite-banner")).toBeInTheDocument();
  });

  /* 8 ── role change happy path ─────────────────────────────────────── */

  it("role change: fires updateUser with new role and refetches list", async () => {
    const user = userEvent.setup();
    const updatedManager: IUserPublic = {
      ...activeManager,
      role: EStaffRole.EMPLOYEE,
    };
    mockApi().updateUser.mockResolvedValueOnce(updatedManager);
    mockApi()
      .listUsers.mockResolvedValueOnce([activeOwner, activeManager])
      .mockResolvedValueOnce([activeOwner, updatedManager]);

    renderTab();
    await screen.findByTestId(`users-tab_role-${activeManager.email}`);

    const select = screen.getByTestId(
      `users-tab_role-${activeManager.email}`,
    ) as HTMLSelectElement;

    await user.selectOptions(select, EStaffRole.EMPLOYEE);

    await waitFor(() => {
      expect(mockApi().updateUser).toHaveBeenCalledWith(
        activeManager.email,
        expect.objectContaining({ role: EStaffRole.EMPLOYEE }),
      );
    });
    await waitFor(() => expect(mockApi().listUsers).toHaveBeenCalledTimes(2));
  });

  /* 9 ── role change error: banner appears ────────────────────────── */

  it("role change CANNOT_DEMOTE_LAST_OWNER: shows friendly banner and reverts role", async () => {
    const user = userEvent.setup();
    mockApi().updateUser.mockRejectedValueOnce(
      makeApiError("CANNOT_DEMOTE_LAST_OWNER"),
    );

    renderTab();
    await screen.findByTestId(`users-tab_role-${activeManager.email}`);

    const select = screen.getByTestId(
      `users-tab_role-${activeManager.email}`,
    ) as HTMLSelectElement;
    await user.selectOptions(select, EStaffRole.EMPLOYEE);

    await screen.findByTestId("users-tab_banner");
    expect(screen.getByTestId("users-tab_banner").textContent).toContain(
      "Cannot proceed — at least one OWNER must remain.",
    );

    // Role select must revert to the prior value after the failed update.
    const roleSelect = screen.getByTestId(
      `users-tab_role-${activeManager.email}`,
    ) as HTMLSelectElement;
    expect(roleSelect.value).toBe(EStaffRole.MANAGER);
  });

  it("role change FORBIDDEN: shows permission banner, reverts role, logs console.error", async () => {
    const user = userEvent.setup();
    const consoleSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    mockApi().updateUser.mockRejectedValueOnce(makeApiError("FORBIDDEN"));

    renderTab();
    await screen.findByTestId(`users-tab_role-${activeManager.email}`);

    const select = screen.getByTestId(
      `users-tab_role-${activeManager.email}`,
    ) as HTMLSelectElement;
    await user.selectOptions(select, EStaffRole.EMPLOYEE);

    await screen.findByTestId("users-tab_banner");
    expect(screen.getByTestId("users-tab_banner").textContent).toContain(
      "You don't have permission.",
    );

    // Role select must revert to the prior value.
    const roleSelect = screen.getByTestId(
      `users-tab_role-${activeManager.email}`,
    ) as HTMLSelectElement;
    expect(roleSelect.value).toBe(EStaffRole.MANAGER);

    // console.error should have been called (OWNER guard warning).
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining("[UsersTab] FORBIDDEN response"),
      expect.anything(),
    );

    consoleSpy.mockRestore();
  });

  /* 10 ── self-demotion guard: OWNER caller's own role select disabled ─ */

  it("self-demotion guard: own OWNER role SelectField is disabled", async () => {
    renderTab();
    await screen.findByTestId(`users-tab_role-${activeOwner.email}`);

    const ownerSelect = screen.getByTestId(
      `users-tab_role-${activeOwner.email}`,
    ) as HTMLSelectElement;
    expect(ownerSelect).toBeDisabled();
  });

  /* 11 ── last-OWNER guard: delete + role disabled for sole active OWNER */

  it("last-OWNER guard: delete button and role select disabled when only one active OWNER", async () => {
    // Only owner in the list.
    mockApi().listUsers.mockResolvedValueOnce([activeOwner]);
    renderTab();
    await screen.findByTestId(`users-tab_row-${activeOwner.email}`);

    const deleteBtn = screen.getByTestId(
      `users-tab_delete-${activeOwner.email}`,
    ) as HTMLButtonElement;
    const roleSelect = screen.getByTestId(
      `users-tab_role-${activeOwner.email}`,
    ) as HTMLSelectElement;

    expect(deleteBtn).toBeDisabled();
    expect(roleSelect).toBeDisabled();
  });

  it("last-OWNER guard: delete and role enabled once a second active OWNER exists", async () => {
    // Two owners in the list — caller is first.
    const secondOwner: IUserPublic = {
      ...activeOwner,
      email: "owner2@example.com",
      displayName: "Owner Two",
    };
    mockApi().listUsers.mockResolvedValueOnce([activeOwner, secondOwner]);
    renderTab();
    await screen.findByTestId(`users-tab_row-${secondOwner.email}`);

    const deleteBtn = screen.getByTestId(
      `users-tab_delete-${secondOwner.email}`,
    ) as HTMLButtonElement;
    const roleSelect = screen.getByTestId(
      `users-tab_role-${secondOwner.email}`,
    ) as HTMLSelectElement;

    // Second owner is not the caller and there are 2 owners → neither guard fires.
    expect(deleteBtn).not.toBeDisabled();
    // Role is NOT locked for the second owner (not self, not last).
    expect(roleSelect).not.toBeDisabled();
  });

  /* 12 ── delete happy path ────────────────────────────────────────── */

  it("delete happy path: confirm→deleteUser→row disappears", async () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    mockApi().deleteUser.mockResolvedValueOnce(undefined);
    mockApi()
      .listUsers.mockResolvedValueOnce([activeOwner, activeManager])
      .mockResolvedValueOnce([activeOwner]); // manager removed

    const user = userEvent.setup();
    renderTab();
    await screen.findByTestId(`users-tab_delete-${activeManager.email}`);

    await user.click(
      screen.getByTestId(`users-tab_delete-${activeManager.email}`),
    );

    await waitFor(() =>
      expect(mockApi().deleteUser).toHaveBeenCalledWith(activeManager.email),
    );
    await waitFor(() =>
      expect(
        screen.queryByTestId(`users-tab_row-${activeManager.email}`),
      ).not.toBeInTheDocument(),
    );

    confirmSpy.mockRestore();
  });

  it("delete: does NOT fire deleteUser when confirm is cancelled", async () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);

    const user = userEvent.setup();
    renderTab();
    await screen.findByTestId(`users-tab_delete-${activeManager.email}`);

    await user.click(
      screen.getByTestId(`users-tab_delete-${activeManager.email}`),
    );

    expect(mockApi().deleteUser).not.toHaveBeenCalled();
    confirmSpy.mockRestore();
  });

  /* 13 ── reinvite ─────────────────────────────────────────────────── */

  it("reinvite: button only visible for INVITED users, fires reinviteUser, shows flash", async () => {
    mockApi().listUsers.mockResolvedValueOnce([
      activeOwner,
      activeManager,
      invitedEmployee,
    ]);
    mockApi().reinviteUser.mockResolvedValueOnce(undefined);

    const user = userEvent.setup();
    renderTab();

    // Active users have no reinvite button.
    await screen.findByTestId(`users-tab_row-${invitedEmployee.email}`);
    expect(
      screen.queryByTestId(`users-tab_reinvite-${activeOwner.email}`),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByTestId(`users-tab_reinvite-${activeManager.email}`),
    ).not.toBeInTheDocument();

    // Invited user has a reinvite button.
    const reinviteBtn = screen.getByTestId(
      `users-tab_reinvite-${invitedEmployee.email}`,
    );
    expect(reinviteBtn).toBeInTheDocument();

    await user.click(reinviteBtn);

    await waitFor(() =>
      expect(mockApi().reinviteUser).toHaveBeenCalledWith(
        invitedEmployee.email,
      ),
    );

    // Flash message appears.
    await screen.findByTestId("users-tab_reinvite-flash");
    expect(screen.getByTestId("users-tab_reinvite-flash")).toBeInTheDocument();
  });
});
