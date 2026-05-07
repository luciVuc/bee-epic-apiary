import { useEffect, useState, useMemo } from "react";
import { useDispatch, useSelector } from "react-redux";
import { Link, useLocation } from "react-router-dom";
import {
  Plus,
  Search,
  Filter,
  Edit,
  Trash2,
  Package,
  AlertCircle,
} from "lucide-react";
import type { RootState, AppDispatch } from "../store";
import {
  fetchProducts,
  deleteProduct,
  fetchProductsCount,
} from "../store/productsSlice";
import { CATEGORIES } from "../utils/constants";
import { ProductFormDialog } from "../components/products/ProductFormDialog";

export function ProductsPage() {
  const dispatch = useDispatch<AppDispatch>();
  const location = useLocation();
  const {
    items: products,
    loading,
    error,
    hasMore,
    lastId,
    totalCount,
  } = useSelector((state: RootState) => state.products);

  useEffect(() => {
    dispatch(fetchProducts());
    dispatch(fetchProductsCount());
  }, [dispatch]);

  const handleLoadMore = () => {
    if (lastId) {
      dispatch(fetchProducts({ starting_after: lastId, limit: 10 }));
    }
  };

  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("ALL");
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [showFormDialog, setShowFormDialog] = useState(
    location.pathname === "/products/new",
  );
  const [editingProductId, setEditingProductId] = useState<string | undefined>(
    location.pathname === "/products/new" ? undefined : undefined,
  );

  // Open form dialog if URL is /products/new
  useEffect(() => {
    if (location.pathname === "/products/new") {
      setShowFormDialog(true);
      setEditingProductId(undefined);
    } else {
      setShowFormDialog(false);
      setEditingProductId(undefined);
    }
  }, [location.pathname]);

  useEffect(() => {
    dispatch(fetchProducts());
  }, [dispatch]);

  const filteredProducts = useMemo(() => {
    return products.filter((product) => {
      const matchesSearch =
        product.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        product.description.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesCategory =
        selectedCategory === "ALL" || product.category === selectedCategory;
      return matchesSearch && matchesCategory;
    });
  }, [products, searchTerm, selectedCategory]);

  const handleDelete = async (id: string) => {
    await dispatch(deleteProduct(id));
    setDeleteConfirm(null);
  };

  const handleAddProduct = () => {
    setEditingProductId(undefined);
    setShowFormDialog(true);
  };

  const handleEditProduct = (id: string) => {
    setEditingProductId(id);
    setShowFormDialog(true);
  };

  const handleCloseDialog = () => {
    setShowFormDialog(false);
    setEditingProductId(undefined);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-500"></div>
      </div>
    );
  }

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
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
            />
          </div>

          {/* Category Filter */}
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-dark-400" />
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
            >
              <option value="ALL">All Categories</option>
              {CATEGORIES.map((cat) => (
                <option key={cat.id} value={cat.id}>
                  {cat.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Results count */}
        <div className="mt-3 text-sm text-dark-500">
          Showing {filteredProducts.length} of {totalCount || products.length}{" "}
          products
        </div>
      </div>

      {/* Products Display */}
      {filteredProducts.length === 0 ? (
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
        <>
          {/* Desktop table view */}
          <div className="hidden md:flex flex-col">
            <div className="overflow-x-auto">
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
                    <th className="px-6 py-3 text-left text-xs font-medium text-dark-500 uppercase tracking-wider">
                      Featured
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-dark-500 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
              </table>
            </div>
            <div className="flex-1">
              <table className="w-full">
                <tbody className="divide-y divide-gray-200">
                  {filteredProducts.map((product) => (
                    <tr
                      key={product.id}
                      className="hover:bg-gray-50 transition-colors"
                    >
                      <td className="px-6 py-4 whitespace-nowrap">
                        <Link
                          to={`/products/${product.id}`}
                          className="flex items-center gap-3"
                        >
                          <img
                            src={
                              product.thumbnailUrls[0] ||
                              "/images/products/default-thumbnail.svg"
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
                        <span className="px-2 py-1 text-xs font-medium rounded-full bg-primary-50 text-primary-700">
                          {product.category}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-dark-700">
                        ${(product.price / 100).toFixed(2)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span
                          className={`px-2 py-1 text-xs font-medium rounded-full ${
                            product.inStock
                              ? "bg-green-100 text-green-700"
                              : "bg-red-100 text-red-700"
                          }`}
                        >
                          {product.inStock ? "In Stock" : "Out of Stock"}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {product.featured && (
                          <span className="px-2 py-1 text-xs font-medium rounded-full bg-yellow-100 text-yellow-700">
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
                            className="p-2 text-dark-600 hover:bg-dark-100 rounded-lg transition-colors"
                          >
                            <Edit className="w-4 h-4" />
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setDeleteConfirm(product.id);
                            }}
                            className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>

                        {/* Delete Confirmation - Desktop */}
                        {deleteConfirm === product.id && (
                          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                            <div className="bg-white rounded-xl p-6 max-w-md w-full mx-4">
                              <h3
                                className="font-heading text-xl font-semibold mb-4"
                                style={{
                                  textAlign: "justify",
                                }}
                              >
                                Confirm Delete
                              </h3>
                              <p
                                className="text-dark-600 mb-6"
                                style={{
                                  whiteSpace: "initial",
                                  textAlign: "justify",
                                }}
                              >
                                Are you sure you want to delete "{product.name}
                                "? This action cannot be undone.
                              </p>
                              <div className="flex gap-3 justify-end">
                                <button
                                  onClick={() => setDeleteConfirm(null)}
                                  className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                                >
                                  Cancel
                                </button>
                                <button
                                  onClick={() => handleDelete(product.id)}
                                  className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors"
                                >
                                  Delete
                                </button>
                              </div>
                            </div>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Mobile card view */}
          <div className="md:hidden space-y-4">
            {filteredProducts.map((product) => (
              <div
                key={product.id}
                className="bg-white p-4 rounded-xl shadow-sm border border-gray-200"
              >
                <div className="flex items-center gap-3 mb-3">
                  <img
                    src={
                      product.thumbnailUrls[0] ||
                      "/golden-hive-apiary/admin/images/products/default-thumbnail.svg"
                    }
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
                    <span className="ml-1 px-2 py-1 text-xs font-medium rounded-full bg-primary-50 text-primary-700">
                      {product.category}
                    </span>
                  </div>
                  <div>
                    <span className="text-dark-500">Price:</span>
                    <span className="ml-1 text-dark-700">
                      ${(product.price / 100).toFixed(2)}
                    </span>
                  </div>
                  <div>
                    <span className="text-dark-500">Status:</span>
                    <span
                      className={`ml-1 px-2 py-1 text-xs font-medium rounded-full ${
                        product.inStock
                          ? "bg-green-100 text-green-700"
                          : "bg-red-100 text-red-700"
                      }`}
                    >
                      {product.inStock ? "In Stock" : "Out of Stock"}
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

                {/* Delete Confirmation - Mobile */}
                {deleteConfirm === product.id && (
                  <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg">
                    <h3 className="font-medium text-red-900 mb-2">
                      Confirm Delete
                    </h3>
                    <p className="text-sm text-red-700 mb-3">
                      Are you sure you want to delete "{product.name}"? This
                      action cannot be undone.
                    </p>
                    <div className="flex gap-2 justify-end">
                      <button
                        onClick={() => setDeleteConfirm(null)}
                        className="px-3 py-1 border border-gray-300 rounded text-sm hover:bg-gray-50"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={() => handleDelete(product.id)}
                        className="px-3 py-1 bg-red-500 text-white rounded text-sm hover:bg-red-600"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                )}
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
        </>
      )}

      {/* Product Form Dialog */}
      {showFormDialog && (
        <ProductFormDialog
          productId={editingProductId}
          onClose={handleCloseDialog}
        />
      )}
    </div>
  );
}
