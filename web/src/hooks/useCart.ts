import { useSelector, useDispatch } from "react-redux";
import type { RootState, AppDispatch } from "../store";
import {
  addToCart,
  removeFromCart,
  updateQuantity,
  clearCart,
} from "../store/cartSlice";
import { openCart, closeCart } from "../store/uiSlice";
import type { IProduct } from "../types";
import { useCallback } from "react";

export const useCart = () => {
  const dispatch = useDispatch<AppDispatch>();
  const items = useSelector((state: RootState) => state.cart.items);
  const isCartOpen = useSelector((state: RootState) => state.ui.isCartOpen);

  const totalItems = items.reduce((sum, item) => sum + item.quantity, 0);

  const subtotal = items.reduce(
    (sum, item) => sum + item.product.price * item.quantity,
    0,
  );

  const add = useCallback(
    (product: IProduct, quantity: number = 1) => {
      dispatch(addToCart({ product, quantity }));
    },
    [dispatch],
  );

  const remove = useCallback(
    (productId: string) => {
      dispatch(removeFromCart(productId));
    },
    [dispatch],
  );

  const update = useCallback(
    (productId: string, quantity: number) => {
      dispatch(updateQuantity({ id: productId, quantity }));
    },
    [dispatch],
  );

  const clear = useCallback(() => {
    dispatch(clearCart());
  }, [dispatch]);

  const open = useCallback(() => {
    dispatch(openCart());
  }, [dispatch]);

  const close = useCallback(() => {
    dispatch(closeCart());
  }, [dispatch]);

  return {
    items,
    totalItems,
    subtotal,
    isCartOpen,
    add,
    remove,
    update,
    clear,
    open,
    close,
  };
};
