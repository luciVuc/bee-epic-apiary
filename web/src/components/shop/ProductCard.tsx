import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { ShoppingCart } from "lucide-react";
import { Button } from "../ui/Button";
import { Badge } from "../ui/Badge";
import { useCart } from "../../hooks/useCart";
import { formatPrice } from "../../utils/formatters";
import type { IProduct } from "../../types";

interface IProductCardProps {
  product: IProduct;
}

export const ProductCard = ({ product }: IProductCardProps) => {
  const { add } = useCart();

  const handleAddToCart = () => {
    if (product.inStock) {
      add(product);
    }
  };

  return (
    <motion.div
      data-testid={`product-card-${product.slug}`}
      className="bg-white rounded-2xl shadow-sm hover:shadow-amber transition-shadow duration-300 overflow-hidden"
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.4 }}
      whileHover={{ y: -5 }}
    >
      <div className="aspect-[4/3] bg-primary-50 relative overflow-hidden">
        <Link
          to={`/products/${product.slug}`}
          aria-label={`View ${product.name}`}
        >
          {product.imageUrls && product.imageUrls[0] ? (
            <img
              src={product.imageUrls[0]}
              alt={product.name}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <div className="text-center">
                <span className="text-5xl" aria-hidden="true">
                  🍯
                </span>
              </div>
            </div>
          )}
        </Link>
        {product.featured && (
          <Badge variant="featured" className="absolute top-3 left-3">
            Featured
          </Badge>
        )}
        {!product.inStock && (
          <Badge variant="error" className="absolute top-3 right-3">
            Out of Stock
          </Badge>
        )}
      </div>

      <div className="p-4">
        <div className="flex items-start justify-between mb-2">
          <h3 className="font-heading text-lg font-semibold text-dark-900">
            <Link
              to={`/products/${product.slug}`}
              data-testid={`product-card_${product.slug}_name-link`}
              className="hover:text-primary-600 transition-colors"
            >
              {product.name}
            </Link>
          </h3>
          <span className="font-body text-sm text-dark-500">
            {product.weight}
          </span>
        </div>

        <p className="font-body text-sm text-dark-600 mb-4 line-clamp-2">
          {product.description}
        </p>

        <div className="flex items-center justify-between">
          <span className="font-heading text-xl font-bold text-primary-600">
            {formatPrice(product.price)}
          </span>

          <Button
            size="sm"
            data-testid={`product-card_${product.slug}_add-btn`}
            onClick={handleAddToCart}
            disabled={!product.inStock}
            className="flex items-center"
            aria-label={
              product.inStock
                ? `Add ${product.name} to cart`
                : `${product.name} is unavailable`
            }
            title={
              product.inStock
                ? `Add ${product.name} to cart`
                : `${product.name} is unavailable`
            }
          >
            <ShoppingCart className="w-4 h-4 mr-1" aria-hidden="true" />
            {product.inStock ? "Add" : "Unavailable"}
          </Button>
        </div>
      </div>
    </motion.div>
  );
};
