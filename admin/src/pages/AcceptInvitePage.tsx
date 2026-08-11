import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { PasswordField } from "../components/auth/PasswordField";
import { api, ApiError, apiErrorMessage } from "../utils/api";
import type { IApiError, IAuthPolicy } from "@bee-epic/shared";

/**
 * Full-viewport centered "accept invitation" form (Task 10.2).
 *
 * Reached from an emailed link of the form
 * `https://admin.example.com/accept-invite?token=<opaque>`. Mounted OUTSIDE
 * `RequireCaller` by `App.tsx` — the point of this page is to sign the caller
 * IN for the first time.
 *
 * Flow:
 *  1. Extract `?token`. If missing, render an invalid-link alert and DO NOT
 *     call the API. The user only reaches this page from a link they clicked;
 *     a missing token means the link was mangled.
 *  2. On mount (with a token), fetch the active auth policy so
 *     `PasswordField` can render the correct min-length hint. A policy fetch
 *     failure is non-fatal — the field falls back to a default 12-char hint.
 *  3. On submit: client-side check that the two passwords match (do NOT hit
 *     the API for a trivially-catchable typo), then POST
 *     `/auth/accept-invite`. Server sets `bea_at` / `bea_rt` cookies on
 *     success; we bounce to `/dashboard`.
 *
 * Error mapping:
 *  - `INVALID_TOKEN` / `EXPIRED_TOKEN` → shared "link invalid or expired"
 *    copy. The two are collapsed on purpose: a user who let their invite
 *    lapse and a user who tampered with the URL both need the same next
 *    step (ask an admin for a fresh invite), and we don't want to leak
 *    which situation applies.
 *  - `WEAK_PASSWORD` → render each server-supplied reason as its own
 *    `<li>`. Kept separate from the string `error` state so the UI can
 *    render a proper list rather than a smushed comma-joined sentence.
 *  - anything else → generic `apiErrorMessage()` fallback.
 *
 * The catch handler pattern-matches on `err.apiError.code` because
 * `api.acceptInvite` uses `unwrap()`, which throws `new ApiError(error)` —
 * the caught value is the `ApiError` instance, not the bare envelope.
 */
export function AcceptInvitePage() {
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
      await api.acceptInvite({ token, password });
      navigate("/dashboard", { replace: true });
    } catch (err: unknown) {
      // `unwrap()` throws `new ApiError(responseData.error)`, so on server
      // rejections we get an `ApiError`. Fall through to the plain-Error
      // branch for transport-level failures (network, aborted, etc.).
      const apiErr: IApiError | undefined =
        err instanceof ApiError ? err.apiError : undefined;

      if (
        apiErr?.code === "INVALID_TOKEN" ||
        apiErr?.code === "EXPIRED_TOKEN"
      ) {
        setError(
          "This invitation link is invalid or has expired. Ask your administrator to send a new one.",
        );
        setWeakReasons(null);
      } else if (apiErr?.code === "WEAK_PASSWORD") {
        const reasons = (apiErr as { reasons?: string[] }).reasons ?? [];
        setWeakReasons(reasons);
        setError(null);
      } else {
        setError(apiErrorMessage(err, "Failed to accept invitation."));
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
          Accept invitation
        </h1>

        {!token ? (
          <>
            <div
              role="alert"
              data-testid="accept-invite_no-token"
              className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700"
            >
              This invitation link is invalid.
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
              data-testid="accept-invite_form"
              aria-label="Accept invitation"
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
                data-testid="accept-invite_submit"
                className="w-full rounded-md bg-amber-500 py-2 px-4 text-white font-medium hover:bg-amber-600 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:ring-offset-2 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                Accept invitation
              </button>
            </form>

            {(error || weakReasons) && (
              <div
                role="alert"
                data-testid="accept-invite_error"
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
