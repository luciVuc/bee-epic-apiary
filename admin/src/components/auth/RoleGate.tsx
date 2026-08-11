import type { ReactNode, ReactElement } from "react";
import { EStaffRole, EUserStatus, roleSatisfies } from "@bee-epic/shared";
import { useCaller } from "../../hooks/useCaller";

export interface IRoleGateProps {
  /** Minimum role required to see children. Uses the ordering
   *  OWNER > MANAGER > EMPLOYEE > VENDOR (from EStaffRole). */
  minRole: EStaffRole;
  /** Rendered when the caller does not meet minRole. Default: `null`. */
  fallback?: ReactNode;
  children: ReactNode;
}

/**
 * UX-only conditional render gate based on caller role.
 *
 * The server (`services/src/utils/resolveCaller.ts` + `services/src/auth/`) is the real security boundary — this
 * component only decides whether to render children. It never authorizes
 * anything.
 *
 * Renders `children` when:
 *   - caller is non-null
 *   - caller.status is not DISABLED
 *   - caller.role satisfies minRole (OWNER > MANAGER > EMPLOYEE > VENDOR)
 *
 * Renders `fallback` (default: null) in all other cases.
 *
 * Note: the DISABLED check is forward-compatible defense, not a live gate —
 * the server's `/whoami` envelope does not populate `caller.status` today, so
 * the branch is unreachable in practice. It costs nothing and activates
 * automatically if the server ever mirrors status onto the caller. Real
 * enforcement is server-side: a DISABLED user cannot hold a valid cookie past
 * the 1h refresh window regardless of what this component renders.
 */
export function RoleGate({
  minRole,
  fallback = null,
  children,
}: IRoleGateProps): ReactElement {
  const { caller } = useCaller();

  // No authenticated caller — render fallback.
  if (caller == null) {
    return <>{fallback}</>;
  }

  // Stale / disabled account — treat as unauthorized regardless of role.
  // Unreachable today (server omits status); forward-compatible only. See JSDoc.
  if (caller.status === EUserStatus.DISABLED) {
    return <>{fallback}</>;
  }

  // Role does not meet the minimum threshold — render fallback.
  if (!roleSatisfies(caller.role, minRole)) {
    return <>{fallback}</>;
  }

  return <>{children}</>;
}
