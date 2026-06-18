import { describe, it, expect } from "vitest";
import {
  DEFAULT_PRODUCT_IMAGE,
  DEFAULT_PRODUCT_THUMBNAIL,
  CATEGORIES,
  DEFAULT_SITE,
  DEFAULT_PROCESS,
  DEFAULT_CATEGORIES,
  DEFAULT_TESTIMONIALS,
} from "../constants";

describe("constants", () => {
  it("DEFAULT_PRODUCT_IMAGE is a data URI SVG", () => {
    expect(DEFAULT_PRODUCT_IMAGE).toContain("data:image/svg+xml");
    expect(DEFAULT_PRODUCT_IMAGE).toContain("<svg");
  });

  it("DEFAULT_PRODUCT_THUMBNAIL is a data URI SVG", () => {
    expect(DEFAULT_PRODUCT_THUMBNAIL).toContain("data:image/svg+xml");
    expect(DEFAULT_PRODUCT_THUMBNAIL).toContain("<svg");
  });

  it("CATEGORIES has 4 entries with correct ids", () => {
    expect(CATEGORIES).toHaveLength(4);
    expect(CATEGORIES.map((c) => c.id)).toEqual([
      "HONEY",
      "BEESWAX",
      "GIFTS",
      "SUBSCRIPTIONS",
    ]);
  });

  it("DEFAULT_SITE has required fields", () => {
    expect(DEFAULT_SITE.businessName).toBe("Bee Epic Apiary");
    expect(DEFAULT_SITE.email).toBe("hello@beeepicapiary.com");
    expect(DEFAULT_SITE.phone).toBe("(510) 555-APIARY");
    expect(DEFAULT_SITE.navLinks).toHaveLength(6);
    expect(DEFAULT_SITE.socialLinks.instagram).toBe(
      "https://instagram.com/beeepicapiary",
    );
    expect(DEFAULT_SITE.socialLinks.facebook).toBe(
      "https://facebook.com/beeepicapiary",
    );
    expect(DEFAULT_SITE.socialLinks.etsy).toBe(
      "https://etsy.com/shop/beeepicapiary",
    );
    expect(DEFAULT_SITE.aboutText).toHaveLength(3);
    expect(DEFAULT_SITE.stripePublishableKey).toBe("");
    expect(DEFAULT_SITE.formspreeFormId).toBe("");
  });

  it("DEFAULT_PROCESS has 5 steps", () => {
    expect(DEFAULT_PROCESS).toHaveLength(5);
    expect(DEFAULT_PROCESS[0].step).toBe(1);
    expect(DEFAULT_PROCESS[0].title).toBe("The Hive");
    expect(DEFAULT_PROCESS[4].step).toBe(5);
    expect(DEFAULT_PROCESS[4].title).toBe("Harvest");
  });

  it("DEFAULT_CATEGORIES matches CATEGORIES", () => {
    expect(DEFAULT_CATEGORIES).toEqual(CATEGORIES);
  });

  it("DEFAULT_TESTIMONIALS has 5 entries", () => {
    expect(DEFAULT_TESTIMONIALS).toHaveLength(5);
    expect(DEFAULT_TESTIMONIALS[0].name).toBe("Jennifer Walker");
    expect(DEFAULT_TESTIMONIALS[0].rating).toBe(5);
  });
});
