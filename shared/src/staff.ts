import { z } from "zod";

/**
 * Staff role enum. Rank order (highest privilege first):
 *   OWNER > MANAGER > EMPLOYEE > VENDOR
 *
 * - OWNER: manage everything including users + auth policy
 * - MANAGER: manage products, prices, content settings
 * - EMPLOYEE: read everything, write orders only (formerly FULFILLMENT)
 * - VENDOR: read-only across the surface
 */
export enum EStaffRole {
  OWNER = "OWNER",
  MANAGER = "MANAGER",
  EMPLOYEE = "EMPLOYEE",
  VENDOR = "VENDOR",
}

export const StaffRoleSchema = z.enum([
  EStaffRole.OWNER,
  EStaffRole.MANAGER,
  EStaffRole.EMPLOYEE,
  EStaffRole.VENDOR,
]);

/**
 * Numeric rank of each role. Higher rank == more privilege.
 * OWNER = 3, MANAGER = 2, EMPLOYEE = 1, VENDOR = 0.
 */
export const STAFF_ROLE_RANK: Readonly<Record<EStaffRole, number>> = {
  [EStaffRole.OWNER]: 3,
  [EStaffRole.MANAGER]: 2,
  [EStaffRole.EMPLOYEE]: 1,
  [EStaffRole.VENDOR]: 0,
};

/**
 * Returns true if `actual` role satisfies the `required` role
 * (higher rank satisfies lower). OWNER satisfies everything;
 * VENDOR satisfies only VENDOR.
 */
export function roleSatisfies(
  actual: EStaffRole,
  required: EStaffRole,
): boolean {
  return STAFF_ROLE_RANK[actual] >= STAFF_ROLE_RANK[required];
}
