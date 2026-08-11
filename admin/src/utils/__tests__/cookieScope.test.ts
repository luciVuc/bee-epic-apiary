import { describe, it, expect } from "vitest";
import { sharesETldPlusOne } from "../cookieScope";

/**
 * Soft check used by api.ts to warn at boot when the configured `VITE_API_URL`
 * sits outside the cookie scope of the page that loads the admin bundle.
 * Cookie scope is per-eTLD+1; without that match, `CF_Authorization` won't
 * travel to the worker and auth will look mysteriously broken (review I1).
 *
 * This is NOT a real Public Suffix List check — it's an approximation that
 * catches the cases the team is actually likely to misconfigure (apex vs
 * subdomain, completely different domain). Localhost is treated as same-host
 * because dev never serves cross-origin cookies anyway.
 */
describe("sharesETldPlusOne", () => {
  it("returns true for identical hosts", () => {
    expect(sharesETldPlusOne("admin.example.com", "admin.example.com")).toBe(
      true,
    );
  });

  it("returns true for sibling subdomains of the same apex", () => {
    expect(sharesETldPlusOne("api.example.com", "admin.example.com")).toBe(
      true,
    );
  });

  it("returns true for apex vs subdomain", () => {
    expect(sharesETldPlusOne("api.example.com", "example.com")).toBe(true);
  });

  it("returns false for unrelated domains", () => {
    expect(sharesETldPlusOne("api.other.com", "admin.example.com")).toBe(false);
  });

  it("rejects suffix-match false-positives like evilexample.com vs example.com", () => {
    // pageHost.endsWith(apiHost) would say true here; the helper must NOT.
    expect(sharesETldPlusOne("example.com", "evilexample.com")).toBe(false);
  });

  it("treats localhost as matching itself", () => {
    expect(sharesETldPlusOne("localhost", "localhost")).toBe(true);
  });

  it("treats two different localhost-style hostnames as matching", () => {
    // Dev never serves cookies cross-origin, so we don't fight about it.
    expect(sharesETldPlusOne("localhost", "127.0.0.1")).toBe(true);
  });
});
