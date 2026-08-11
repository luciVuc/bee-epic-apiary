import { useState, type FormEvent } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useSelector } from "react-redux";
import { PasswordField } from "../components/auth/PasswordField";
import { useAuthActions } from "../hooks/useAuthActions";
import { apiErrorMessage, ApiError } from "../utils/api";
import type { RootState } from "../store";
import type { IApiError } from "@bee-epic/shared";

/**
 * Full-viewport centered sign-in form.
 *
 * Mounted OUTSIDE `RequireCaller` by `App.tsx` (Task 10.11) so unauthenticated
 * users can actually reach it. On success we bounce to
 * `location.state.from.pathname` (populated by `RequireCaller` when it
 * redirects) — falling back to `/dashboard` for direct visits.
 *
 * Error-mapping intentionally collapses `INVALID_CREDENTIALS` and
 * `ACCOUNT_DISABLED` to the same copy: the server distinguishes the two so it
 * can log the difference, but the client MUST NOT — leaking "this email exists
 * but is disabled" vs "no such user" enables account-enumeration attacks.
 *
 * `submitting` is read from `state.auth.loginInFlight` rather than local
 * `useState` so it matches the interceptor's view of the world (e.g. a
 * long-running refresh + retry cycle keeps the button disabled).
 */
export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { login } = useAuthActions();
  const submitting = useSelector((s: RootState) => s.auth.loginInFlight);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  /**
   * Map the structured `IApiError` code from a rejected login thunk to a
   * user-facing message. `INVALID_CREDENTIALS` and `ACCOUNT_DISABLED` share
   * copy to prevent user enumeration. Everything else falls through to the
   * shared `apiErrorMessage` helper (wrapped back in an `ApiError` so it
   * can pattern-match on `code`).
   */
  function messageFor(err: IApiError | undefined): string {
    if (!err || typeof err !== "object" || !("code" in err)) {
      return "Sign in failed";
    }
    switch (err.code) {
      case "INVALID_CREDENTIALS":
      case "ACCOUNT_DISABLED":
        return "Invalid email or password.";
      case "RATE_LIMITED":
        return "Too many attempts. Please try again in a few minutes.";
      default:
        return apiErrorMessage(new ApiError(err), "Sign in failed");
    }
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (submitting) return;

    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail || !password) return;

    setError(null);
    try {
      await login({ email: normalizedEmail, password });
      // Post-login: bounce to the location we came from (set by RequireCaller
      // when it redirected). Fall back to /dashboard for direct visits.
      const from = (location.state as { from?: { pathname?: string } } | null)
        ?.from?.pathname;
      navigate(from ?? "/dashboard", { replace: true });
    } catch (err: unknown) {
      // `useAuthActions.login` calls `.unwrap()`, so on `rejectWithValue(err.apiError)`
      // the thrown value IS the `IApiError` payload.
      setError(messageFor(err as IApiError));
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-dark-50 p-4">
      <div className="w-full max-w-sm bg-white rounded-lg shadow-md p-6 flex flex-col gap-4">
        <h1 className="text-xl font-semibold text-dark-900">
          Sign in to admin
        </h1>

        <form
          onSubmit={handleSubmit}
          className="flex flex-col gap-4"
          noValidate={false}
          data-testid="login_form"
          aria-label="Sign in"
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
              data-testid="login_email-input"
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? "login_error" : undefined}
              className="w-full rounded-md border border-dark-300 px-3 py-2 text-dark-900 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
            />
          </div>

          <PasswordField
            id="password"
            name="password"
            label="Password"
            autoComplete="current-password"
            required
            value={password}
            onChange={setPassword}
          />

          <button
            type="submit"
            disabled={submitting}
            data-testid="login_submit"
            className="w-full rounded-md bg-amber-500 py-2 px-4 text-white font-medium hover:bg-amber-600 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:ring-offset-2 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            Sign in
          </button>
        </form>

        {error && (
          <div
            role="alert"
            data-testid="login_error"
            className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700"
          >
            {error}
          </div>
        )}

        <Link
          to="/request-reset"
          className="text-sm text-amber-600 hover:text-amber-700 hover:underline self-start"
        >
          Forgot your password?
        </Link>
      </div>
    </div>
  );
}
