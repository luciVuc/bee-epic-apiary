/**
 * UsersTab — OWNER-only interface for the /users/* API surface (Phase 8).
 */
import { useState, useEffect, useCallback, useRef } from "react";
import {
  Plus,
  Trash2,
  RefreshCw,
  AlertCircle,
  CheckCircle,
  Mail,
} from "lucide-react";
import type { IUserPublic } from "@bee-epic/shared";
import { EStaffRole, EUserStatus } from "@bee-epic/shared";
import { TextField, SelectField } from "../../components/forms";
import { api, apiErrorMessage, ApiError } from "../../utils/api";
import { useCaller } from "../../hooks/useCaller";

/* ─── constants ──────────────────────────────────────────────────────── */

const ROLE_OPTIONS = [
  { value: EStaffRole.OWNER, label: "Owner" },
  { value: EStaffRole.MANAGER, label: "Manager" },
  { value: EStaffRole.EMPLOYEE, label: "Employee" },
  { value: EStaffRole.VENDOR, label: "Vendor" },
];

const STATUS_OPTIONS = [
  { value: EUserStatus.ACTIVE, label: "Active" },
  { value: EUserStatus.DISABLED, label: "Disabled" },
];

/* ─── helpers ────────────────────────────────────────────────────────── */

function fmtLastLogin(ts: number | null): string {
  if (ts == null) return "Never";
  return new Date(ts).toLocaleDateString();
}

function isLastActiveOwner(users: IUserPublic[], email: string): boolean {
  const activeOwners = users.filter(
    (u) => u.role === EStaffRole.OWNER && u.status === EUserStatus.ACTIVE,
  );
  return activeOwners.length === 1 && activeOwners[0].email === email;
}

function getApiCode(err: unknown): string | null {
  if (err instanceof ApiError) return err.apiError.code;
  return null;
}

/* ─── UserRow sub-component ─────────────────────────────────────────── */

interface IUserRowProps {
  user: IUserPublic;
  callerEmail: string;
  allUsers: IUserPublic[];
  onRoleChange: (email: string, role: EStaffRole) => Promise<void>;
  onStatusChange: (email: string, status: EUserStatus) => Promise<void>;
  onReinvite: (email: string) => Promise<void>;
  onDelete: (email: string) => Promise<void>;
  mutating: string | null; // email of the row currently mutating
}

/**
 * A single user row: role/status selects, re-invite (INVITED only) and delete
 * controls. Guard logic disables self-role changes and the last active OWNER's
 * role/delete so the store can never be left ownerless; `mutating` disables the
 * whole row while its own request is in flight.
 */
