import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { PasswordField } from "../components/auth/PasswordField";
import { api, ApiError, apiErrorMessage } from "../utils/api";
import type { IApiError, IAuthPolicy } from "@bee-epic/shared";

/**
 * Full-viewport centered "set a new password" form (Task 10.4).
 *
 * Reached from an emailed link of the form
 * `https://admin.example.com/complete-reset?token=<opaque>`. Mounted OUTSIDE
 * `RequireCaller` by `App.tsx` — the point of this page is to sign the caller
 * IN with a freshly-rotated password.
 *
 * Structurally a near-clone of `AcceptInvitePage`: same policy fetch, same
 * two-field form with client-side confirm-match, same error taxonomy. The
 * differences are all copy plus the post-success destination:
 *
 *  - Success navigates to `/dashboard?reset=complete` (NOT plain
 *    `/dashboard`). The `?reset=complete` flag is a one-shot signal for a
 *    future banner on DashboardPage — the `/auth/complete-reset` server
 *    handler invalidates every OTHER refresh-token family for this user, so
 *    all their other browsers / devices have been signed out, and the UI
 *    should tell them so. No toast primitive exists in this SPA today
 *    (`grep -rn "toast" src` finds only the unrelated order-notification
 *    stream), and per the Phase 10 spec we use a query-string flag rather
 *    than introducing one. The flag is a single ASCII `key=value` pair so
 *    URL-encoding isn't needed.
 *  - `INVALID_TOKEN` / `EXPIRED_TOKEN` map to a reset-flavoured copy that
 *    points the user back to the sign-in page (where they can hit "Forgot
 *    password?" again).
 *  - Fallback copy is "Failed to reset password.".
 *
 * The rendering of the banner itself is intentionally NOT part of this
 * task's scope; DashboardPage will read `?reset=complete` when it's next
 * touched. This page's only job is to put the flag in the URL.
 */
export function CompleteResetPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get("token");

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [policy, setPolicy] = useState<IAuthPolicy | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [weakReasons, setWeakReasons] = useState<string[] | null>(null);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    api
      .getAuthPolicy()
      .then((p) => {
        if (!cancelled) setPolicy(p);
      })
      .catch(() => {
        // Non-fatal: PasswordField renders a default 12-char hint when
        // policy stays null.
        if (!cancelled) setPolicy(null);
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (submitting) return;
    if (!token) return; // defensive; the no-token branch renders no form

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      setWeakReasons(null);
      return;
    }

    try {
      setSubmitting(true);
      setError(null);
      setWeakReasons(null);
      await api.completeReset({ token, password });
      // The query flag lets DashboardPage render a one-time banner
      // informing the user that "all other sessions were logged out",
      // matching the /auth/complete-reset server contract.
      navigate("/dashboard?reset=complete", { replace: true });
    } catch (err: unknown) {
      const apiErr: IApiError | undefined =
        err instanceof ApiError ? err.apiError : undefined;

      if (
        apiErr?.code === "INVALID_TOKEN" ||
        apiErr?.code === "EXPIRED_TOKEN"
      ) {
        setError(
          "This password-reset link is invalid or has expired. Request a new one from the sign-in page.",
        );
        setWeakReasons(null);
      } else if (apiErr?.code === "WEAK_PASSWORD") {
        const reasons = (apiErr as { reasons?: string[] }).reasons ?? [];
        setWeakReasons(reasons);
        setError(null);
      } else {
        setError(apiErrorMessage(err, "Failed to reset password."));
        setWeakReasons(null);
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-dark-50 p-4">
      <div className="w-full max-w-sm bg-white rounded-lg shadow-md p-6 flex flex-col gap-4">
        <h1 className="text-xl font-semibold text-dark-900">
          Set a new password
        </h1>

        {!token ? (
          <>
            <div
              role="alert"
              data-testid="complete-reset_no-token"
              className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700"
            >
              This password-reset link is invalid.
            </div>
            <Link
              to="/login"
              className="text-sm text-amber-600 hover:text-amber-700 hover:underline self-start"
            >
              Back to sign in
            </Link>
          </>
        ) : (
          <>
            <form
              onSubmit={handleSubmit}
              className="flex flex-col gap-4"
              noValidate={false}
              data-testid="complete-reset_form"
              aria-label="Set a new password"
            >
              <PasswordField
                id="new-password"
                name="new-password"
                label="New password"
                autoComplete="new-password"
                required
                value={password}
                onChange={setPassword}
                policy={policy}
              />

              <PasswordField
                id="confirm-password"
                name="confirm-password"
                label="Confirm password"
                autoComplete="new-password"
                required
                value={confirmPassword}
                onChange={setConfirmPassword}
              />

              <button
                type="submit"
                disabled={submitting}
                data-testid="complete-reset_submit"
                className="w-full rounded-md bg-amber-500 py-2 px-4 text-white font-medium hover:bg-amber-600 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:ring-offset-2 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                Update password
              </button>
            </form>

            {(error || weakReasons) && (
              <div
                role="alert"
                data-testid="complete-reset_error"
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

            <Link
              to="/login"
              className="text-sm text-amber-600 hover:text-amber-700 hover:underline self-start"
            >
              Back to sign in
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
