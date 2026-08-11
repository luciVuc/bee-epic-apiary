import { describe, it, expect } from "vitest";
import { z } from "zod";
import { ApiResponseSchema, ApiErrorSchema } from "../api";

/**
 * Runtime validation for the worker's response envelope (review Important #3).
 *
 * `IApiResponse<T>` was a compile-time-only type until now. Anything reading a
 * response body (admin's React Query loaders, web's storefront fetches) had to
 * cast and hope. `ApiResponseSchema(T)` returns a runtime parser shaped as
 * `{ ok: true, data: T } | { ok: false, error: IApiError }`.
 */

const ProductLike = z.object({ id: z.string(), name: z.string() });

describe("ApiResponseSchema", () => {
  const schema = ApiResponseSchema(ProductLike);

  it("accepts { ok: true, data: T }", () => {
    const r = schema.parse({ ok: true, data: { id: "p_1", name: "Honey" } });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data).toEqual({ id: "p_1", name: "Honey" });
  });

  it("accepts { ok: false, error: IApiError } with a known error code", () => {
    const r = schema.parse({ ok: false, error: { code: "UNAUTHORIZED" } });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("UNAUTHORIZED");
  });

  it("rejects ok:true with no data", () => {
    expect(() => schema.parse({ ok: true })).toThrow();
  });

  it("rejects ok:false with a data field instead of error", () => {
    expect(() =>
      schema.parse({ ok: false, data: { id: "x", name: "y" } }),
    ).toThrow();
  });

  it("rejects ok:true with the wrong T shape", () => {
    expect(() =>
      schema.parse({ ok: true, data: { id: 123, name: "Honey" } }),
    ).toThrow();
  });

  it("rejects an unknown error code", () => {
    expect(() =>
      schema.parse({ ok: false, error: { code: "MADE_UP_CODE" } }),
    ).toThrow();
  });

  it("works with primitive data types", () => {
    const stringSchema = ApiResponseSchema(z.string());
    const r = stringSchema.parse({ ok: true, data: "hello" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data).toBe("hello");
  });

  it("ApiErrorSchema parses every documented variant", () => {
    expect(ApiErrorSchema.parse({ code: "UNAUTHORIZED" }).code).toBe(
      "UNAUTHORIZED",
    );
    expect(
      ApiErrorSchema.parse({ code: "NOT_FOUND", resource: "product:p_1" }).code,
    ).toBe("NOT_FOUND");
    expect(
      ApiErrorSchema.parse({
        code: "VALIDATION_FAILED",
        fields: { name: "required" },
      }).code,
    ).toBe("VALIDATION_FAILED");
    expect(
      ApiErrorSchema.parse({ code: "RATE_LIMITED", retryAfter: 30 }).code,
    ).toBe("RATE_LIMITED");
  });
});

describe("IApiError (auth refactor additions)", () => {
  const codes = [
    "ACCOUNT_DISABLED",
    "BOOTSTRAP_DISABLED",
    "CANNOT_DELETE_LAST_OWNER",
    "CANNOT_DELETE_SELF",
    "CANNOT_DEMOTE_LAST_OWNER",
    "CANNOT_DISABLE_SELF",
    "EMAIL_MISMATCH",
    "EXPIRED_TOKEN",
    "FORBIDDEN_WRITE_ROLE",
    "INVALID_CREDENTIALS",
    "INVALID_EMAIL",
    "INVALID_POLICY",
    "INVALID_REFRESH",
    "INVALID_ROLE",
    "INVALID_TOKEN",
    "NO_REFRESH",
    "REUSED_REFRESH",
    "USER_ALREADY_ACTIVE",
    "USER_EXISTS",
    "USER_NOT_FOUND",
  ] as const;

  it.each(codes)("accepts %s with no payload", (code) => {
    expect(ApiErrorSchema.parse({ code })).toEqual({ code });
  });

  it("WEAK_PASSWORD carries reasons array", () => {
    expect(
      ApiErrorSchema.parse({ code: "WEAK_PASSWORD", reasons: ["too_short"] }),
    ).toEqual({ code: "WEAK_PASSWORD", reasons: ["too_short"] });
  });
});
