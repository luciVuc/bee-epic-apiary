import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useCaller } from "../../hooks/useCaller";

/**
 * Client-side auth gate — Post-Phase-9 version.
 *
 * The server (see `services/src/utils/resolveCaller.ts`) is the real security
 * boundary — this component is UX only:
 *
 *  1. Loading placeholder while the whoami probe is in flight (prevents the
 *     admin layout from firing product/orders fetches that would just 401).
 *  2. Retry alert on a JWKS / whoami transient failure.
 *  3. Redirect to `/login` when the probe confirms the caller is null;
 *     preserves the current location in `state.from` so LoginPage can bounce
 *     the user back after successful auth.
 *
 * Children mount only after `caller` is populated.
 */
export function RequireCaller({ children }: { children: ReactNode }) {
  const { caller, status, refetch } = useCaller();
  const location = useLocation();

  if (status === "idle" || status === "loading") {
    return (
      <div
        data-testid="require-caller_loading"
        role="status"
        aria-live="polite"
        className="flex items-center justify-center min-h-screen text-dark-500"
      >
        <span className="sr-only">Verifying access…</span>
        <span aria-hidden="true">Verifying access…</span>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div
        data-testid="require-caller_error"
        role="alert"
        className="flex flex-col items-center justify-center min-h-screen gap-3 p-6 text-center"
      >
        <p>Could not verify your access.</p>
        <button
          type="button"
          onClick={refetch}
          className="px-4 py-2 rounded-md bg-amber-500 text-white hover:bg-amber-600"
        >
          Retry
        </button>
      </div>
    );
  }

  if (!caller) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  return <>{children}</>;
}
