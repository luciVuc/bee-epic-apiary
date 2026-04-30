import { useState, useMemo, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  ShoppingCart,
  X,
  ChevronLeft,
  ChevronRight,
  Plus,
  Minus,
} from "lucide-react";
import { Button } from "../ui/Button";
import { Badge } from "../ui/Badge";
import { useCart } from "../../hooks/useCart";
import { formatPrice } from "../../utils/formatters";
import productsData from "../../data/products.json";
import type { IProduct } from "../../types";

export function ProductDetailPage() {
  const navigate = useNavigate();
  const { slug } = useParams<{ slug: string }>();
  const { add, items } = useCart();
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [showLightbox, setShowLightbox] = useState(false);

  const products = useMemo(() => productsData as IProduct[], []);
  const product = products.find((p) => p.slug === slug);

  const cartItem = product
    ? items.find((item) => item.product.id === product.id)
    : null;
  const [quantity, setQuantity] = useState(cartItem?.quantity || 1);

  useEffect(() => {
    if (cartItem) {
      setQuantity(cartItem.quantity);
    } else {
      setQuantity(1);
    }
  }, [cartItem]);

  if (!product) {
    return (
      <div className="min-h-screen bg-primary-50 flex items-center justify-center">
        <div className="text-center">
          <h1 className="font-heading text-2xl font-bold text-dark-900 mb-4">
            Product not found
          </h1>
          <Button onClick={() => navigate("/products")}>
            Back to Products
          </Button>
        </div>
      </div>
    );
  }

  const images = product.imageUrls.length > 0 ? product.imageUrls : [];
  const hasMultipleImages = images.length > 1;

  const handleAddToCart = () => {
    if (product.inStock) {
      add(product, quantity);
    }
  };

  const handleQuantityChange = (delta: number) => {
    const newQuantity = quantity + delta;
    if (newQuantity >= 1) {
      setQuantity(newQuantity);
    }
  };

  const nextImage = () => {
    setCurrentImageIndex((prev) => (prev + 1) % images.length);
  };

  const prevImage = () => {
    setCurrentImageIndex((prev) => (prev - 1 + images.length) % images.length);
  };

  return (
    <motion.div
      className="min-h-screen bg-primary-50 py-8 px-4 sm:px-6 lg:px-8"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <div className="max-w-6xl mx-auto py-12">
        <button
          onClick={() => navigate("/products")}
          className="flex items-center text-dark-600 hover:text-primary-600 transition-colors mb-6 font-body"
        >
          <ChevronLeft className="w-5 h-5 mr-1" />
          Back to Products
        </button>

        <div className="bg-white rounded-3xl shadow-sm overflow-hidden">
          <div className="grid grid-cols-1 lg:grid-cols-2">
            <div className="relative aspect-square bg-primary-50">
              {images.length > 0 ? (
                <>
                  <motion.img
                    key={currentImageIndex}
                    src={images[currentImageIndex]}
                    alt={product.name}
                    className="w-full h-full object-cover cursor-pointer"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.3 }}
                    onClick={() => setShowLightbox(true)}
                  />
                  {hasMultipleImages && (
                    <>
                      <button
                        onClick={prevImage}
                        className="absolute left-4 top-1/2 -translate-y-1/2 w-10 h-10 bg-white/80 rounded-full flex items-center justify-center shadow-md hover:bg-white transition-colors"
                        aria-label="Previous image"
                      >
                        <ChevronLeft className="w-6 h-6 text-dark-700" />
                      </button>
                      <button
                        onClick={nextImage}
                        className="absolute right-4 top-1/2 -translate-y-1/2 w-10 h-10 bg-white/80 rounded-full flex items-center justify-center shadow-md hover:bg-white transition-colors"
                        aria-label="Next image"
                      >
                        <ChevronRight className="w-6 h-6 text-dark-700" />
                      </button>
                      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2">
                        {images.map((_, idx) => (
                          <button
                            key={idx}
                            onClick={() => setCurrentImageIndex(idx)}
                            className={`w-2 h-2 rounded-full transition-colors ${
                              idx === currentImageIndex
                                ? "bg-primary-500"
                                : "bg-dark-300"
                            }`}
                            aria-label={`Go to image ${idx + 1}`}
                          />
                        ))}
                      </div>
                    </>
                  )}
                </>
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <div className="text-center">
                    <span className="text-9xl">🍯</span>
                  </div>
                </div>
              )}
              <div className="absolute top-4 left-4 flex flex-col gap-2">
                {product.featured && <Badge variant="featured">Featured</Badge>}
                {!product.inStock && (
                  <Badge variant="error">Out of Stock</Badge>
                )}
              </div>
            </div>

            <div className="p-6 sm:p-8 lg:p-12 flex flex-col">
              <div className="mb-2">
                <span className="text-sm font-body text-primary-600 uppercase tracking-wider">
                  {product.category}
                </span>
              </div>

              <h1 className="font-heading text-3xl sm:text-4xl font-bold text-dark-900 mb-4">
                {product.name}
              </h1>

              <div className="flex items-center gap-4 mb-6">
                <span className="font-heading text-3xl font-bold text-primary-600">
                  {formatPrice(product.price)}
                </span>
                <span className="font-body text-dark-500">
                  / {product.weight}
                </span>
              </div>

              <p className="font-body text-dark-600 text-lg mb-6">
                {product.description}
              </p>

              <div className="prose prose-amber mb-8">
                <p className="font-body text-dark-600">
                  {product.longDescription}
                </p>
              </div>

              {product.tags.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-8">
                  {product.tags.map((tag) => (
                    <span
                      key={tag}
                      className="px-3 py-1 bg-primary-50 text-primary-700 rounded-full text-sm font-body"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              )}

              <div className="mt-auto">
                {product.inStock && (
                  <div className="flex items-center justify-left gap-4 mb-4">
                    <span className="font-body text-dark-600">Quantity:</span>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleQuantityChange(-1)}
                        className="p-1 hover:bg-dark-100 rounded transition-colors"
                        aria-label="Decrease quantity"
                      >
                        <Minus className="w-4 h-4 text-dark-600" />
                      </button>
                      <span className="font-body text-dark-900 w-8 text-center">
                        {quantity}
                      </span>
                      <button
                        onClick={() => handleQuantityChange(1)}
                        className="p-1 hover:bg-dark-100 rounded transition-colors"
                        aria-label="Increase quantity"
                      >
                        <Plus className="w-4 h-4 text-dark-600" />
                      </button>
                    </div>
                  </div>
                )}
                <Button
                  size="lg"
                  onClick={handleAddToCart}
                  disabled={!product.inStock}
                  className="w-full flex items-center justify-center"
                >
                  <ShoppingCart className="w-5 h-5 mr-2" />
                  {product.inStock ? "Add to Cart" : "Out of Stock"}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <AnimatePresence>
        {showLightbox && (
          <motion.div
            className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setShowLightbox(false)}
          >
            <button
              className="absolute top-4 right-4 w-10 h-10 bg-white/20 rounded-full flex items-center justify-center hover:bg-white/30 transition-colors"
              onClick={() => setShowLightbox(false)}
            >
              <X className="w-6 h-6 text-white" />
            </button>
            {hasMultipleImages && (
              <>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    prevImage();
                  }}
                  className="absolute left-4 top-1/2 -translate-y-1/2 w-12 h-12 bg-white/20 rounded-full flex items-center justify-center hover:bg-white/30 transition-colors"
                >
                  <ChevronLeft className="w-8 h-8 text-white" />
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    nextImage();
                  }}
                  className="absolute right-4 top-1/2 -translate-y-1/2 w-12 h-12 bg-white/20 rounded-full flex items-center justify-center hover:bg-white/30 transition-colors"
                >
                  <ChevronRight className="w-8 h-8 text-white" />
                </button>
              </>
            )}
            <img
              src={images[currentImageIndex]}
              alt={product.name}
              className="max-w-full max-h-full object-contain"
              onClick={(e) => e.stopPropagation()}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
