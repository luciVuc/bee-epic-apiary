import { EProductCategory } from "../types";

export function stockBadgeClass(inStock: boolean): string {
  return inStock ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700";
}

export function stockLabel(inStock: boolean): string {
  return inStock ? "In Stock" : "Out of Stock";
}

export function categoryBadgeClass(category: string): string {
  return category === EProductCategory.SUBSCRIPTIONS
    ? "bg-blue-100 text-blue-700"
    : "bg-primary-50 text-primary-700";
}

export function categoryLabel(category: string): string {
  return category === EProductCategory.SUBSCRIPTIONS
    ? "Subscription"
    : category;
}

export function recurringText(
  interval?: string,
  intervalCount?: number,
): string {
  if (!interval) return "";
  const count = intervalCount || 1;
  const suffix = count > 1 ? "s" : "";
  return `every ${count} ${interval}${suffix}`;
}

export function formatPrice(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}
