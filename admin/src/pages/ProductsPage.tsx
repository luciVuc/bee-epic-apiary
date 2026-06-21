/** Products list page with search, category filtering, desktop table / mobile card view, pagination, and CRUD dialogs */
import {
  useEffect,
  useLayoutEffect,
  useState,
  useRef,
  useCallback,
} from "react";
import { useDispatch, useSelector } from "react-redux";
import {
  Link,
  useLocation,
  useNavigate,
  useSearchParams,
} from "react-router-dom";
import {
  Plus,
  Search,
  Filter,
  Edit,
  Trash2,
  Package,
  AlertCircle,
  X,
  ChevronDown,
} from "lucide-react";
import type { RootState, AppDispatch } from "../store";
import {
  fetchProducts,
  deleteProduct,
  fetchProductsCount,
} from "../store/productsSlice";
import { DEFAULT_PRODUCT_THUMBNAIL } from "../utils/constants";
import type { ICategory } from "../types/settings";
import * as api from "../utils/api";
import { Spinner } from "../components/shared/Spinner";
import { ProductFormDialog } from "../components/products/ProductFormDialog";
import { DeleteConfirmDialog } from "../components/shared/DeleteConfirmDialog";
import {
  stockBadgeClass,
  stockLabel,
  categoryBadgeClass,
  categoryLabel,
  recurringText,
  formatPrice,
} from "../utils/badgeClasses";

