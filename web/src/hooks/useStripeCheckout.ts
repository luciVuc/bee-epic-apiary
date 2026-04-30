import { useState, useCallback } from "react";
import type { IProduct, ICartItem } from "../types";
import { GITHUB_PAGES_BASE } from "../utils/constants";

interface IUseStripeCheckoutReturn {
  isProcessing: boolean;
  error: string | null;
  checkout: (items: ICartItem[]) => Promise<void>;
  clearError: () => void;
}

const isSubscriptionProduct = (product: IProduct): boolean => {
  return product.category?.toUpperCase() === "SUBSCRIPTIONS";
};

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
      const hasSubscriptions = items.some((item) =>
        isSubscriptionProduct(item.product),
      );
      const hasRegularProducts = items.some(
        (item) => !isSubscriptionProduct(item.product),
      );

      if (hasSubscriptions && hasRegularProducts) {
        setError(
          "Cannot mix subscription and regular products. Please checkout separately.",
        );
        setIsProcessing(false);
        return;
      }

      if (hasSubscriptions) {
        const paymentLinkIds = items
          .filter((item) => isSubscriptionProduct(item.product))
          .map((item) => item.product.stripePaymentLinkId)
          .filter((id): id is string => !!id && !id.includes("REPLACE"));

        if (paymentLinkIds.length === 0) {
          setError(
            "No valid subscription for checkout. Please contact support.",
          );
          setIsProcessing(false);
          return;
        }

        const paymentLinkId = paymentLinkIds[0];
        const url = `https://buy.stripe.com/${paymentLinkId}?prefilled_email=`;
        window.location.href = url;
        return;
      }

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

      const lineItems = validItems.map((item) => ({
        price: item.product.stripePriceId,
        quantity: item.quantity,
      }));

      const response = await fetch(
        import.meta.env.VITE_STRIPE_WORKER_URL + "/create-checkout",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            lineItems,
            successUrl: `${window.location.origin}${GITHUB_PAGES_BASE}#/success?session_id={CHECKOUT_SESSION_ID}`,
            cancelUrl: `${window.location.origin}${GITHUB_PAGES_BASE}#/cancel?session=cancelled`,
          }),
        },
      );

      const { url, error: serverError } = await response.json();

      if (serverError) {
        setError(serverError || "Payment failed. Please try again.");
        setIsProcessing(false);
        return;
      }

      window.location.href = url;
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
