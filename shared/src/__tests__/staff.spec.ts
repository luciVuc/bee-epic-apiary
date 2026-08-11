import { describe, it, expect } from "vitest";
import { EStaffRole, StaffRoleSchema } from "../staff";

describe("EStaffRole (post-refactor)", () => {
  it("contains OWNER, MANAGER, EMPLOYEE, VENDOR", () => {
    expect(EStaffRole.OWNER).toBe("OWNER");
    expect(EStaffRole.MANAGER).toBe("MANAGER");
    expect(EStaffRole.EMPLOYEE).toBe("EMPLOYEE");
    expect(EStaffRole.VENDOR).toBe("VENDOR");
  });

  it("does NOT expose FULFILLMENT (renamed to EMPLOYEE)", () => {
    expect((EStaffRole as Record<string, string>).FULFILLMENT).toBeUndefined();
  });

  it("StaffRoleSchema accepts all four roles", () => {
    expect(StaffRoleSchema.parse("OWNER")).toBe("OWNER");
    expect(StaffRoleSchema.parse("MANAGER")).toBe("MANAGER");
    expect(StaffRoleSchema.parse("EMPLOYEE")).toBe("EMPLOYEE");
    expect(StaffRoleSchema.parse("VENDOR")).toBe("VENDOR");
  });

  it("StaffRoleSchema rejects FULFILLMENT", () => {
    expect(() => StaffRoleSchema.parse("FULFILLMENT")).toThrow();
  });
});