export function ProductsPage() {
  const dispatch = useDispatch<AppDispatch>();
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const {
    items: products,
    loading,
    error,
    hasMore,
    totalCount,
  } = useSelector((state: RootState) => state.products);

  const searchTimer = useRef<ReturnType<typeof setTimeout>>(null);

  const searchTerm = searchParams.get("search") || "";
  const selectedCategory = searchParams.get("category") || "ALL";

  const prevSearch = useRef(searchTerm);
  const prevCategory = useRef(selectedCategory);

  const [categories, setCategories] = useState<ICategory[]>([]);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [showFilters, setShowFilters] = useState(
    () => (searchParams.get("category") || "ALL") !== "ALL",
  );

  const updateSearchParams = useCallback(
    (search: string, category: string) => {
      const params: Record<string, string> = {};
      if (search) params.search = search;
      if (category && category !== "ALL") params.category = category;
      setSearchParams(params, { replace: true });
    },
    [setSearchParams],
  );

  const buildFetchParams = (includeLimit?: boolean) => {
    const params: { search?: string; category?: string; limit?: number } = {};
    if (searchTerm) params.search = searchTerm;
    if (selectedCategory !== "ALL") params.category = selectedCategory;
    if (includeLimit) {
      const limitParam = searchParams.get("limit");
      if (limitParam) {
        const parsed = parseInt(limitParam, 10);
        if (!isNaN(parsed) && parsed > 0) params.limit = parsed;
      }
    }
    return params;
  };

  useLayoutEffect(() => {
    dispatch(fetchProducts(buildFetchParams(true)));
    dispatch(fetchProductsCount(buildFetchParams(true)));
  }, []);

  useLayoutEffect(() => {
    const saved = sessionStorage.getItem("adminProductsScrollY");
    if (!saved) return;
    const y = parseInt(saved, 10);
    window.scrollTo(0, y);
    const id = requestAnimationFrame(() => {
      window.scrollTo(0, y);
      sessionStorage.removeItem("adminProductsScrollY");
    });
    return () => cancelAnimationFrame(id);
  }, []);

  useEffect(() => {
    api.api
      .getSettings<ICategory[]>("categories")
      .then((cats) => {
        setCategories(cats || []);
      })
      .catch(() => {
        setCategories([]);
      });
  }, []);

  useEffect(() => {
    if (
      prevSearch.current === searchTerm &&
      prevCategory.current === selectedCategory
    ) {
      prevSearch.current = searchTerm;
      prevCategory.current = selectedCategory;
      return;
    }

    prevSearch.current = searchTerm;
    prevCategory.current = selectedCategory;

    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(async () => {
      await dispatch(fetchProducts(buildFetchParams()));
      await dispatch(fetchProductsCount(buildFetchParams()));
    }, 300);
    return () => {
      if (searchTimer.current) clearTimeout(searchTimer.current);
    };
  }, [searchTerm, selectedCategory, dispatch]);

  const saveScroll = useCallback(() => {
    sessionStorage.setItem("adminProductsScrollY", String(window.scrollY));
  }, []);

  const handleLoadMore = () => {
    if (products.length === 0) return;
    const newLimit = products.length + 10;
    const params: Record<string, string> = {};
    if (searchTerm) params.search = searchTerm;
    if (selectedCategory !== "ALL") params.category = selectedCategory;
    params.limit = String(newLimit);
    setSearchParams(params, { replace: true });
    saveScroll();
    dispatch(
      fetchProducts({
        starting_after: products[products.length - 1]?.id,
        limit: 10,
        search: searchTerm,
        category: selectedCategory,
      }),
    );
  };

  const handleDelete = async (id: string) => {
    await dispatch(deleteProduct(id));
    setDeleteConfirm(null);
  };

  const currentUrl = `${location.pathname}${location.search}`;

  const handleAddProduct = () => {
    saveScroll();
    navigate("/products/new", { replace: true });
  };

  const handleEditProduct = (id: string) => {
    saveScroll();
    navigate(`/products/${id}/edit`, {
      replace: true,
      state: { from: currentUrl },
    });
  };

  const handleCloseDialog = () => {
    navigate("/products", { replace: true });
  };

  const handleSearchChange = (value: string) => {
    updateSearchParams(value, selectedCategory);
  };

  const handleCategoryChange = (value: string) => {
    updateSearchParams(searchTerm, value);
  };

  const deleteTarget = deleteConfirm
    ? products.find((p) => p.id === deleteConfirm)
    : null;

  if (
    loading &&
    products.length === 0 &&
    location.pathname !== "/products/new"
  ) {
    return <Spinner />;
  }

  const showingCount = products.length;

  return (
    <div data-testid="products-page">
      <div
        data-testid="products-page_header"
        className="sticky top-0 z-20 bg-white border-b border-gray-200 px-4 py-4 mb-6 flex flex-col md:flex-row md:items-center justify-between gap-4 dark:bg-dark-950 dark:border-gray-700"
      >
        <h2
          data-testid="products-page_title"
          className="font-heading text-3xl font-bold text-dark-900"
        >
          Products Management
        </h2>
        <button
          data-testid="products-page_add-btn"
          onClick={handleAddProduct}
          className="inline-flex items-center gap-2 px-4 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Add Product
        </button>
      </div>

      {error && (
        <div
          role="alert"
          className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 dark:bg-red-900/20 dark:border-red-800/30"
          data-testid="products-page_error"
        >
          <AlertCircle className="w-5 h-5 text-red-500" />
          <span className="text-red-700 dark:text-red-300">{error}</span>
        </div>
      )}

      {/* Toolbar */}
      <div
        data-testid="products-page_toolbar"
        className="bg-white p-4 rounded-xl shadow-sm border border-gray-200 mb-6 dark:bg-dark-950 dark:border-gray-700"
      >
        <div
          data-testid="products-page_toolbar-content"
          className="flex flex-col md:flex-row gap-4"
        >
          {/* Search */}
          <div data-testid="products-page_search" className="flex-1 relative">
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
              data-testid="products-page_search-input"
              className="w-full pl-10 pr-10 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 dark:border-gray-600 dark:bg-dark-100 dark:text-dark-900 dark:focus:ring-primary-400 dark:focus:border-primary-400"
            />
            {searchTerm && (
              <button
                onClick={() => handleSearchChange("")}
                aria-label="Clear search"
                title="Clear search"
                data-testid="products-page_search-clear"
                className="absolute right-3 top-1/2 -translate-y-1/2 text-dark-400 hover:text-dark-600 transition-colors dark:text-dark-500 dark:hover:text-dark-300"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Filter Toggle */}
          <button
            onClick={() => setShowFilters(!showFilters)}
            data-testid="products-page_filter-toggle"
            aria-label="Toggle filters"
            className="inline-flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors shrink-0 dark:border-gray-600 dark:hover:bg-dark-200"
          >
            <Filter className="w-4 h-4 text-dark-600" />
            <span className="text-sm font-medium text-dark-700">Filters</span>
            <ChevronDown
              className={`w-4 h-4 text-dark-400 transition-transform duration-200 ${showFilters ? "rotate-180" : ""}`}
            />
          </button>
        </div>

        {/* Collapsible Filters Panel */}
        <div
          data-testid="products-page_filters-panel"
          className={`overflow-hidden transition-all duration-200 ease-in-out ${showFilters ? "max-h-96 opacity-100 mt-4" : "max-h-0 opacity-0"}`}
        >
          <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
            <div className="flex flex-col sm:flex-row gap-4">
              {/* Category Filter */}
              <div
                data-testid="products-page_category-filter-container"
                className="flex flex-col gap-1.5"
              >
                <label
                  htmlFor="products-category-filter"
                  className="text-sm font-medium text-dark-700"
                >
                  Category
                </label>
                <select
                  id="products-category-filter"
                  value={selectedCategory}
                  onChange={(e) => handleCategoryChange(e.target.value)}
                  aria-label="Filter by category"
                  data-testid="products-page_category-filter"
                  className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 dark:border-gray-600 dark:bg-dark-100 dark:hover:bg-dark-200 dark:text-dark-900 dark:focus:ring-primary-400 dark:focus:border-primary-400"
                >
                  <option value="ALL">All Categories</option>
                  {categories.length === 0 ? (
                    <option value="ALL" disabled>
                      No categories available
                    </option>
                  ) : (
                    categories.map((cat) => (
                      <option key={cat.id} value={cat.id}>
                        {cat.label}
                      </option>
                    ))
                  )}
                </select>
              </div>
            </div>
          </div>
        </div>

        {/* Results count */}
        <div
          data-testid="products-page_results-count"
          className="mt-3 text-sm text-dark-500"
        >
          Showing {showingCount} of {totalCount} products
        </div>
      </div>

      {/* Products Display */}
      {products.length === 0 && !loading ? (
        <div data-testid="products-page_empty" className="text-center py-12">
          <Package className="w-16 h-16 text-dark-300 mx-auto mb-4" />
          <h3 className="font-heading text-xl font-semibold text-dark-700 mb-2">
            No products found
          </h3>
          <p className="text-dark-500 mb-4">
            {searchTerm || selectedCategory !== "ALL"
              ? "Try adjusting your search or filter"
              : "Get started by adding your first product"}
          </p>
          <button
            onClick={handleAddProduct}
            className="inline-flex items-center gap-2 px-4 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Add Product
          </button>
        </div>
      ) : (
        <div data-testid="products-page_content" className="relative">
          {loading && (
            <div
              role="status"
              aria-live="polite"
              className="absolute inset-0 bg-white/60 flex items-center justify-center z-10 min-h-[200px] dark:bg-dark-950/60"
            >
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-500 dark:border-primary-400"></div>
              <span className="sr-only">Loading products...</span>
            </div>
          )}

          {/* Desktop table view */}
          <div
            data-testid="products-page_table-container"
            className="hidden md:flex flex-col overflow-x-auto"
          >
            <table data-testid="products-page_table" className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200 sticky top-0 z-10 dark:bg-dark-100 dark:border-gray-700">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-dark-500 uppercase tracking-wider">
                    Product
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-dark-500 uppercase tracking-wider">
                    Category
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-dark-500 uppercase tracking-wider">
                    Price
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-dark-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="w-[25px] px-1 py-3 text-left text-xs font-medium text-dark-500 uppercase tracking-wider">
                    Featured
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-dark-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {products.map((product) => (
                  <tr
                    key={product.id}
                    className="hover:bg-gray-50 transition-colors dark:hover:bg-dark-100"
                  >
                    <td className="px-6 py-4 whitespace-nowrap">
                      <Link
                        to={`/products/${product.id}`}
                        onClick={saveScroll}
                        state={{ from: currentUrl }}
                        className="flex items-center gap-3"
                      >
                        <img
                          src={
                            product.thumbnailUrls[0] ||
                            DEFAULT_PRODUCT_THUMBNAIL
                          }
                          alt={product.name}
                          loading="lazy"
                          className="w-10 h-10 rounded-lg object-cover"
                        />
                        <div>
                          <div className="font-medium text-dark-900">
                            {product.name}
                          </div>
                          <div className="text-sm text-dark-500">
                            {product.slug}
                          </div>
                        </div>
                      </Link>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span
                        className={`px-2 py-1 text-xs font-medium rounded-full ${categoryBadgeClass(product.category)}`}
                      >
                        {categoryLabel(product.category)}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="text-dark-700">
                        {formatPrice(product.price)}
                      </span>
                      {product.recurringInterval && (
                        <p className="text-xs text-blue-600 mt-0.5 dark:text-blue-400">
                          /{" "}
                          {recurringText(
                            product.recurringInterval,
                            product.recurringIntervalCount,
                          )}
                        </p>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span
                        className={`px-2 py-1 text-xs font-medium rounded-full ${stockBadgeClass(product.inStock)}`}
                      >
                        {stockLabel(product.inStock)}
                      </span>
                    </td>
                    <td className="px-1 py-4">
                      {product.featured && (
                        <span className="px-1 py-1 text-xs font-medium rounded-full bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300">
                          Featured
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleEditProduct(product.id);
                          }}
                          aria-label="Edit product"
                          title="Edit product"
                          className="p-2 text-dark-600 hover:bg-dark-100 rounded-lg transition-colors dark:text-dark-400 dark:hover:bg-dark-200"
                        >
                          <Edit className="w-4 h-4" />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setDeleteConfirm(product.id);
                          }}
                          aria-label="Delete product"
                          title="Delete product"
                          className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors dark:hover:bg-red-900/30"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile card view */}
          <div className="md:hidden space-y-4">
            {products.map((product) => (
              <div
                key={product.id}
                className="bg-white p-4 rounded-xl shadow-sm border border-gray-200 dark:bg-dark-950 dark:border-gray-700"
              >
                <div className="flex items-center gap-3 mb-3">
                  <img
                    src={product.thumbnailUrls[0] || DEFAULT_PRODUCT_THUMBNAIL}
                    alt={product.name}
                    loading="lazy"
                    className="w-12 h-12 rounded-lg object-cover"
                  />
                  <div className="flex-1">
                    <div className="font-medium text-dark-900">
                      {product.name}
                    </div>
                    <div className="text-sm text-dark-500">{product.slug}</div>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <span className="text-dark-500">Category:</span>
                    <span
                      className={`ml-1 px-2 py-1 text-xs font-medium rounded-full ${categoryBadgeClass(product.category)}`}
                    >
                      {categoryLabel(product.category)}
                    </span>
                  </div>
                  <div>
                    <span className="text-dark-500">Price:</span>
                    <span className="ml-1 text-dark-700">
                      {formatPrice(product.price)}
                    </span>
                    {product.recurringInterval && (
                      <span className="ml-1 text-xs text-blue-600 dark:text-blue-400">
                        /{" "}
                        {recurringText(
                          product.recurringInterval,
                          product.recurringIntervalCount,
                        )}
                      </span>
                    )}
                  </div>
                  <div>
                    <span className="text-dark-500">Status:</span>
                    <span
                      className={`ml-1 px-2 py-1 text-xs font-medium rounded-full ${stockBadgeClass(product.inStock)}`}
                    >
                      {stockLabel(product.inStock)}
                    </span>
                  </div>
                  <div>
                    {product.featured && (
                      <span className="px-2 py-1 text-xs font-medium rounded-full bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300">
                        Featured
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex gap-2 mt-3 pt-3 border-t border-gray-200 dark:border-gray-700">
                  <Link
                    to={`/products/${product.id}`}
                    onClick={saveScroll}
                    state={{ from: currentUrl }}
                    className="flex-1 text-center px-3 py-2 text-sm bg-gray-100 text-dark-700 rounded-lg hover:bg-gray-200 transition-colors dark:bg-dark-200 dark:text-dark-800 dark:hover:bg-dark-300"
                  >
                    View
                  </Link>
                  <button
                    onClick={() => handleEditProduct(product.id)}
                    aria-label="Edit product"
                    className="flex-1 px-3 py-2 text-sm bg-primary-500 text-white rounded-lg hover:bg-primary-600 transition-colors"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => setDeleteConfirm(product.id)}
                    aria-label="Delete product"
                    className="flex-1 px-3 py-2 text-sm bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Load More Button */}
          {hasMore && (
            <div className="mt-6 text-center">
              <button
                onClick={handleLoadMore}
                disabled={loading}
                data-testid="products-page_load-more-btn"
                aria-label="Load more products"
                className="px-6 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? "Loading..." : "Load More Products"}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Shared Delete Confirmation Dialog */}
      <DeleteConfirmDialog
        isOpen={deleteConfirm !== null}
        productName={deleteTarget?.name || ""}
        onCancel={() => setDeleteConfirm(null)}
        onConfirm={() => deleteConfirm && handleDelete(deleteConfirm)}
      />

      {/* Product Form Dialog */}
      {location.pathname === "/products/new" && (
        <ProductFormDialog onClose={handleCloseDialog} />
      )}
    </div>
  );
}
