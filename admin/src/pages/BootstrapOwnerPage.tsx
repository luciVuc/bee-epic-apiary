import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { api, ApiError, apiErrorMessage } from "../utils/api";

/**
 * Full-viewport centered first-run OWNER bootstrap form (Task 10.5).
 *
 * Mounted OUTSIDE `RequireCaller` by `App.tsx` (Task 10.11) and routed under
 * the `<BootstrapGuard>` — this page is only reachable when the server has
 * signalled `bootstrapAvailable: true` on the `/whoami` probe (i.e. no OWNER
 * exists yet). The user submits the email address that should own the admin
 * console; the server dispatches an OWNER-invite email; the recipient then
 * follows the invite link into `AcceptInvitePage` where the password is set.
 *
 * There is no auto-redirect on success — the user reads the "check your
 * email" confirmation and closes the tab (their next visit will be through
 * the emailed invite link). Do not paraphrase the success copy: the parent
 * spec asserts the string as a regression check.
 *
 * `BOOTSTRAP_DISABLED` is a special-case race: another admin bootstrapped
 * the OWNER between the guard letting us in and the form submitting. In
 * that case we swap the form for a "sign in instead" alert containing a
 * link to /login rather than a generic error — the next page load will
 * flip `bootstrapAvailable` to false and the guard will redirect on its
 * own, but the alert gives a clean UX for the in-flight tab.
 */
export function BootstrapOwnerPage() {
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [bootstrapDisabled, setBootstrapDisabled] = useState(false);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (submitting) return;

    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) return;

    setError(null);
    setBootstrapDisabled(false);
    try {
      setSubmitting(true);
      await api.bootstrapOwner({ email: normalizedEmail });
      setSubmitted(true);
    } catch (err: unknown) {
      if (
        err instanceof ApiError &&
        err.apiError.code === "BOOTSTRAP_DISABLED"
      ) {
        setBootstrapDisabled(true);
      } else {
        setError(apiErrorMessage(err, "Failed to send setup link."));
      }
    } finally {
      setSubmitting(false);
    }
  }

  const showSuccess = submitted && !bootstrapDisabled;

  return (
    <div className="min-h-screen flex items-center justify-center bg-dark-50 p-4">
      <div className="w-full max-w-sm bg-white rounded-lg shadow-md p-6 flex flex-col gap-4">
        <h1 className="text-xl font-semibold text-dark-900">
          Set up your admin account
        </h1>

        {showSuccess ? (
          <>
            <div
              role="status"
              data-testid="bootstrap-owner_success"
              className="rounded-md border border-green-300 bg-green-50 px-3 py-2 text-sm text-green-800"
            >
              Check your email for the setup link. If you don&apos;t see it
              within a few minutes, check spam or ask your hosting provider
              about email delivery.
            </div>
            <Link
              to="/login"
              className="text-sm text-amber-600 hover:text-amber-700 hover:underline self-start"
            >
              Back to sign in
            </Link>
          </>
        ) : bootstrapDisabled ? (
          <>
            <div
              role="alert"
              data-testid="bootstrap-owner_error"
              className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700 flex flex-col gap-2"
            >
              <p>
                The initial owner has already been claimed. Please sign in
                instead.
              </p>
              <Link
                to="/login"
                className="text-amber-600 hover:text-amber-700 hover:underline self-start"
              >
                Go to sign in
              </Link>
            </div>
          </>
        ) : (
          <>
            <p className="text-sm text-dark-700">
              No owner account exists yet. Enter the email address that should
              own this admin console.
            </p>

            <form
              onSubmit={handleSubmit}
              className="flex flex-col gap-4"
              noValidate={false}
              data-testid="bootstrap-owner_form"
              aria-label="Create owner account"
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
                  data-testid="bootstrap-owner_email-input"
                  aria-invalid={error ? true : undefined}
                  aria-describedby={error ? "bootstrap-owner_error" : undefined}
                  className="w-full rounded-md border border-dark-300 px-3 py-2 text-dark-900 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
                />
              </div>

              <button
                type="submit"
                disabled={submitting}
                data-testid="bootstrap-owner_submit"
                className="w-full rounded-md bg-amber-500 py-2 px-4 text-white font-medium hover:bg-amber-600 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:ring-offset-2 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                Send setup link
              </button>
            </form>

            {error && (
              <div
                role="alert"
                id="bootstrap-owner_error"
                data-testid="bootstrap-owner_error"
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
