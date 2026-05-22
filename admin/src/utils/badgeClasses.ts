/** Helper utilities for rendering product badges and formatted text */
import { EProductCategory } from "../types";

/** Returns Tailwind classes for in-stock vs out-of-stock badge */
export function stockBadgeClass(inStock: boolean): string {
  return inStock ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700";
}

/** Returns human-readable stock label */
export function stockLabel(inStock: boolean): string {
  return inStock ? "In Stock" : "Out of Stock";
}

/** Returns Tailwind classes for category badge (subscription vs standard) */
export function categoryBadgeClass(category: string): string {
  return category === EProductCategory.SUBSCRIPTIONS
    ? "bg-blue-100 text-blue-700"
    : "bg-primary-50 text-primary-700";
}

/** Returns human-readable category label (subscription mapping) */
export function categoryLabel(category: string): string {
  return category === EProductCategory.SUBSCRIPTIONS
    ? "Subscription"
    : category;
}

/** Formats a recurring subscription interval string (e.g. "every 1 month") */
export function recurringText(
  interval?: string,
  intervalCount?: number,
): string {
  if (!interval) return "";
  const count = intervalCount || 1;
  const suffix = count > 1 ? "s" : "";
  return `every ${count} ${interval}${suffix}`;
}

/** Formats a price in cents to a USD string (e.g. 2500 -> "$25.00") */
export function formatPrice(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}
