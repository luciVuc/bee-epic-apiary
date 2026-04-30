import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { SectionHeader } from "../ui/SectionHeader";
import { ProductCard } from "../shop/ProductCard";
import type { IProduct, EProductCategory, ISiteContent } from "../../types";

interface IProductsSectionProps {
  products: IProduct[];
  content: ISiteContent;
}

export const ProductsSection = ({
  products,
  content,
}: IProductsSectionProps) => {
  const [activeCategory, setActiveCategory] = useState<
    EProductCategory | "ALL"
  >("ALL");

  const filteredProducts =
    activeCategory === "ALL"
      ? products
      : products.filter((p) => p.category === activeCategory);

  const categories = content.categories.map((cat) => ({
    ...cat,
    value: cat.id === "ALL" ? "ALL" : cat.id,
  }));

  return (
    <section id="products" className="py-20 bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <SectionHeader
          title={content.productsTitle}
          subtitle={content.productsSubtitle}
        />

        <div className="flex flex-wrap justify-center gap-2 mb-12">
          {categories.map((category) => (
            <button
              key={category.id}
              onClick={() =>
                setActiveCategory(category.value as EProductCategory | "ALL")
              }
              className={`px-4 py-2 rounded-full font-body text-sm font-medium transition-all duration-200 ${
                activeCategory === category.value
                  ? "bg-primary-500 text-white shadow-amber"
                  : "bg-primary-50 text-dark-600 hover:bg-primary-100"
              }`}
            >
              {category.label}
            </button>
          ))}
        </div>

        <motion.div
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6"
          layout
        >
          <AnimatePresence mode="popLayout">
            {filteredProducts.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </AnimatePresence>
        </motion.div>

        {filteredProducts.length === 0 && (
          <div className="text-center py-12">
            <p className="font-body text-dark-500">{content.noProductsFound}</p>
          </div>
        )}
      </div>
    </section>
  );
};
