import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { api, apiErrorMessage } from "../utils/api";

/**
 * Full-viewport centered "forgot your password?" form.
 *
 * Mounted OUTSIDE `RequireCaller` by `App.tsx` (Task 10.11) — this page is
 * public. It POSTs `/auth/request-reset` and the server ALWAYS returns 200,
 * regardless of whether the email exists in the users table. That uniform
 * response is a deliberate anti-enumeration measure: an attacker probing
 * emails cannot tell "reset email queued" from "no such user".
 *
 * To preserve that guarantee end-to-end the UI must render the SAME success
 * copy in both cases — hence the single generic message below. Do NOT alter
 * or paraphrase it without re-checking the threat model.
 *
 * No Redux, no auto-redirect. The user reads the confirmation and clicks the
 * "Back to sign in" link when they're ready.
 */
export function RequestResetPage() {
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (submitting) return;

    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) return;

    setError(null);
    try {
      setSubmitting(true);
      await api.requestReset({ email: normalizedEmail });
      setSubmitted(true);
    } catch (err: unknown) {
      setError(apiErrorMessage(err, "Request failed. Please try again."));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-dark-50 p-4">
      <div className="w-full max-w-sm bg-white rounded-lg shadow-md p-6 flex flex-col gap-4">
        <h1 className="text-xl font-semibold text-dark-900">
          Reset your password
        </h1>

        {submitted ? (
          <>
            <div
              role="status"
              data-testid="request-reset_success"
              className="rounded-md border border-green-300 bg-green-50 px-3 py-2 text-sm text-green-800"
            >
              If an account with that email exists, we've sent a reset link.
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
              data-testid="request-reset_form"
              aria-label="Reset your password"
            >
              <div className="flex flex-col gap-1">
                <label
                  htmlFor="email"
                  className="text-sm font-medium text-dark-700"
                >
                  Email
                </label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  required
                  autoFocus
                  autoComplete="username"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  data-testid="request-reset_email-input"
                  aria-invalid={error ? true : undefined}
                  aria-describedby={error ? "request-reset_error" : undefined}
                  className="w-full rounded-md border border-dark-300 px-3 py-2 text-dark-900 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
                />
              </div>

              <button
                type="submit"
                disabled={submitting}
                data-testid="request-reset_submit"
                className="w-full rounded-md bg-amber-500 py-2 px-4 text-white font-medium hover:bg-amber-600 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:ring-offset-2 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                Send reset link
              </button>
            </form>

            {error && (
              <div
                role="alert"
                id="request-reset_error"
                data-testid="request-reset_error"
                className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700"
              >
                {error}
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
