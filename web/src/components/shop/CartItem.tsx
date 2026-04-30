import { motion } from "framer-motion";
import { Plus, Minus, Trash2 } from "lucide-react";
import { useCart } from "../../hooks/useCart";
import { formatPrice } from "../../utils/formatters";
import type { ICartItem } from "../../types";

interface ICartItemProps {
  item: ICartItem;
}

export const CartItem = ({ item }: ICartItemProps) => {
  const { update, remove } = useCart();
  const { product, quantity } = item;

  return (
    <motion.div
      className="flex items-center gap-4 py-4 border-b border-dark-100"
      layout
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 20 }}
    >
      <div className="w-16 h-16 bg-primary-50 rounded-lg flex items-center justify-center flex-shrink-0">
        <span className="text-2xl">🍯</span>
      </div>

      <div className="flex-1 min-w-0">
        <h4 className="font-heading text-sm font-semibold text-dark-900 truncate">
          {product.name}
        </h4>
        <p className="font-body text-xs text-dark-500">{product.weight}</p>
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={() => update(product.id, quantity - 1)}
          className="p-1 hover:bg-dark-100 rounded transition-colors"
          aria-label="Decrease quantity"
        >
          <Minus className="w-4 h-4 text-dark-600" />
        </button>
        <span className="font-body text-sm text-dark-900 w-6 text-center">
          {quantity}
        </span>
        <button
          onClick={() => update(product.id, quantity + 1)}
          className="p-1 hover:bg-dark-100 rounded transition-colors"
          aria-label="Increase quantity"
        >
          <Plus className="w-4 h-4 text-dark-600" />
        </button>
      </div>

      <div className="w-20 text-right">
        <span className="font-body text-sm font-semibold text-dark-900">
          {formatPrice(product.price * quantity)}
        </span>
      </div>

      <button
        onClick={() => remove(product.id)}
        className="p-2 hover:bg-red-50 rounded-lg transition-colors"
        aria-label={`Remove ${product.name} from cart`}
      >
        <Trash2 className="w-4 h-4 text-red-500" />
      </button>
    </motion.div>
  );
};