function UserRow({
  user,
  callerEmail,
  allUsers,
  onRoleChange,
  onStatusChange,
  onReinvite,
  onDelete,
  mutating,
}: IUserRowProps) {
  const isSelf = callerEmail === user.email;
  const isLastOwner = isLastActiveOwner(allUsers, user.email);
  const isInFlight = mutating === user.email;

  const roleLocked = (isSelf && user.role === EStaffRole.OWNER) || isLastOwner;
  const statusLocked = isSelf || user.status === EUserStatus.INVITED;
  const deleteLocked = isSelf || isLastOwner;

  let roleTooltip = "";
  if (isSelf && user.role === EStaffRole.OWNER) {
    roleTooltip = "You cannot change your own role.";
  } else if (isLastOwner) {
    roleTooltip = "At least one active OWNER must remain.";
  }

  let deleteTooltip = "";
  if (isSelf) {
    deleteTooltip = "You cannot delete yourself.";
  } else if (isLastOwner) {
    deleteTooltip = "At least one active OWNER must remain.";
  }

  return (
    <div
      className="p-4 border border-gray-200 rounded-lg dark:border-gray-700"
      data-testid={`users-tab_row-${user.email}`}
    >
      {/* Email + display name + last login */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p
            className="font-medium text-dark-800 dark:text-dark-100 truncate"
            data-testid={`users-tab_email-${user.email}`}
          >
            {user.email}
          </p>
          {user.displayName && (
            <p
              className="text-sm text-dark-500 truncate"
              data-testid={`users-tab_displayname-${user.email}`}
            >
              {user.displayName}
            </p>
          )}
          <p className="text-xs text-dark-400 mt-0.5">
            Last login: {fmtLastLogin(user.lastLoginAt)}
          </p>
        </div>

        {/* Row controls */}
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {/* Role select */}
          <div
            title={roleTooltip}
            data-testid={`users-tab_role-wrapper-${user.email}`}
          >
            <select
              aria-label={`Role for ${user.email}`}
              value={user.role}
              disabled={roleLocked || isInFlight}
              data-testid={`users-tab_role-${user.email}`}
              onChange={(e) =>
                onRoleChange(user.email, e.target.value as EStaffRole)
              }
              className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 outline-none dark:border-gray-600 dark:bg-dark-100 dark:text-dark-900 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {ROLE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>

          {/* Status control */}
          <div
            title={
              statusLocked && isSelf
                ? "You cannot change your own status"
                : user.status === EUserStatus.INVITED
                  ? "Awaiting invite acceptance"
                  : undefined
            }
            data-testid={`users-tab_status-wrapper-${user.email}`}
          >
            {user.status === EUserStatus.INVITED ? (
              <span
                className="text-xs px-2 py-1 rounded bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300"
                data-testid={`users-tab_status-invited-${user.email}`}
              >
                Awaiting invite acceptance
              </span>
            ) : (
              <select
                aria-label={`Status for ${user.email}`}
                value={user.status}
                disabled={statusLocked || isInFlight}
                data-testid={`users-tab_status-${user.email}`}
                onChange={(e) =>
                  onStatusChange(user.email, e.target.value as EUserStatus)
                }
                className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 outline-none dark:border-gray-600 dark:bg-dark-100 dark:text-dark-900 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {STATUS_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Re-invite button — only for INVITED users */}
          {user.status === EUserStatus.INVITED && (
            <button
              onClick={() => onReinvite(user.email)}
              disabled={isInFlight}
              aria-label={`Resend invite to ${user.email}`}
              data-testid={`users-tab_reinvite-${user.email}`}
              className="p-1.5 text-blue-500 hover:bg-blue-50 rounded-lg dark:hover:bg-blue-900/30 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Mail className="w-4 h-4" aria-hidden="true" />
            </button>
          )}

          {/* Delete button */}
          <div title={deleteTooltip}>
            <button
              onClick={() => onDelete(user.email)}
              disabled={deleteLocked || isInFlight}
              aria-label={`Delete ${user.email}`}
              data-testid={`users-tab_delete-${user.email}`}
              className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg dark:hover:bg-red-900/30 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Trash2 className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── UsersTab ───────────────────────────────────────────────────────── */

type FetchStatus = "idle" | "loading" | "error";

/**
 * OWNER-only user management tab over the `/users/*` API: list existing users,
 * change role/status inline, re-invite pending users, delete, and invite new
 * ones. Mutations optimistically revert on failure and surface server error
 * codes (FORBIDDEN, CANNOT_DEMOTE_LAST_OWNER, USER_EXISTS, …) as scoped
 * banners; `USER_NOT_FOUND` triggers a silent refetch to resync.
 */
export function UsersTab() {
  const { caller } = useCaller();

  const [users, setUsers] = useState<IUserPublic[]>([]);
  const [fetchStatus, setFetchStatus] = useState<FetchStatus>("idle");
  const [fetchError, setFetchError] = useState("");

  // Top-level banner for row-scoped errors.
  const [banner, setBanner] = useState<string | null>(null);
  // Flash message for reinvite success.
  const [reinviteFlash, setReinviteFlash] = useState<string | null>(null);
  // Email of the row whose mutation is currently in flight.
  const [mutating, setMutating] = useState<string | null>(null);

  // Ref to track the reinvite flash timer for cleanup on unmount.
  const reinviteTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    return () => {
      if (reinviteTimerRef.current) clearTimeout(reinviteTimerRef.current);
    };
  }, []);

  // Invite form state.
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<EStaffRole>(EStaffRole.EMPLOYEE);
  const [inviteDisplayName, setInviteDisplayName] = useState("");
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteBanner, setInviteBanner] = useState<string | null>(null);

  /* ── fetching ─────────────────────────────────────────────────────── */

  const fetchUsers = useCallback(async () => {
    setFetchStatus("loading");
    setFetchError("");
    try {
      const list = await api.listUsers();
      setUsers(list);
      setFetchStatus("idle");
    } catch (err) {
      setFetchError(
        apiErrorMessage(err, "Failed to load users. Please try again."),
      );
      setFetchStatus("error");
    }
  }, []);

  useEffect(() => {
    void fetchUsers();
  }, [fetchUsers]);

  /* ── role change ──────────────────────────────────────────────────── */

  const handleRoleChange = async (
    email: string,
    role: EStaffRole,
  ): Promise<void> => {
    setBanner(null);
    setMutating(email);
    const prev = users.find((u) => u.email === email);
    try {
      await api.updateUser(email, { role });
      await fetchUsers();
    } catch (err) {
      const code = getApiCode(err);
      const revertRole = () => {
        if (prev) {
          setUsers((current) =>
            current.map((u) =>
              u.email === email ? { ...u, role: prev.role } : u,
            ),
          );
        }
      };
      if (code === "USER_NOT_FOUND") {
        await fetchUsers();
        return;
      }
      if (code === "FORBIDDEN") {
        console.error("[UsersTab] FORBIDDEN response — check OWNER guard", err);
        setBanner("You don't have permission.");
        revertRole();
        return;
      }
      if (code === "CANNOT_DEMOTE_LAST_OWNER") {
        setBanner("Cannot proceed — at least one OWNER must remain.");
        revertRole();
        return;
      }
      // generic fallback (non-ApiError or unhandled code)
      setBanner(
        apiErrorMessage(err, "Failed to update role. Please try again."),
      );
      revertRole();
    } finally {
      setMutating(null);
    }
  };

  /* ── status change ────────────────────────────────────────────────── */

  const handleStatusChange = async (
    email: string,
    status: EUserStatus,
  ): Promise<void> => {
    setBanner(null);
    setMutating(email);
    const prev = users.find((u) => u.email === email);
    try {
      await api.updateUser(email, { status });
      await fetchUsers();
    } catch (err) {
      const code = getApiCode(err);
      if (code === "USER_NOT_FOUND") {
        await fetchUsers();
        return;
      }
      if (code === "FORBIDDEN") {
        console.error("[UsersTab] FORBIDDEN response — check OWNER guard", err);
        if (prev) {
          setUsers((current) =>
            current.map((u) =>
              u.email === email ? { ...u, status: prev.status } : u,
            ),
          );
        }
        setBanner("You don't have permission.");
        return;
      }
      setBanner(
        apiErrorMessage(err, "Failed to update status. Please try again."),
      );
      if (prev) {
        setUsers((current) =>
          current.map((u) =>
            u.email === email ? { ...u, status: prev.status } : u,
          ),
        );
      }
    } finally {
      setMutating(null);
    }
  };

  /* ── reinvite ─────────────────────────────────────────────────────── */

  const handleReinvite = async (email: string): Promise<void> => {
    setBanner(null);
    setReinviteFlash(null);
    setMutating(email);
    try {
      await api.reinviteUser(email);
      setReinviteFlash(`Invite resent to ${email}.`);
      if (reinviteTimerRef.current) clearTimeout(reinviteTimerRef.current);
      reinviteTimerRef.current = setTimeout(() => setReinviteFlash(null), 4000);
    } catch (err) {
      const code = getApiCode(err);
      if (code === "USER_NOT_FOUND") {
        await fetchUsers();
        return;
      }
      if (code === "FORBIDDEN") {
        console.error("[UsersTab] FORBIDDEN response — check OWNER guard", err);
        setBanner("You don't have permission.");
        return;
      }
      setBanner(
        apiErrorMessage(err, "Failed to resend invite. Please try again."),
      );
    } finally {
      setMutating(null);
    }
  };

  /* ── delete ───────────────────────────────────────────────────────── */

  const handleDelete = async (email: string): Promise<void> => {
    if (!window.confirm(`Delete ${email}? This cannot be undone.`)) {
      return;
    }
    setBanner(null);
    setMutating(email);
    try {
      await api.deleteUser(email);
      await fetchUsers();
    } catch (err) {
      const code = getApiCode(err);
      if (code === "USER_NOT_FOUND") {
        await fetchUsers();
        return;
      }
      if (code === "FORBIDDEN") {
        console.error("[UsersTab] FORBIDDEN response — check OWNER guard", err);
        setBanner("You don't have permission.");
        return;
      }
      if (code === "CANNOT_DELETE_LAST_OWNER") {
        setBanner("Cannot proceed — at least one OWNER must remain.");
        return;
      }
      // generic fallback (non-ApiError or unhandled code)
      setBanner(
        apiErrorMessage(err, "Failed to delete user. Please try again."),
      );
    } finally {
      setMutating(null);
    }
  };

  /* ── invite form ──────────────────────────────────────────────────── */

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    const email = inviteEmail.trim().toLowerCase();
    if (!email) return;
    setInviteError(null);
    setInviteBanner(null);
    setInviteLoading(true);
    try {
      await api.inviteUser({
        email,
        role: inviteRole,
        displayName: inviteDisplayName.trim() || undefined,
      });
      // Clear form on success.
      setInviteEmail("");
      setInviteDisplayName("");
      setInviteRole(EStaffRole.EMPLOYEE);
      await fetchUsers();
    } catch (err) {
      const code = getApiCode(err);
      if (code === "VALIDATION_FAILED" || code === "INVALID_EMAIL") {
        setInviteError(
          apiErrorMessage(err, "Please enter a valid email address."),
        );
        // Form NOT cleared — user corrects in-place.
      } else if (code === "USER_EXISTS") {
        setInviteBanner(
          apiErrorMessage(err, "A user with that email already exists."),
        );
      } else {
        setInviteBanner(
          apiErrorMessage(err, "Failed to send invite. Please try again."),
        );
      }
    } finally {
      setInviteLoading(false);
    }
  };

  /* ── render ───────────────────────────────────────────────────────── */

  const callerEmail = caller?.email ?? "";

  if (fetchStatus === "loading") {
    return (
      <div
        className="flex items-center justify-center h-32"
        role="status"
        aria-live="polite"
        data-testid="users-tab_loading"
      >
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-500 dark:border-primary-400" />
        <span className="sr-only">Loading users...</span>
      </div>
    );
  }

  if (fetchStatus === "error") {
    return (
      <div
        className="space-y-4"
        data-testid="users-tab_fetch-error"
        role="alert"
      >
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 dark:bg-red-900/20 dark:border-red-800/30">
          <AlertCircle
            className="w-5 h-5 text-red-500 shrink-0"
            aria-hidden="true"
          />
          <span className="text-red-700 dark:text-red-300">{fetchError}</span>
        </div>
        <button
          onClick={() => void fetchUsers()}
          data-testid="users-tab_retry-btn"
          className="flex items-center gap-2 px-4 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600 transition-colors font-medium"
        >
          <RefreshCw className="w-4 h-4" aria-hidden="true" />
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="users-tab">
      {/* Row-level banner */}
      {banner && (
        <div
          role="alert"
          data-testid="users-tab_banner"
          className="p-4 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 dark:bg-red-900/20 dark:border-red-800/30"
        >
          <AlertCircle
            className="w-5 h-5 text-red-500 shrink-0"
            aria-hidden="true"
          />
          <span className="text-red-700 dark:text-red-300">{banner}</span>
        </div>
      )}

      {/* Reinvite success flash */}
      {reinviteFlash && (
        <div
          role="status"
          data-testid="users-tab_reinvite-flash"
          className="p-4 bg-green-50 border border-green-200 rounded-lg flex items-center gap-2 dark:bg-green-900/20 dark:border-green-800/30"
        >
          <CheckCircle
            className="w-5 h-5 text-green-500 shrink-0"
            aria-hidden="true"
          />
          <span className="text-green-700 dark:text-green-300">
            {reinviteFlash}
          </span>
        </div>
      )}

      {/* User list */}
      <div className="space-y-3">
        {users.length === 0 ? (
          <p
            className="text-sm text-dark-500 py-4 text-center"
            data-testid="users-tab_empty"
          >
            No users yet. Invite the first one below.
          </p>
        ) : (
          users.map((user) => (
            <UserRow
              key={user.email}
              user={user}
              callerEmail={callerEmail}
              allUsers={users}
              onRoleChange={handleRoleChange}
              onStatusChange={handleStatusChange}
              onReinvite={handleReinvite}
              onDelete={handleDelete}
              mutating={mutating}
            />
          ))
        )}
      </div>

      {/* Invite form */}
      <form
        onSubmit={(e) => void handleInvite(e)}
        className="p-4 border border-dashed border-gray-300 rounded-lg dark:border-gray-600"
        data-testid="users-tab_invite-form"
      >
        <p className="text-sm font-medium text-dark-700 dark:text-dark-300 mb-3">
          Invite a New User
        </p>

        {/* Invite-level banner (USER_EXISTS / generic) */}
        {inviteBanner && (
          <div
            role="alert"
            data-testid="users-tab_invite-banner"
            className="mb-3 p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 dark:bg-red-900/20 dark:border-red-800/30"
          >
            <AlertCircle
              className="w-4 h-4 text-red-500 shrink-0"
              aria-hidden="true"
            />
            <span className="text-sm text-red-700 dark:text-red-300">
              {inviteBanner}
            </span>
          </div>
        )}

        <div className="flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-48">
            <TextField
              label="Email"
              type="email"
              value={inviteEmail}
              onChange={setInviteEmail}
              placeholder="user@example.com"
              name="invite-email"
            />
            {inviteError && (
              <p
                className="mt-1 text-xs text-red-600 dark:text-red-400"
                data-testid="users-tab_invite-email-error"
              >
                {inviteError}
              </p>
            )}
          </div>

          <div className="flex-1 min-w-36">
            <TextField
              label="Display name (optional)"
              value={inviteDisplayName}
              onChange={setInviteDisplayName}
              placeholder="Full name"
              name="invite-displayname"
            />
          </div>

          <div className="w-40">
            <SelectField
              label="Role"
              value={inviteRole}
              onChange={(v) => setInviteRole(v as EStaffRole)}
              options={ROLE_OPTIONS}
              name="invite-role"
            />
          </div>

          <button
            type="submit"
            disabled={inviteLoading || !inviteEmail.trim()}
            data-testid="users-tab_invite-btn"
            className="flex items-center gap-1 px-4 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Plus className="w-4 h-4" aria-hidden="true" />
            {inviteLoading ? "Sending…" : "Invite"}
          </button>
        </div>
      </form>
    </div>
  );
}
