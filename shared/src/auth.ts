import { z } from "zod";
import { StaffRoleSchema } from "./staff";

/** User lifecycle status. INVITED has no password yet; DISABLED can't log in. */
export enum EUserStatus {
  INVITED = "INVITED",
  ACTIVE = "ACTIVE",
  DISABLED = "DISABLED",
}

export const UserStatusSchema = z.enum([
  EUserStatus.INVITED,
  EUserStatus.ACTIVE,
  EUserStatus.DISABLED,
]);

/**
 * Full user record stored in KV under `user:<email-lower>`. Email is the
 * natural key; lowercased on every write by the repo. `passwordHash` is
 * null while INVITED, populated when the invite is accepted.
 */
export const UserSchema = z.object({
  schemaVersion: z.literal(1),
  email: z.string().email(),
  displayName: z.string().min(1),
  role: StaffRoleSchema,
  status: UserStatusSchema,
  passwordHash: z.string().nullable(),
  createdAt: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative(),
  lastLoginAt: z.number().int().nonnegative().nullable(),
  lastLoginIp: z.string().nullable(),
});
export type IUser = z.infer<typeof UserSchema>;

/** Public shape — IUser minus passwordHash. Always strip server-side. */
export const UserPublicSchema = UserSchema.omit({ passwordHash: true });
export type IUserPublic = z.infer<typeof UserPublicSchema>;

/** Strip the password hash for client consumption. */
export function toUserPublic(user: IUser): IUserPublic {
  const { passwordHash: _unused, ...rest } = user;
  return rest;
}

/** Pending invite. Single-use; consumed by /auth/accept-invite. 7-day TTL. */
export const InviteSchema = z.object({
  schemaVersion: z.literal(1),
  token: z.string().min(1),
  email: z.string().email(),
  role: StaffRoleSchema,
  displayName: z.string().min(1).optional(),
  invitedBy: z.string().email(),
  createdAt: z.number().int().nonnegative(),
  expiresAt: z.number().int().nonnegative(),
});
export type IInvite = z.infer<typeof InviteSchema>;

export const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** Pending password reset. Single-use; consumed by /auth/complete-reset. 1-hour TTL. */
export const PasswordResetSchema = z.object({
  schemaVersion: z.literal(1),
  token: z.string().min(1),
  email: z.string().email(),
  createdAt: z.number().int().nonnegative(),
  expiresAt: z.number().int().nonnegative(),
});
export type IPasswordReset = z.infer<typeof PasswordResetSchema>;

export const RESET_TTL_MS = 60 * 60 * 1000;

/** Refresh-token family for rotation + replay detection. */
export const RefreshFamilySchema = z.object({
  schemaVersion: z.literal(1),
  familyId: z.string().min(1),
  email: z.string().email(),
  currentJti: z.string().min(1),
  createdAt: z.number().int().nonnegative(),
  lastRefreshedAt: z.number().int().nonnegative(),
  expiresAt: z.number().int().nonnegative(),
  userAgent: z.string().nullable(),
  ip: z.string().nullable(),
});
export type IRefreshFamily = z.infer<typeof RefreshFamilySchema>;

export const REFRESH_TTL_MS = 30 * 24 * 60 * 60 * 1000;
export const MAX_REFRESH_FAMILIES_PER_USER = 10;

/**
 * Access-token TTL (ephemeral JWT — never stored). Lives alongside refresh-family
 * constants because access tokens are issued during refresh, but it is not a
 * field of IRefreshFamily.
 */
export const ACCESS_TTL_MS = 60 * 60 * 1000;

/** Hard floor for minLength regardless of stored value. */
export const AUTH_POLICY_MIN_LENGTH_FLOOR = 8;

/** Owner-configurable password policy. */
export const AuthPolicySchema = z.object({
  schemaVersion: z.literal(1),
  minLength: z.number().int().min(AUTH_POLICY_MIN_LENGTH_FLOOR),
  checkBreachCorpus: z.boolean(),
  notifyOnPasswordChange: z.boolean(),
  updatedAt: z.number().int().nonnegative(),
  // updatedBy is an email because real callers writing the policy are
  // authenticated end-users. Synthetic writers (bootstrap, migrations) must
  // use a valid-shaped placeholder such as "system@bootstrap.local".
  updatedBy: z.string().email(),
});
export type IAuthPolicy = z.infer<typeof AuthPolicySchema>;

export const DEFAULT_AUTH_POLICY: IAuthPolicy = {
  schemaVersion: 1,
  minLength: 12,
  checkBreachCorpus: true,
  notifyOnPasswordChange: true,
  updatedAt: 0,
  updatedBy: "system@bootstrap.local",
};
