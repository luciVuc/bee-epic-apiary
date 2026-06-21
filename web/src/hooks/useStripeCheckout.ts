import { useState, useCallback } from "react";
import { DEFAULT_API_URL } from "../utils/constants";
import type { ICartItem } from "../types";

interface IUseStripeCheckoutReturn {
  isProcessing: boolean;
  error: string | null;
  checkout: (items: ICartItem[]) => Promise<void>;
  clearError: () => void;
}

const API_BASE_URL = DEFAULT_API_URL;

export const useStripeCheckout = (): IUseStripeCheckoutReturn => {
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

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

      const data = await response.json();

      if (data.error) {
        setError(data.error || "Payment failed. Please try again.");
        setIsProcessing(false);
        return;
      }

      if (data.sessions && data.sessions.length > 0) {
        window.location.href = data.sessions[0];
      } else {
        setError("No checkout session returned. Please try again.");
        setIsProcessing(false);
      }
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
