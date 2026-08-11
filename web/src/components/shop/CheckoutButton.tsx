import { Button } from "../ui/Button";
import { useStripeCheckout } from "../../hooks/useStripeCheckout";
import { useCart } from "../../hooks/useCart";
import { ShoppingCart } from "lucide-react";

interface ICheckoutButtonProps {
  className?: string;
}

/** Standalone "Proceed to Checkout" button that checks out the current cart; disabled when empty and shows errors inline. */
export const CheckoutButton = ({ className = "" }: ICheckoutButtonProps) => {
  const { items } = useCart();
  const { checkout, isProcessing, error } = useStripeCheckout();

  const handleCheckout = async () => {
    await checkout(items);
  };

  return (
    <div data-testid="checkout-button" className={className}>
      <Button
        data-testid="checkout-button_btn"
        onClick={handleCheckout}
        isLoading={isProcessing}
        disabled={items.length === 0}
        size="lg"
        className="w-full"
        aria-label={
          items.length === 0 ? "Cart is empty" : "Proceed to checkout"
        }
      >
        <ShoppingCart className="w-5 h-5 mr-2" aria-hidden="true" />
        Proceed to Checkout
      </Button>

      {error && (
        <p
          className="mt-2 font-body text-sm text-red-600 dark:text-red-400"
          role="alert"
        >
          {error}
        </p>
      )}
    </div>
  );
};
