import { Button } from "../ui/Button";
import { useStripeCheckout } from "../../hooks/useStripeCheckout";
import { useCart } from "../../hooks/useCart";
import { ShoppingCart } from "lucide-react";

interface ICheckoutButtonProps {
  showDevNote?: boolean;
  className?: string;
}

export const CheckoutButton = ({
  showDevNote = true,
  className = "",
}: ICheckoutButtonProps) => {
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

      {showDevNote && (
        <div className="mt-3 p-3 bg-amber-50 rounded-lg">
          <p className="font-body text-xs text-amber-800">
            Note: Stripe is in TEST MODE. Replace your Stripe publishable key in
            .env for production.
          </p>
        </div>
      )}

      {error && (
        <p className="mt-2 font-body text-sm text-red-600" role="alert">
          {error}
        </p>
      )}
    </div>
  );
};
