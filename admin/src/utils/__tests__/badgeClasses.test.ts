import { describe, it, expect } from "vitest";
import {
  stockBadgeClass,
  stockLabel,
  categoryBadgeClass,
  categoryLabel,
  recurringText,
  formatPrice,
} from "../badgeClasses";
import { EProductCategory } from "../../types";

describe("stockBadgeClass", () => {
  it("returns green classes when inStock is true", () => {
    expect(stockBadgeClass(true)).toBe(
      "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300",
    );
  });

  it("returns red classes when inStock is false", () => {
    expect(stockBadgeClass(false)).toBe(
      "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300",
    );
  });
});

describe("stockLabel", () => {
  it('returns "In Stock" when true', () => {
    expect(stockLabel(true)).toBe("In Stock");
  });

  it('returns "Out of Stock" when false', () => {
    expect(stockLabel(false)).toBe("Out of Stock");
  });
});

describe("categoryBadgeClass", () => {
  it("returns blue classes for SUBSCRIPTIONS", () => {
    expect(categoryBadgeClass(EProductCategory.SUBSCRIPTIONS)).toBe(
      "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
    );
  });

  it("returns primary classes for non-subscription categories", () => {
    expect(categoryBadgeClass(EProductCategory.HONEY)).toBe(
      "bg-primary-50 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300",
    );
    expect(categoryBadgeClass(EProductCategory.BEESWAX)).toBe(
      "bg-primary-50 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300",
    );
    expect(categoryBadgeClass(EProductCategory.GIFTS)).toBe(
      "bg-primary-50 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300",
    );
  });

  it("returns primary classes for unknown categories", () => {
    expect(categoryBadgeClass("UNKNOWN")).toBe(
      "bg-primary-50 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300",
    );
  });
});

describe("categoryLabel", () => {
  it('returns "Subscription" for SUBSCRIPTIONS', () => {
    expect(categoryLabel(EProductCategory.SUBSCRIPTIONS)).toBe("Subscription");
  });

  it("returns the category string itself for others", () => {
    expect(categoryLabel(EProductCategory.HONEY)).toBe("HONEY");
    expect(categoryLabel(EProductCategory.BEESWAX)).toBe("BEESWAX");
    expect(categoryLabel(EProductCategory.GIFTS)).toBe("GIFTS");
  });

  it("returns arbitrary string for unknown categories", () => {
    expect(categoryLabel("UNKNOWN")).toBe("UNKNOWN");
  });
});

describe("recurringText", () => {
  it("returns empty string when interval is undefined", () => {
    expect(recurringText(undefined)).toBe("");
  });

  it("returns empty string when interval is nullish", () => {
    expect(recurringText(undefined, undefined)).toBe("");
  });

  it("returns singular format when count is 1", () => {
    expect(recurringText("month", 1)).toBe("every 1 month");
  });

  it("returns plural format when count > 1", () => {
    expect(recurringText("month", 3)).toBe("every 3 months");
  });

  it("defaults count to 1 when not provided", () => {
    expect(recurringText("month")).toBe("every 1 month");
  });

  it("handles day intervals", () => {
    expect(recurringText("day", 7)).toBe("every 7 days");
  });

  it("handles week intervals", () => {
    expect(recurringText("week", 2)).toBe("every 2 weeks");
  });

  it("handles year intervals", () => {
    expect(recurringText("year", 1)).toBe("every 1 year");
  });
});

describe("formatPrice", () => {
  it("formats cents to dollars", () => {
    expect(formatPrice(1000)).toBe("$10.00");
  });

  it("handles zero", () => {
    expect(formatPrice(0)).toBe("$0.00");
  });

  it("handles small amounts", () => {
    expect(formatPrice(50)).toBe("$0.50");
  });

  it("handles large amounts", () => {
    expect(formatPrice(99999)).toBe("$999.99");
  });
});
