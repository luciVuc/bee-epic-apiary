import { motion, AnimatePresence } from "framer-motion";
import { X, ShoppingBag } from "lucide-react";
import { Button } from "../ui/Button";
import { CartItem } from "./CartItem";
import { useCart } from "../../hooks/useCart";
import { useStripeCheckout } from "../../hooks/useStripeCheckout";
import { formatPrice } from "../../utils/formatters";

export const CartDrawer = () => {
  const { items, totalItems, subtotal, isCartOpen, close } = useCart();
  const { checkout, isProcessing, error } = useStripeCheckout();

  const handleCheckout = async () => {
    await checkout(items);
  };

  return (
    <AnimatePresence>
      {isCartOpen && (
        <>
          <motion.div
            data-testid="cart-drawer_overlay"
            className="fixed inset-0 bg-black/50 z-50"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={close}
            aria-hidden="true"
          />

          <motion.div
            data-testid="cart-drawer"
            className="fixed top-0 right-0 h-full w-full max-w-md bg-white dark:bg-dark-950 shadow-xl z-50 flex flex-col"
            role="dialog"
            aria-modal="true"
            aria-labelledby="cart-drawer_title"
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", damping: 25, stiffness: 200 }}
          >
            <div className="flex items-center justify-between p-4 border-b border-dark-100">
              <div className="flex items-center space-x-2">
                <ShoppingBag
                  className="w-5 h-5 text-primary-500"
                  aria-hidden="true"
                />
                <h2
                  id="cart-drawer_title"
                  className="font-heading text-lg font-semibold text-dark-900"
                >
                  Your Cart
                </h2>
                <span className="font-body text-sm text-dark-500">
                  ({totalItems})
                </span>
              </div>
              <button
                data-testid="cart-drawer_close-btn"
                onClick={close}
                className="p-2 hover:bg-dark-100 dark:hover:bg-dark-200 rounded-lg transition-colors"
                aria-label="Close cart"
                title="Close cart"
                autoFocus
              >
                <X className="w-5 h-5 text-dark-600" aria-hidden="true" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4">
              {items.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-center">
                  <ShoppingBag
                    className="w-16 h-16 text-dark-300 mb-4"
                    aria-hidden="true"
                  />
                  <p className="font-body text-lg text-dark-600 mb-2">
                    Your cart is empty
                  </p>
                  <p className="font-body text-sm text-dark-500 mb-6">
                    Add some honey to get started!
                  </p>
                  <Button onClick={close} variant="outline">
                    Continue Shopping
                  </Button>
                </div>
              ) : (
                <AnimatePresence>
                  {items.map((item) => (
                    <CartItem key={item.product.id} item={item} />
                  ))}
                </AnimatePresence>
              )}
            </div>

            {items.length > 0 && (
              <div className="border-t border-dark-100 p-4 space-y-4">
                <div className="flex items-center justify-between">
                  <span className="font-body text-dark-600">Subtotal</span>
                  <span className="font-heading text-xl font-bold text-dark-900">
                    {formatPrice(subtotal)}
                  </span>
                </div>

                {error && (
                  <p
                    className="font-body text-sm text-red-600 dark:text-red-400"
                    role="alert"
                  >
                    {error}
                  </p>
                )}

                <div className="p-3 bg-amber-50 dark:bg-amber-900/30 rounded-lg">
                  <p className="font-body text-xs text-amber-800 dark:text-amber-300">
                    Note: Stripe is in TEST MODE. Replace your Stripe keys in
                    .env for production.
                  </p>
                </div>

                <div className="space-y-2">
                  <Button
                    data-testid="cart-drawer_checkout-btn"
                    onClick={handleCheckout}
                    isLoading={isProcessing}
                    className="w-full"
                    size="lg"
                  >
                    Proceed to Checkout
                  </Button>
                  <Button onClick={close} variant="outline" className="w-full">
                    Continue Shopping
                  </Button>
                </div>
              </div>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};
