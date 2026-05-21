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

  const isLoadingMore = useRef(false);
  const initialLoadDone = useRef(false);
  const isFirstRender = useRef(true);
  const lastDispatchedParams = useRef<{
    search?: string;
    category?: string;
  } | null>(null);

  const searchTerm = searchParams.get("search") || "";
  const selectedCategory = searchParams.get("category") || "ALL";

  const [categories, setCategories] = useState<ICategory[]>([]);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const searchTimer = useRef<ReturnType<typeof setTimeout>>();

  const updateSearchParams = useCallback(
    (search: string, category: string) => {
      const params: Record<string, string> = {};
      if (search) params.search = search;
      if (category && category !== "ALL") params.category = category;
      setSearchParams(params, { replace: true });
    },
    [setSearchParams],
  );

  useLayoutEffect(() => {
    if (!initialLoadDone.current) {
      initialLoadDone.current = true;

      const params: { search?: string; category?: string } = {};
      let hasUrlParams = false;

      if (searchTerm) {
        params.search = searchTerm;
        hasUrlParams = true;
      }
      if (selectedCategory !== "ALL") {
        params.category = selectedCategory;
        hasUrlParams = true;
      }

      const savedCount = sessionStorage.getItem("adminProductsCount");
      const restoredCount = savedCount ? parseInt(savedCount, 10) : 0;

      if (!hasUrlParams) {
        const savedSearch = sessionStorage.getItem("adminProductsSearch");
        const savedCategory = sessionStorage.getItem("adminProductsCategory");

        if (savedSearch) params.search = savedSearch;
        if (savedCategory && savedCategory !== "ALL")
          params.category = savedCategory;
        if (restoredCount > 10) (params as any).limit = restoredCount;

        if (params.search || params.category) {
          const newParams: Record<string, string> = {};
          if (params.search) newParams.search = params.search;
          if (params.category) newParams.category = params.category;
          setSearchParams(newParams, { replace: true });
          sessionStorage.removeItem("adminProductsSearch");
          sessionStorage.removeItem("adminProductsCategory");
          sessionStorage.removeItem("adminProductsCount");
          if (restoredCount > 10) (params as any).limit = restoredCount;
          dispatch(fetchProducts(params));
          dispatch(fetchProductsCount(params));
          return;
        }
      } else if (restoredCount > 10) {
        (params as any).limit = restoredCount;
      }

      sessionStorage.removeItem("adminProductsSearch");
      sessionStorage.removeItem("adminProductsCategory");
      sessionStorage.removeItem("adminProductsCount");

      dispatch(fetchProducts(params));
      dispatch(fetchProductsCount(params));
    }
  }, [dispatch]);

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
    if (searchTimer.current) clearTimeout(searchTimer.current);

    const params: { search?: string; category?: string } = {};
    if (searchTerm) params.search = searchTerm;
    if (selectedCategory !== "ALL") params.category = selectedCategory;

    const dispatched = lastDispatchedParams.current || {};
    const sameDispatchedSearch =
      (dispatched.search || "") === (params.search || "");
    const sameDispatchedCat =
      (dispatched.category || "ALL") === (params.category || "ALL");

    if (sameDispatchedSearch && sameDispatchedCat) return;

    if (isFirstRender.current) {
      isFirstRender.current = false;
      lastDispatchedParams.current = params;
      return;
    }

    searchTimer.current = setTimeout(async () => {
      lastDispatchedParams.current = params;
      await dispatch(fetchProducts(params));
      await dispatch(fetchProductsCount(params));
    }, 300);
    return () => {
      if (searchTimer.current) clearTimeout(searchTimer.current);
    };
  }, [searchTerm, selectedCategory, dispatch]);

  const saveScroll = useCallback(() => {
    sessionStorage.setItem("adminProductsScrollY", String(window.scrollY));
    sessionStorage.setItem("adminProductsSearch", searchTerm);
    sessionStorage.setItem("adminProductsCategory", selectedCategory);
    sessionStorage.setItem("adminProductsCount", String(products.length));
  }, [searchTerm, selectedCategory, products.length]);

  const handleLoadMore = () => {
    isLoadingMore.current = true;
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

  const handleAddProduct = () => {
    saveScroll();
    navigate("/products/new", { replace: true });
  };

  const handleEditProduct = (id: string) => {
    saveScroll();
    navigate(`/products/${id}/edit`, { replace: true });
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
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-500"></div>
      </div>
    );
  }

  const showingCount = products.length;

  return (
    <div>
      <div className="sticky top-0 z-20 bg-white border-b border-gray-200 px-4 py-4 mb-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <h2 className="font-heading text-3xl font-bold text-dark-900">
          Products Management
        </h2>
        <button
          onClick={handleAddProduct}
          className="inline-flex items-center gap-2 px-4 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Add Product
        </button>
      </div>

      {error && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2">
          <AlertCircle className="w-5 h-5 text-red-500" />
          <span className="text-red-700">{error}</span>
        </div>
      )}

      {/* Toolbar */}
      <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200 mb-6">
        <div className="flex flex-col md:flex-row gap-4">
          {/* Search */}
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-dark-400" />
            <input
              type="text"
              placeholder="Search products..."
              value={searchTerm}
              onChange={(e) => handleSearchChange(e.target.value)}
              className="w-full pl-10 pr-10 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
            />
            {searchTerm && (
              <button
                onClick={() => handleSearchChange("")}
                aria-label="Clear search"
                className="absolute right-3 top-1/2 -translate-y-1/2 text-dark-400 hover:text-dark-600 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Category Filter */}
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-dark-400" />
            <select
              value={selectedCategory}
              onChange={(e) => handleCategoryChange(e.target.value)}
              aria-label="Filter by category"
              className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
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

        {/* Results count */}
        <div className="mt-3 text-sm text-dark-500">
          Showing {showingCount} of {totalCount} products
        </div>
      </div>

      {/* Products Display */}
      {products.length === 0 && !loading ? (
        <div className="text-center py-12">
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
        <div className="relative">
          {loading && (
            <div className="absolute inset-0 bg-white/60 flex items-center justify-center z-10 min-h-[200px]">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-500"></div>
            </div>
          )}

          {/* Desktop table view */}
          <div className="hidden md:flex flex-col overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200 sticky top-0 z-10">
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
              <tbody className="divide-y divide-gray-200">
                {products.map((product) => (
                  <tr
                    key={product.id}
                    className="hover:bg-gray-50 transition-colors"
                  >
                    <td className="px-6 py-4 whitespace-nowrap">
                      <Link
                        to={`/products/${product.id}`}
                        onClick={saveScroll}
                        className="flex items-center gap-3"
                      >
                        <img
                          src={
                            product.thumbnailUrls[0] ||
                            DEFAULT_PRODUCT_THUMBNAIL
                          }
                          alt={product.name}
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
                        <p className="text-xs text-blue-600 mt-0.5">
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
                        <span className="px-1 py-1 text-xs font-medium rounded-full bg-yellow-100 text-yellow-700">
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
                          className="p-2 text-dark-600 hover:bg-dark-100 rounded-lg transition-colors"
                        >
                          <Edit className="w-4 h-4" />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setDeleteConfirm(product.id);
                          }}
                          aria-label="Delete product"
                          className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
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
                className="bg-white p-4 rounded-xl shadow-sm border border-gray-200"
              >
                <div className="flex items-center gap-3 mb-3">
                  <img
                    src={product.thumbnailUrls[0] || DEFAULT_PRODUCT_THUMBNAIL}
                    alt={product.name}
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
                      <span className="ml-1 text-xs text-blue-600">
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
                      <span className="px-2 py-1 text-xs font-medium rounded-full bg-yellow-100 text-yellow-700">
                        Featured
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex gap-2 mt-3 pt-3 border-t border-gray-200">
                  <Link
                    to={`/products/${product.id}`}
                    onClick={saveScroll}
                    className="flex-1 text-center px-3 py-2 text-sm bg-gray-100 text-dark-700 rounded-lg hover:bg-gray-200 transition-colors"
                  >
                    View
                  </Link>
                  <button
                    onClick={() => handleEditProduct(product.id)}
                    className="flex-1 px-3 py-2 text-sm bg-primary-500 text-white rounded-lg hover:bg-primary-600 transition-colors"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => setDeleteConfirm(product.id)}
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
