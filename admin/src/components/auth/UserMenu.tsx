import { useCallback, useEffect, useRef, useState } from "react";
import { useDispatch } from "react-redux";
import { useNavigate } from "react-router-dom";
import { ChevronDown, User } from "lucide-react";
import { useCaller } from "../../hooks/useCaller";
import { useAuthActions } from "../../hooks/useAuthActions";
import { api, apiErrorMessage } from "../../utils/api";
import { fetchCaller } from "../../store/authSlice";
import type { AppDispatch } from "../../store";
import { ChangePasswordModal } from "./ChangePasswordModal";

/**
 * Interactive user chip for AdminNavbar (Task 10.13). Replaces the
 * pre-Phase-10 read-only badge with a dropdown that exposes the three
 * self-service actions the spec calls out:
 *
 *   1. Edit name       — inline edit → `api.updateMe`, then
 *                        `dispatch(fetchCaller())` to refresh Redux with
 *                        the new displayName (whoami is the single source
 *                        of truth; we don't hand-patch the slice).
 *   2. Change password — opens `ChangePasswordModal` (self-contained;
 *                        controls its own submit / policy / errors).
 *   3. Log out         — `useAuthActions().logout()` then
 *                        `navigate('/login')`. NOT `replace: true` — the
 *                        user came from an authenticated page and we want
 *                        the back button to still work.
 *
 * Keyboard / dismissal:
 *   - Escape closes the menu (and cancels an in-progress edit before it
 *     closes the menu, so the first Escape doesn't destroy typed input);
 *   - a document-level `mousedown` listener closes the menu on outside
 *     clicks so it behaves like a native dropdown.
 *
 * Naming fallback: `caller.displayName ?? caller.email` — the spec keeps
 * the email visible as the ultimate identifier when no display name has
 * been set yet (freshly-invited users).
 */
