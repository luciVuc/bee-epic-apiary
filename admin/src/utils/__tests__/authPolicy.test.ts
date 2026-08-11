/**
 * Tests for the client-side password-policy hint evaluator (Task 10.14).
 *
 * `evaluate` mirrors — client-side and non-authoritatively — the shape of
 * `services/src/auth/policy/validatePassword.ts`. The server remains the
 * source of truth; these hints exist so the user can see obvious failures
 * (length, denylist) before hitting submit.
 */
import { describe, it, expect } from "vitest";
import type { IAuthPolicy } from "@bee-epic/shared";
import { evaluate } from "../authPolicy";

const samplePolicy: IAuthPolicy = {
  schemaVersion: 1,
  minLength: 12,
  checkBreachCorpus: true,
  notifyOnPasswordChange: true,
  updatedAt: 0,
  updatedBy: "owner@test.com",
};

describe("evaluate (client-side password policy hints)", () => {
  it("empty password with null policy → length fails, denylist fails, no breach hint", () => {
    const hints = evaluate("", null);
    expect(hints).toHaveLength(2);
    expect(hints[0]).toEqual({ ok: false, label: "At least 12 characters" });
    expect(hints[1]).toEqual({
      ok: false,
      label: "Not a commonly-used password",
    });
  });

  it("password meeting default min-length and not in denylist → both hints pass; no breach hint (null policy)", () => {
    const hints = evaluate("correcthorsebatterystaple", null);
    expect(hints).toHaveLength(2);
    expect(hints[0]).toEqual({ ok: true, label: "At least 12 characters" });
    expect(hints[1]).toEqual({
      ok: true,
      label: "Not a commonly-used password",
    });
  });

  it("exact denylist entry → denylist hint fails", () => {
    // "password" is length 8, so length hint also fails against default 12;
    // the assertion here is specifically about the denylist hint.
    const hints = evaluate("password", null);
    const denylistHint = hints[1];
    expect(denylistHint.ok).toBe(false);
    expect(denylistHint.label).toBe("Not a commonly-used password");
  });

  it("uppercase denylist entry → denylist hint fails (case-insensitive)", () => {
    const hints = evaluate("PASSWORD", null);
    const denylistHint = hints[1];
    expect(denylistHint.ok).toBe(false);
    expect(denylistHint.label).toBe("Not a commonly-used password");
  });

  it("custom policy minLength=16 + checkBreachCorpus=true → length label reflects 16, breach hint present at index 2", () => {
    const policy: IAuthPolicy = { ...samplePolicy, minLength: 16 };
    const hints = evaluate("twelvecharsxx", policy); // 13 chars
    expect(hints).toHaveLength(3);
    expect(hints[0]).toEqual({ ok: false, label: "At least 16 characters" });
    expect(hints[1].ok).toBe(true); // not in denylist
    expect(hints[2]).toEqual({
      ok: true,
      label: "Server will check against breach corpus on submit",
    });
  });

  it("policy with checkBreachCorpus=false → breach-corpus hint absent", () => {
    const policy: IAuthPolicy = { ...samplePolicy, checkBreachCorpus: false };
    const hints = evaluate("longenoughpassword", policy);
    expect(hints).toHaveLength(2);
    expect(
      hints.find((h) => h.label.includes("breach corpus")),
    ).toBeUndefined();
  });
});
