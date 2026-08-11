import { z } from "zod";
import { StaffRoleSchema } from "./staff";

/**
 * Discriminated-union error shape for the services worker.
 *
 * Replaces the current ad-hoc `{ error: string }` payload. Each error variant
 * carries the exact context a client needs to react: `requiredRole` for 403s,
 * `retryAfter` for 429s, `fields` for validation failures, etc.
 *
 * The HTTP status code is implicit from the `code` (see `httpStatusForError`
 * in services/src/utils/jsonResponse.ts after Plan 2 phase A.2). The status
 * is set on the response, not duplicated in the body.
 *
 * Rollout (Phase A.2 of Plan 2): the worker emits BOTH the old `{ error }`
 * shape and the new envelope behind a feature flag, then flips the default
 * once admin + web are migrated.
 */

export const ApiErrorSchema = z.discriminatedUnion("code", [
  z.object({ code: z.literal("UNAUTHORIZED") }),
  z.object({ code: z.literal("FORBIDDEN"), requiredRole: StaffRoleSchema }),
  z.object({ code: z.literal("NOT_FOUND"), resource: z.string() }),
  z.object({
    code: z.literal("VALIDATION_FAILED"),
    fields: z.record(z.string(), z.string()),
  }),
  z.object({
    code: z.literal("RATE_LIMITED"),
    retryAfter: z.number().int().nonnegative(),
  }),
  z.object({
    code: z.literal("METHOD_NOT_ALLOWED"),
    allowed: z.array(z.string()),
  }),
  z.object({ code: z.literal("BAD_REQUEST"), message: z.string() }),
  z.object({ code: z.literal("INTERNAL") }),
  z.object({ code: z.literal("ACCOUNT_DISABLED") }),
  z.object({ code: z.literal("BOOTSTRAP_DISABLED") }),
  z.object({ code: z.literal("CANNOT_DELETE_LAST_OWNER") }),
  z.object({ code: z.literal("CANNOT_DELETE_SELF") }),
  z.object({ code: z.literal("CANNOT_DEMOTE_LAST_OWNER") }),
  z.object({ code: z.literal("CANNOT_DISABLE_SELF") }),
  z.object({ code: z.literal("EMAIL_MISMATCH") }),
  z.object({ code: z.literal("EXPIRED_TOKEN") }),
  z.object({
    code: z.literal("FORBIDDEN_WRITE_ROLE"),
    requiredRole: StaffRoleSchema.optional(),
  }),
  z.object({ code: z.literal("INVALID_CREDENTIALS") }),
  z.object({ code: z.literal("INVALID_EMAIL") }),
  z.object({ code: z.literal("INVALID_POLICY") }),
  z.object({ code: z.literal("INVALID_REFRESH") }),
  z.object({ code: z.literal("INVALID_ROLE") }),
  z.object({ code: z.literal("INVALID_TOKEN") }),
  z.object({ code: z.literal("NO_REFRESH") }),
  z.object({ code: z.literal("REUSED_REFRESH") }),
  z.object({ code: z.literal("USER_ALREADY_ACTIVE") }),
  z.object({ code: z.literal("USER_EXISTS") }),
  z.object({ code: z.literal("USER_NOT_FOUND") }),
  z.object({ code: z.literal("WEAK_PASSWORD"), reasons: z.array(z.string()) }),
]);
export type IApiError = z.infer<typeof ApiErrorSchema>;

/** Envelope wrapping every services response body. */
export type IApiResponse<T> =
  { ok: true; data: T } | { ok: false; error: IApiError };

/**
 * Runtime parser for `IApiResponse<T>`. Callers pass the inner data schema
 * (anything implementing `z.ZodType`) and get back a discriminated-union schema
 * that validates the full envelope.
 *
 * @example
 *   const ProductResponse = ApiResponseSchema(ProductSchema);
 *   const r = ProductResponse.parse(await res.json());
 *   if (r.ok) console.log(r.data.id);
 *   else console.error(r.error.code);
 */
export const ApiResponseSchema = <T extends z.ZodType>(data: T) =>
  z.discriminatedUnion("ok", [
    z.object({ ok: z.literal(true), data }),
    z.object({ ok: z.literal(false), error: ApiErrorSchema }),
  ]);

/**
 * Legacy error shape still emitted by services handlers as of the start of
 * Plan 2 (the pre-existing `{ error: string }`). Promoted to shared/ so
 * callers can pattern-match against both shapes during the Phase A.2 rollout.
 */
export const LegacyApiErrorSchema = z.object({ error: z.string() });
export type ILegacyApiError = z.infer<typeof LegacyApiErrorSchema>;

/**
 * Upstream / third-party error shape — Stripe, fetch failures, network errors
 * thrown by external services that the worker catches and rewraps. Carries
 * whatever shape the upstream library happened to throw, so every field is
 * optional.
 *
 * **NOT** the worker's `IApiError` envelope — that's the shape we *emit* to
 * our own clients, narrowed by `code`. This type is for the shape we *catch*
 * from somebody else's library before mapping it into our envelope.
 */
export interface IApiUpstreamError {
  status?: number;
  statusCode?: number;
  code?: string;
  message?: string;
  stack?: string;
  type?: string;
}

/** @deprecated Use {@link IApiUpstreamError}. Kept for one release cycle. */
export type IAPIResponseError = IApiUpstreamError;