export function UserMenu() {
  const { caller } = useCaller();
  const { logout } = useAuthActions();
  const dispatch = useDispatch<AppDispatch>();
  const navigate = useNavigate();

  const [isOpen, setIsOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const initialName = caller?.displayName ?? caller?.email ?? "";
  const [editValue, setEditValue] = useState(initialName);
  const [editError, setEditError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const menuRef = useRef<HTMLDivElement | null>(null);

  const closeMenu = useCallback(() => {
    setIsOpen(false);
    setIsEditing(false);
    setEditError(null);
  }, []);

  // Outside-click dismissal. Bound only while the menu is open so we don't
  // pay the listener cost on every AdminNavbar render — most sessions never
  // open the menu.
  useEffect(() => {
    if (!isOpen) return;
    function onDown(e: MouseEvent) {
      if (!menuRef.current) return;
      if (!menuRef.current.contains(e.target as Node)) {
        closeMenu();
      }
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [isOpen, closeMenu]);

  // Reset the edit buffer when caller changes (e.g. after a successful
  // updateMe → fetchCaller refresh) so the next Edit-name click starts
  // from the current name, not the stale one.
  useEffect(() => {
    setEditValue(caller?.displayName ?? caller?.email ?? "");
  }, [caller?.displayName, caller?.email]);

  function handleTriggerKey(e: React.KeyboardEvent<HTMLButtonElement>) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      setIsOpen((v) => !v);
    } else if (e.key === "Escape" && isOpen) {
      e.preventDefault();
      closeMenu();
    }
  }

  function handleContainerKey(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key === "Escape") {
      // If currently editing, cancel edit first — a second Escape closes
      // the menu. Matches native <select> ergonomics.
      if (isEditing) {
        setIsEditing(false);
        setEditError(null);
        setEditValue(caller?.displayName ?? caller?.email ?? "");
      } else {
        closeMenu();
      }
    }
  }

  async function handleSave() {
    if (saving) return;
    const trimmed = editValue.trim();
    if (!trimmed) {
      setEditError("Name cannot be empty.");
      return;
    }
    try {
      setSaving(true);
      setEditError(null);
      await api.updateMe({ displayName: trimmed });
      // Refresh Redux from the server so every consumer of `useCaller`
      // sees the new displayName without us hand-patching the slice.
      dispatch(fetchCaller());
      setIsEditing(false);
    } catch (err: unknown) {
      setEditError(apiErrorMessage(err, "Failed to update name."));
    } finally {
      setSaving(false);
    }
  }

  function handleCancel() {
    setIsEditing(false);
    setEditError(null);
    setEditValue(caller?.displayName ?? caller?.email ?? "");
  }

  function handleEditClick() {
    setIsEditing(true);
    setEditValue(caller?.displayName ?? caller?.email ?? "");
    setEditError(null);
  }

  function handleChangePasswordClick() {
    setIsOpen(false);
    setIsModalOpen(true);
  }

  async function handleLogoutClick() {
    try {
      await logout();
    } catch {
      // logout() slice-side never rejects the promise (rejected branch
      // still clears caller). Nothing to do here — swallow so navigation
      // still happens.
    }
    navigate("/login");
  }

  const displayLabel = caller?.displayName ?? caller?.email ?? "Admin";

  return (
    <>
      <div
        ref={menuRef}
        data-testid="user-menu"
        className="relative"
        onKeyDown={handleContainerKey}
      >
        <button
          type="button"
          data-testid="user-menu_trigger"
          aria-haspopup="menu"
          aria-expanded={isOpen}
          onClick={() => setIsOpen((v) => !v)}
          onKeyDown={handleTriggerKey}
          className="flex items-center gap-2 px-3 py-2 bg-gray-100 dark:bg-dark-200 rounded-lg hover:bg-gray-200 dark:hover:bg-dark-300 focus:outline-none focus:ring-2 focus:ring-amber-500"
        >
          <User
            data-testid="user-menu_icon"
            className="w-5 h-5 text-dark-600"
            aria-hidden="true"
          />
          <span
            className="text-sm font-medium text-dark-700 dark:text-dark-300 hidden md:block truncate max-w-[160px]"
            title={caller?.email}
          >
            {displayLabel}
          </span>
          {caller?.role && (
            <span
              data-testid="user-menu_role"
              className="hidden md:inline text-xs font-semibold px-1.5 py-0.5 rounded bg-primary-100 text-primary-700 dark:bg-primary-900/40 dark:text-primary-300"
            >
              {caller.role}
            </span>
          )}
          <ChevronDown className="w-4 h-4 text-dark-600" aria-hidden="true" />
        </button>

        {isOpen && (
          <ul
            role="menu"
            data-testid="user-menu_dropdown"
            className="absolute right-0 mt-2 w-64 bg-white dark:bg-dark-950 border border-gray-200 dark:border-dark-700 rounded-lg shadow-lg z-40 py-1"
          >
            <li role="none" className="px-2">
              {isEditing ? (
                <div className="flex flex-col gap-1 py-2">
                  <input
                    type="text"
                    data-testid="user-menu_edit-input"
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    disabled={saving}
                    aria-label="Display name"
                    className="w-full rounded-md border border-dark-300 px-2 py-1 text-sm text-dark-900 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500 disabled:bg-dark-100"
                  />
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      data-testid="user-menu_edit-save"
                      onClick={handleSave}
                      disabled={saving}
                      className="flex-1 rounded-md bg-amber-500 py-1 px-2 text-xs text-white font-medium hover:bg-amber-600 disabled:opacity-60"
                    >
                      Save
                    </button>
                    <button
                      type="button"
                      data-testid="user-menu_edit-cancel"
                      onClick={handleCancel}
                      disabled={saving}
                      className="rounded-md border border-dark-300 py-1 px-2 text-xs text-dark-700 hover:bg-dark-100"
                    >
                      Cancel
                    </button>
                  </div>
                  {editError && (
                    <p
                      role="alert"
                      data-testid="user-menu_edit-error"
                      className="text-xs text-red-600"
                    >
                      {editError}
                    </p>
                  )}
                </div>
              ) : (
                <button
                  type="button"
                  role="menuitem"
                  data-testid="user-menu_edit-name"
                  onClick={handleEditClick}
                  className="w-full text-left px-2 py-2 text-sm text-dark-700 dark:text-dark-300 hover:bg-gray-100 dark:hover:bg-dark-200 rounded"
                >
                  Edit name
                </button>
              )}
            </li>

            <li role="none" className="px-2">
              <button
                type="button"
                role="menuitem"
                data-testid="user-menu_change-password"
                onClick={handleChangePasswordClick}
                className="w-full text-left px-2 py-2 text-sm text-dark-700 dark:text-dark-300 hover:bg-gray-100 dark:hover:bg-dark-200 rounded"
              >
                Change password
              </button>
            </li>

            <li
              role="separator"
              aria-orientation="horizontal"
              className="my-1 border-t border-gray-200 dark:border-dark-700"
            />

            <li role="none" className="px-2">
              <button
                type="button"
                role="menuitem"
                data-testid="user-menu_logout"
                onClick={handleLogoutClick}
                className="w-full text-left px-2 py-2 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded"
              >
                Log out
              </button>
            </li>
          </ul>
        )}
      </div>

      {isModalOpen && (
        <ChangePasswordModal onClose={() => setIsModalOpen(false)} />
      )}
    </>
  );
}
