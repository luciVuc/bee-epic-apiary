import { describe, it, expect } from "vitest";
import { EmailFormatSchema } from "../email";
import { SiteContentSchema } from "../settings";

/**
 * EmailFormat is reused across multiple shapes (Site settings, transactional
 * email helpers). These tests pin the canonical schema so removing or
 * renaming one variant — even by accident — fails at the test layer instead
 * of slipping through into a tenant who suddenly can't pick "markdown".
 */

describe("EmailFormatSchema", () => {
  it("accepts text / markdown / html", () => {
    expect(EmailFormatSchema.parse("text")).toBe("text");
    expect(EmailFormatSchema.parse("markdown")).toBe("markdown");
    expect(EmailFormatSchema.parse("html")).toBe("html");
  });

  it("rejects anything else", () => {
    expect(() => EmailFormatSchema.parse("plain")).toThrow();
    expect(() => EmailFormatSchema.parse("HTML")).toThrow();
    expect(() => EmailFormatSchema.parse(null)).toThrow();
  });

  it("is the same set used by SiteContentSchema.emailFormat", () => {
    // SiteContent must accept every documented EmailFormat value, and reject
    // anything outside. This proves the settings schema isn't drifting.
    for (const v of ["text", "markdown", "html"] as const) {
      const r = SiteContentSchema.partial().parse({ emailFormat: v });
      expect(r.emailFormat).toBe(v);
    }
    expect(() =>
      SiteContentSchema.partial().parse({ emailFormat: "plain" }),
    ).toThrow();
  });
});
