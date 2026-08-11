import { useState, useCallback } from "react";
import { DEFAULT_API_URL } from "../utils/constants";
import type { ICartItem } from "../types";

/** Return shape of {@link useStripeCheckout}: request state plus the checkout trigger and error reset. */
interface IUseStripeCheckoutReturn {
  isProcessing: boolean;
  error: string | null;
  checkout: (items: ICartItem[]) => Promise<void>;
  clearError: () => void;
}

const API_BASE_URL = DEFAULT_API_URL;

/**
 * Drives the Stripe Checkout flow. `checkout(items)` filters out items with
 * missing/placeholder price IDs, POSTs the line items to the services worker's
 * `/checkout` endpoint, and redirects the browser to the returned session URL.
 * Surfaces validation, empty-cart, and mixed subscription/one-time errors via
 * `error`, and tracks the in-flight request through `isProcessing`.
 */
export const useStripeCheckout = (): IUseStripeCheckoutReturn => {
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  // The empty deps array on `checkout` (below) is intentional:
  //   - setError/setIsProcessing are stable from useState
  //   - API_BASE_URL is a module-level constant
  // With eslint-plugin-react-hooks/exhaustive-deps now enabled, this also
  // serves as a regression check — adding an unstable closure here would
  // light up the linter immediately.
  const checkout = useCallback(async (items: ICartItem[]) => {
    if (items.length === 0) {
      setError("Your cart is empty");
      return;
    }

    setIsProcessing(true);
    setError(null);

    try {
      const validItems = items.filter((item) => {
        const priceId = item.product.stripePriceId;
        return (
          priceId &&
          !priceId.includes("REPLACE") &&
          !priceId.includes("_REPLACE") &&
          priceId.startsWith("price_") &&
          item.quantity > 0
        );
      });

      if (validItems.length === 0) {
        setError("No valid products for checkout. Please contact support.");
        setIsProcessing(false);
        return;
      }

      const line_items = validItems.map((item) => ({
        price: item.product.stripePriceId,
        quantity: item.quantity,
      }));

      const success_url = `${window.location.origin}/success`;
      const cancel_url = `${window.location.origin}/cancel`;

      const response = await fetch(`${API_BASE_URL}/checkout`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          line_items,
          success_url,
          cancel_url,
        }),
      });

      const envelope = (await response.json()) as
        | { ok: true; data: { sessions: string[]; message: string } }
        | {
            ok: false;
            error: {
              code: string;
              message?: string;
              fields?: Record<string, string>;
            };
          };

      if (!response.ok || !envelope.ok) {
        const errorObj = !envelope.ok ? envelope.error : null;
        const message = errorObj
          ? (errorObj.message ??
            (errorObj.fields
              ? Object.values(errorObj.fields).join(", ")
              : `Payment failed (${errorObj.code}). Please try again.`))
          : "Payment failed. Please try again.";
        setError(message);
        setIsProcessing(false);
        return;
      }

      const { sessions } = envelope.data;
      if (!sessions || sessions.length === 0) {
        setError("No checkout session returned. Please try again.");
        setIsProcessing(false);
        return;
      }
      if (sessions.length > 1) {
        // Mixed carts (subscription + one-time) yield two sessions; we don't
        // support that flow yet — see review finding #2.
        setError(
          "Your cart mixes subscription and one-time items. Please check out each type separately.",
        );
        setIsProcessing(false);
        return;
      }
      window.location.href = sessions[0];
    } catch (err) {
      setError("An unexpected error occurred. Please try again.");
      console.error("Checkout error:", err);
    } finally {
      setIsProcessing(false);
    }
  }, []);

  return {
    isProcessing,
    error,
    checkout,
    clearError,
  };
};
