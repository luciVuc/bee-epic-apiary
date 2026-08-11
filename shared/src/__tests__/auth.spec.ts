import { describe, it, expect } from "vitest";
import {
  EUserStatus,
  UserSchema,
  UserPublicSchema,
  toUserPublic,
  InviteSchema,
  PasswordResetSchema,
  RefreshFamilySchema,
  AuthPolicySchema,
  DEFAULT_AUTH_POLICY,
  AUTH_POLICY_MIN_LENGTH_FLOOR,
} from "../auth";
import { EStaffRole } from "../staff";

describe("IUser schema", () => {
  const validUser = {
    schemaVersion: 1,
    email: "owner@example.com",
    displayName: "Owner",
    role: EStaffRole.OWNER,
    status: EUserStatus.ACTIVE,
    passwordHash: "pbkdf2$sha256$600000$c2FsdA$aGFzaA",
    createdAt: 1000,
    updatedAt: 2000,
    lastLoginAt: 3000,
    lastLoginIp: "192.0.2.1",
  };

  it("accepts a valid user", () => {
    expect(UserSchema.parse(validUser)).toEqual(validUser);
  });

  it("accepts null passwordHash (INVITED state)", () => {
    const invited = {
      ...validUser,
      status: EUserStatus.INVITED,
      passwordHash: null,
    };
    expect(UserSchema.parse(invited)).toEqual(invited);
  });

  it("rejects empty email", () => {
    // schema does NOT normalize — repos do. Schema enforces shape only.
    expect(() => UserSchema.parse({ ...validUser, email: "" })).toThrow();
  });

  it("toUserPublic strips passwordHash", () => {
    const pub = toUserPublic(validUser);
    expect((pub as Record<string, unknown>).passwordHash).toBeUndefined();
    expect(UserPublicSchema.parse(pub)).toEqual(pub);
  });

  it("accepts mixed-case email (normalization is repo-layer, not schema)", () => {
    expect(() =>
      UserSchema.parse({ ...validUser, email: "Owner@Example.COM" }),
    ).not.toThrow();
  });

  it("accepts DISABLED status", () => {
    const disabled = { ...validUser, status: EUserStatus.DISABLED };
    expect(UserSchema.parse(disabled)).toEqual(disabled);
  });
});

describe("IInvite schema", () => {
  it("accepts a valid invite", () => {
    const invite = {
      schemaVersion: 1,
      token: "abc",
      email: "x@example.com",
      role: EStaffRole.MANAGER,
      invitedBy: "owner@example.com",
      createdAt: 100,
      expiresAt: 200,
    };
    expect(InviteSchema.parse(invite)).toEqual(invite);
  });

  it("accepts optional displayName when provided", () => {
    const invite = InviteSchema.parse({
      schemaVersion: 1,
      token: "abc",
      email: "x@example.com",
      role: EStaffRole.MANAGER,
      invitedBy: "owner@example.com",
      createdAt: 100,
      expiresAt: 200,
      displayName: "Alice",
    });
    expect(invite.displayName).toBe("Alice");
  });
});

describe("IPasswordReset schema", () => {
  it("accepts a valid reset record", () => {
    const reset = {
      schemaVersion: 1,
      token: "abc",
      email: "x@example.com",
      createdAt: 100,
      expiresAt: 200,
    };
    expect(PasswordResetSchema.parse(reset)).toEqual(reset);
  });
});

describe("IRefreshFamily schema", () => {
  it("accepts a valid family", () => {
    const fam = {
      schemaVersion: 1,
      familyId: "fid",
      email: "x@example.com",
      currentJti: "jti",
      createdAt: 1,
      lastRefreshedAt: 1,
      expiresAt: 2,
      userAgent: null,
      ip: null,
    };
    expect(RefreshFamilySchema.parse(fam)).toEqual(fam);
  });
});

describe("IAuthPolicy schema", () => {
  it("DEFAULT_AUTH_POLICY parses", () => {
    expect(AuthPolicySchema.parse(DEFAULT_AUTH_POLICY)).toEqual(
      DEFAULT_AUTH_POLICY,
    );
  });

  it("min length floor is 8", () => {
    expect(AUTH_POLICY_MIN_LENGTH_FLOOR).toBe(8);
  });

  it("rejects minLength below the floor", () => {
    expect(() =>
      AuthPolicySchema.parse({ ...DEFAULT_AUTH_POLICY, minLength: 7 }),
    ).toThrow();
  });
});
