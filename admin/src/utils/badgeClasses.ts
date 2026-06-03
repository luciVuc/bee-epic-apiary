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

/** Returns Tailwind classes for order status badge */
export function orderStatusBadge(status: string): string {
  switch (status) {
    case "complete":
      return "bg-green-100 text-green-700";
    case "open":
      return "bg-blue-100 text-blue-700";
    case "expired":
      return "bg-red-100 text-red-700";
    default:
      return "bg-gray-100 text-gray-700";
  }
}

/** Returns human-readable order status label */
export function orderStatusLabel(status: string): string {
  switch (status) {
    case "complete":
      return "Completed";
    case "open":
      return "Open";
    case "expired":
      return "Expired";
    default:
      return status;
  }
}

/** Returns Tailwind classes for order payment status badge */
export function orderPaymentStatusBadge(status: string): string {
  switch (status) {
    case "paid":
      return "bg-green-100 text-green-700";
    case "unpaid":
      return "bg-yellow-100 text-yellow-700";
    case "no_payment_required":
      return "bg-gray-100 text-gray-700";
    default:
      return "bg-gray-100 text-gray-700";
  }
}

/** Returns human-readable order payment status label */
export function orderPaymentStatusLabel(status: string): string {
  switch (status) {
    case "paid":
      return "Paid";
    case "unpaid":
      return "Unpaid";
    case "no_payment_required":
      return "No Payment Required";
    default:
      return status;
  }
}

/** Returns Tailwind classes for order mode badge */
export function orderModeBadge(mode: string): string {
  switch (mode) {
    case "payment":
      return "bg-primary-50 text-primary-700";
    case "subscription":
      return "bg-purple-100 text-purple-700";
    case "setup":
      return "bg-gray-100 text-gray-700";
    default:
      return "bg-gray-100 text-gray-700";
  }
}

/** Returns human-readable order mode label */
export function orderModeLabel(mode: string): string {
  switch (mode) {
    case "payment":
      return "One-time";
    case "subscription":
      return "Subscription";
    case "setup":
      return "Setup";
    default:
      return mode;
  }
}

/** Returns Tailwind classes for order metadata status badge (new/pending/fulfilled) */
export function orderMetadataStatusBadge(status: string | null): string {
  switch (status) {
    case "new":
      return "bg-blue-100 text-blue-700";
    case "pending":
      return "bg-yellow-100 text-yellow-700";
    case "fulfilled":
      return "bg-green-100 text-green-700";
    default:
      return "bg-gray-100 text-gray-700";
  }
}

/** Returns human-readable order metadata status label */
export function orderMetadataStatusLabel(status: string | null): string {
  switch (status) {
    case "new":
      return "New";
    case "pending":
      return "Pending";
    case "fulfilled":
      return "Fulfilled";
    default:
      return status || "—";
  }
}

/** Truncates a Stripe session ID to show first 7 chars after the last underscore and last 7 chars with ... in between */
export function truncateOrderId(id: string): string {
  const underscoreIndex = id.lastIndexOf("_");
  const suffix = underscoreIndex >= 0 ? id.slice(underscoreIndex + 1) : id;
  if (suffix.length <= 10) return suffix;
  return `${suffix.slice(0, 5)}...${suffix.slice(-5)}`;
}

/** Formats a Unix timestamp to a readable date string (e.g. "Jan 15, 2026, 02:30 PM") */
export function formatDate(timestamp: number): string {
  return new Date(timestamp * 1000).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
