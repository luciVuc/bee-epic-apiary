import {
  useState,
  useEffect,
  useRef,
  useMemo,
  useCallback,
  useLayoutEffect,
} from "react";
import { useSearchParams } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Search, X, ArrowUpDown } from "lucide-react";
import { SectionHeader } from "../ui/SectionHeader";
import { ProductCard } from "../shop/ProductCard";
import { Button } from "../ui/Button";
import { fetchProductsPaginated } from "../../utils/api";
import type { IProduct, ICategory, ISiteContent } from "../../types";

interface IProductsSectionProps {
  content: ISiteContent;
  categories: ICategory[];
}

export const ProductsSection = ({
  content,
  categories,
}: IProductsSectionProps) => {
  const [searchParams, setSearchParams] = useSearchParams();

  const searchTerm = searchParams.get("search") || "";
  const activeCategory = searchParams.get("category") || "";
  const sortBy = (searchParams.get("sortBy") || "name") as "name" | "price";
  const sortOrder = (searchParams.get("sortOrder") || "asc") as "asc" | "desc";
  const limit = Math.max(1, parseInt(searchParams.get("limit") || "12", 10));

  const [products, setProducts] = useState<IProduct[]>([]);
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [hasMore, setHasMore] = useState(false);
  const [lastId, setLastId] = useState<string | null>(null);
  const [totalCount, setTotalCount] = useState(0);

  const searchTimer = useRef<ReturnType<typeof setTimeout>>();
  const isInitialMount = useRef(true);
  const scrollPosRef = useRef(0);

  const updateSearchParams = useCallback(
    (overrides: Record<string, string | undefined>) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          for (const [key, value] of Object.entries(overrides)) {
            if (value) next.set(key, value);
            else next.delete(key);
          }
          return next;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  const handleSearchChange = (value: string) => {
    updateSearchParams({
      search: value || undefined,
      limit: undefined,
    });
  };

  const handleCategoryClick = (categoryId: string) => {
    updateSearchParams({
      category: activeCategory === categoryId ? undefined : categoryId,
      limit: undefined,
    });
  };

  const handleSortChange = (value: string) => {
    const [by, order] = value.split("-") as ["name" | "price", "asc" | "desc"];
    updateSearchParams({
      sortBy: by !== "name" ? by : undefined,
      sortOrder: order !== "asc" ? order : undefined,
    });
  };

  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);

    const delay = isInitialMount.current ? 0 : 300;
    isInitialMount.current = false;

    searchTimer.current = setTimeout(async () => {
      setLoading(true);
      try {
        const result = await fetchProductsPaginated({
          search: searchTerm || undefined,
          category: activeCategory || undefined,
          limit,
        });
        setProducts(result.products);
        setHasMore(result.hasMore);
        setLastId(result.products[result.products.length - 1]?.id || null);
        setTotalCount(result.totalCount);
      } catch (err) {
        console.error("Failed to fetch products", err);
      } finally {
        setLoading(false);
        setInitialLoading(false);
      }
    }, delay);

    return () => {
      if (searchTimer.current) clearTimeout(searchTimer.current);
    };
  }, [searchTerm, activeCategory]);

  useEffect(() => {
    return () => {
      if (searchTimer.current) clearTimeout(searchTimer.current);
    };
  }, []);

  useLayoutEffect(() => {
    if (scrollPosRef.current > 0 && !loading) {
      window.scrollTo(0, scrollPosRef.current);
      scrollPosRef.current = 0;
    }
  }, [loading]);

  const sortedProducts = useMemo(() => {
    return [...products].sort((a, b) => {
      const modifier = sortOrder === "asc" ? 1 : -1;
      if (sortBy === "name") {
        return a.name.localeCompare(b.name) * modifier;
      }
      return (a.price - b.price) * modifier;
    });
  }, [products, sortBy, sortOrder]);

  const handleLoadMore = async () => {
    scrollPosRef.current = window.scrollY;
    setLoading(true);
    try {
      const result = await fetchProductsPaginated({
        search: searchTerm || undefined,
        category: activeCategory || undefined,
        limit: 12,
        starting_after: lastId || undefined,
      });
      const newProducts = [...products, ...result.products];
      setProducts(newProducts);
      setHasMore(result.hasMore);
      setLastId(result.products[result.products.length - 1]?.id || null);
      setTotalCount(result.totalCount);
      updateSearchParams({ limit: String(newProducts.length) });
    } catch (err) {
      console.error("Failed to load more products", err);
    } finally {
      setLoading(false);
    }
  };

  const sortValue = `${sortBy}-${sortOrder}`;

  return (
    <section
      id="products"
      data-testid="products-section"
      className="py-20 bg-white"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <SectionHeader
          title={content.productsTitle}
          subtitle={content.productsSubtitle}
        />

        {/* Search and Sort toolbar */}
        <div className="flex flex-col sm:flex-row gap-4 mb-8">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-dark-400" />
            <label htmlFor="products-search" className="sr-only">
              Search products
            </label>
            <input
              id="products-search"
              type="text"
              placeholder="Search products..."
              value={searchTerm}
              onChange={(e) => handleSearchChange(e.target.value)}
              data-testid="products-section_search-input"
              className="w-full pl-10 pr-10 py-2.5 border border-dark-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 font-body text-sm"
            />
            {searchTerm && (
              <button
                onClick={() => handleSearchChange("")}
                aria-label="Clear search"
                data-testid="products-section_search-clear"
                className="absolute right-3 top-1/2 -translate-y-1/2 text-dark-400 hover:text-dark-600 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <ArrowUpDown className="w-4 h-4 text-dark-400" />
            <select
              value={sortValue}
              onChange={(e) => handleSortChange(e.target.value)}
              aria-label="Sort products"
              data-testid="products-section_sort-select"
              className="px-4 py-2.5 border border-dark-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 font-body text-sm"
            >
              <option value="name-asc">Name (A-Z)</option>
              <option value="name-desc">Name (Z-A)</option>
              <option value="price-asc">Price (Low to High)</option>
              <option value="price-desc">Price (High to Low)</option>
            </select>
          </div>
        </div>

        {/* Category filter buttons */}
        <div className="flex flex-wrap justify-center gap-2 mb-8">
          {categories.map((category) => (
            <button
              key={category.id}
              data-testid={`products-section_filter-${category.id.toLowerCase()}`}
              onClick={() => handleCategoryClick(category.id)}
              className={`px-4 py-2 rounded-full font-body text-sm font-medium transition-all duration-200 ${
                activeCategory === category.id
                  ? "bg-primary-500 text-white shadow-amber"
                  : "bg-primary-50 text-dark-600 hover:bg-primary-100"
              }`}
              aria-label={`Filter by ${category.label}`}
              title={`Filter by ${category.label}`}
            >
              {category.label}
            </button>
          ))}
        </div>

        {/* Results count */}
        {!initialLoading && (
          <div className="text-center text-sm text-dark-500 mb-6">
            Showing {products.length} of {totalCount} products
          </div>
        )}

        {/* Loading overlay */}
        {loading && products.length === 0 && !initialLoading && (
          <div className="flex justify-center py-12">
            <div
              role="status"
              aria-live="polite"
              className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary-500"
            >
              <span className="sr-only">Loading products...</span>
            </div>
          </div>
        )}

        {/* Product grid */}
        {!initialLoading && (
          <motion.div
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6"
            layout
          >
            <AnimatePresence mode="popLayout">
              {sortedProducts.map((product) => (
                <ProductCard key={product.id} product={product} />
              ))}
            </AnimatePresence>
          </motion.div>
        )}

        {/* Empty state */}
        {!initialLoading && sortedProducts.length === 0 && !loading && (
          <div
            data-testid="products-section_empty"
            className="text-center py-12"
          >
            <p className="font-body text-dark-500">{content.noProductsFound}</p>
          </div>
        )}

        {/* Load More */}
        {hasMore && !initialLoading && (
          <div className="mt-10 text-center">
            <Button
              onClick={handleLoadMore}
              disabled={loading}
              isLoading={loading}
              data-testid="products-section_load-more-btn"
              variant="outline"
              size="lg"
            >
              Load More Products
            </Button>
          </div>
        )}
      </div>
    </section>
  );
};
