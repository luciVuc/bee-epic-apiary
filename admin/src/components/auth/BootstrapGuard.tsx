import type { ReactNode } from "react";
import { useEffect } from "react";
import { useDispatch, useSelector } from "react-redux";
import { Navigate, useLocation } from "react-router-dom";
import type { AppDispatch, RootState } from "../../store";
import { fetchCaller } from "../../store/authSlice";

/**
 * Route guard that keeps `/login` and `/bootstrap` mutually exclusive
 * (Task 10.5).
 *
 * The server's `/whoami` probe (Task 9.5) returns `bootstrapAvailable: true`
 * exactly when no OWNER exists in the users table. This slice field is thus
 * the single source of truth for "which anonymous surface should the user
 * see": if bootstrap is available the SPA must expose `/bootstrap`; if it
 * isn't (either an OWNER already exists, or the user is authenticated) the
 * SPA must expose `/login`.
 *
 * The guard is deliberately dumb about routing intent — it only reads the
 * current pathname to decide the redirect direction, never inspects other
 * state. App.tsx (Task 10.11) wraps BOTH the `/login` route and the
 * `/bootstrap` route with this same component, so the mutual-exclusion
 * enforcement is symmetric.
 *
 * On first mount, `bootstrapAvailable` is `null` (unknown). We dispatch
 * `fetchCaller()` to populate it and render a spinner until the probe
 * resolves — otherwise a first-load flash of the wrong page would be
 * disorienting for the OWNER doing the initial setup.
 */
export function BootstrapGuard({ children }: { children: ReactNode }) {
  const dispatch = useDispatch<AppDispatch>();
  const bootstrapAvailable = useSelector(
    (s: RootState) => s.auth.bootstrapAvailable,
  );
  const status = useSelector((s: RootState) => s.auth.status);
  const location = useLocation();
  const path = location.pathname;

  useEffect(() => {
    if (bootstrapAvailable === null && status === "idle") {
      dispatch(fetchCaller());
    }
  }, [dispatch, bootstrapAvailable, status]);

  // While the initial probe is inflight/unfinished, render a spinner so we
  // don't briefly flash either page before we know which one belongs here.
  if (
    bootstrapAvailable === null &&
    (status === "idle" || status === "loading")
  ) {
    return (
      <div
        data-testid="bootstrap-guard_loading"
        role="status"
        aria-live="polite"
        className="flex items-center justify-center min-h-screen text-dark-500"
      >
        <span className="sr-only">Checking bootstrap state…</span>
        <span aria-hidden="true">Loading…</span>
      </div>
    );
  }

  if (path === "/bootstrap" && bootstrapAvailable === false) {
    return <Navigate to="/login" replace />;
  }
  if (path === "/login" && bootstrapAvailable === true) {
    return <Navigate to="/bootstrap" replace />;
  }
  return <>{children}</>;
}
