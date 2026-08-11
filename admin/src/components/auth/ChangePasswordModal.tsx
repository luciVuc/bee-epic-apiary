import { useEffect, useState, type FormEvent } from "react";
import { X } from "lucide-react";
import type { IApiError, IAuthPolicy } from "@bee-epic/shared";
import { PasswordField } from "./PasswordField";
import { useAuthActions } from "../../hooks/useAuthActions";
import { api, apiErrorMessage } from "../../utils/api";

interface ChangePasswordModalProps {
  onClose: () => void;
}

/**
 * Self-contained modal that lets the current caller rotate their password
 * (Task 10.13). Contract mirrors AcceptInvitePage's policy-fetch pattern:
 *
 *  - Fetch `getAuthPolicy()` on mount so the "new password" field can render
 *    policy-driven hints; a fetch failure is non-fatal (PasswordField falls
 *    back to a default 12-char hint).
 *  - Client-side confirm-match: submit is aborted with "Passwords do not
 *    match." — we do not burn a server round-trip on a trivial typo.
 *  - Submit via `useAuthActions().changePassword`, which calls
 *    `dispatch(changePassword(...)).unwrap()`. Because the slice does
 *    `rejectWithValue(err.apiError)` on API failures, the caught value is
 *    the bare `IApiError` payload (NOT an `ApiError` instance) — key on
 *    `.code` directly.
 *  - Error mapping:
 *      • `INVALID_CREDENTIALS` → "Current password is incorrect."
 *        (kept intentionally distinct from the generic fallback so the user
 *        knows which field to fix).
 *      • `WEAK_PASSWORD` → render `reasons[]` as `<li>`s so each policy
 *        violation stands on its own line instead of being smushed into a
 *        comma sentence.
 *      • anything else → `apiErrorMessage()` with a fallback string.
 *  - On success: swap to a `role="status"` success panel with EXACT copy
 *    "Password updated. Other sessions have been logged out." (the server
 *    invalidates the caller's OTHER refresh-token family members — this UI
 *    copy has to match that observable behavior so admins know why their
 *    other tabs logged out). Auto-close after 2 seconds via setTimeout so
 *    the user has time to read the message but the modal doesn't linger.
 */
export function ChangePasswordModal({ onClose }: ChangePasswordModalProps) {
  const { changePassword } = useAuthActions();

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [policy, setPolicy] = useState<IAuthPolicy | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [weakReasons, setWeakReasons] = useState<string[] | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api
      .getAuthPolicy()
      .then((p) => {
        if (!cancelled) setPolicy(p);
      })
      .catch(() => {
        // Non-fatal — PasswordField renders a default hint when policy is null.
        if (!cancelled) setPolicy(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Auto-close 2 seconds after success. Runs only once because `success`
  // is a monotonic latch (never flips back to false).
  useEffect(() => {
    if (!success) return;
    const t = setTimeout(onClose, 2000);
    return () => clearTimeout(t);
  }, [success, onClose]);

  // Escape-to-close. `role="dialog" aria-modal="true"` sets the expectation
  // that Escape dismisses the modal. `stopPropagation()` prevents UserMenu's
  // container-level Escape handler from also firing if it were still mounted
  // (in practice UserMenu closes its dropdown before opening the modal, so
  // its container handler wouldn't run — belt and suspenders).
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose]);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (submitting) return;

    if (newPassword !== confirmPassword) {
      setError("Passwords do not match.");
      setWeakReasons(null);
      return;
    }

    try {
      setSubmitting(true);
      setError(null);
      setWeakReasons(null);
      await changePassword({ currentPassword, newPassword });
      setSuccess(true);
    } catch (err: unknown) {
      // The thunk rejected via rejectWithValue(err.apiError), so .unwrap()
      // throws the raw IApiError payload directly (NOT an ApiError). Detect
      // by shape.
      const apiErr: IApiError | null =
        err && typeof err === "object" && "code" in err
          ? (err as IApiError)
          : null;

      if (apiErr?.code === "INVALID_CREDENTIALS") {
        setError("Current password is incorrect.");
        setWeakReasons(null);
      } else if (apiErr?.code === "WEAK_PASSWORD") {
        const reasons = (apiErr as { reasons?: string[] }).reasons ?? [];
        setWeakReasons(reasons);
        setError(null);
      } else {
        setError(apiErrorMessage(err, "Failed to update password."));
        setWeakReasons(null);
      }
    } finally {
      setSubmitting(false);
    }
  }

  const headingId = "change-password_heading";

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={headingId}
      data-testid="change-password_modal"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
    >
      <div className="w-full max-w-sm bg-white dark:bg-dark-950 rounded-lg shadow-xl p-6 flex flex-col gap-4 relative">
        <button
          type="button"
          aria-label="Close"
          onClick={onClose}
          data-testid="change-password_close"
          className="absolute right-3 top-3 p-1 text-dark-500 hover:text-dark-700 focus:outline-none focus:ring-2 focus:ring-amber-500 rounded"
        >
          <X className="w-5 h-5" aria-hidden="true" />
        </button>

        <h2
          id={headingId}
          className="text-xl font-semibold text-dark-900 dark:text-dark-100"
        >
          Change password
        </h2>

        {success ? (
          <div
            role="status"
            data-testid="change-password_success"
            className="rounded-md border border-green-300 bg-green-50 px-3 py-2 text-sm text-green-700"
          >
            Password updated. Other sessions have been logged out.
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <PasswordField
              id="current-password"
              name="current-password"
              label="Current password"
              autoComplete="current-password"
              required
              autoFocus
              value={currentPassword}
              onChange={setCurrentPassword}
            />

            <PasswordField
              id="new-password"
              name="new-password"
              label="New password"
              autoComplete="new-password"
              required
              value={newPassword}
              onChange={setNewPassword}
              policy={policy}
            />

            <PasswordField
              id="confirm-password"
              name="confirm-password"
              label="Confirm new password"
              autoComplete="new-password"
              required
              value={confirmPassword}
              onChange={setConfirmPassword}
            />

            {(error || weakReasons) && (
              <div
                role="alert"
                data-testid="change-password_error"
                className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700"
              >
                {weakReasons ? (
                  <ul className="list-disc pl-5 flex flex-col gap-0.5">
                    {weakReasons.map((reason) => (
                      <li key={reason}>{reason}</li>
                    ))}
                  </ul>
                ) : (
                  error
                )}
              </div>
            )}

            <div className="flex items-center gap-2">
              <button
                type="submit"
                disabled={submitting}
                data-testid="change-password_submit"
                className="flex-1 rounded-md bg-amber-500 py-2 px-4 text-white font-medium hover:bg-amber-600 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:ring-offset-2 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                Update password
              </button>
              <button
                type="button"
                onClick={onClose}
                data-testid="change-password_cancel"
                className="rounded-md border border-dark-300 py-2 px-4 text-dark-700 font-medium hover:bg-dark-100 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:ring-offset-2"
              >
                Cancel
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
