import { useEffect } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useDispatch, useSelector } from "react-redux";
import { ArrowLeft, Edit, Trash2, Star } from "lucide-react";
import type { RootState, AppDispatch } from "../store";
import {
  fetchProductById,
  deleteProduct,
  setSelectedProduct,
} from "../store/productsSlice";

export function ProductDetailPage() {
  const { id } = useParams<{ id: string }>();
  const dispatch = useDispatch<AppDispatch>();
  const navigate = useNavigate();
  const { selectedProduct: product, loading } = useSelector(
    (state: RootState) => state.products,
  );

  useEffect(() => {
    if (id) {
      dispatch(fetchProductById(id));
    }
    return () => {
      dispatch(setSelectedProduct(null));
    };
  }, [dispatch, id]);

  const handleDelete = async () => {
    if (!product) return;
    const confirmed = window.confirm(
      `Are you sure you want to delete "${product.name}"? This action cannot be undone.`,
    );
    if (confirmed) {
      await dispatch(deleteProduct(product.id));
      navigate("/products");
    }
  };

  if (loading || !product) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-500"></div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate("/products")}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-dark-600" />
          </button>
          <h2 className="font-heading text-3xl font-bold text-dark-900">
            {product.name}
          </h2>
        </div>
        <div className="flex gap-3">
          <Link
            to={`/products/${product.id}/edit`}
            className="flex items-center gap-2 px-4 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600 transition-colors"
          >
            <Edit className="w-4 h-4" />
            Edit
          </Link>
          <button
            onClick={handleDelete}
            className="flex items-center gap-2 px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors"
          >
            <Trash2 className="w-4 h-4" />
            Delete
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Images */}
          <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
            <h3 className="font-heading text-xl font-semibold mb-4">
              Product Images
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              {product.imageUrls.map((url, index) => (
                <img
                  key={index}
                  src={url || "/images/products/default.png"}
                  alt={`${product.name} ${index + 1}`}
                  className="w-full h-48 object-cover rounded-lg"
                />
              ))}
            </div>
          </div>

          {/* Description */}
          <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
            <h3 className="font-heading text-xl font-semibold mb-4">
              Description
            </h3>
            <p className="text-dark-600 mb-4">{product.description}</p>
            {product.longDescription && (
              <div className="prose max-w-none">
                <p className="text-dark-600">{product.longDescription}</p>
              </div>
            )}
          </div>

          {/* Tags */}
          {product.tags.length > 0 && (
            <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
              <h3 className="font-heading text-xl font-semibold mb-4">Tags</h3>
              <div className="flex flex-wrap gap-2">
                {product.tags.map((tag) => (
                  <span
                    key={tag}
                    className="px-3 py-1 bg-gray-100 text-dark-700 rounded-full text-sm"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Status Card */}
          <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
            <h3 className="font-heading text-lg font-semibold mb-4">Status</h3>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-dark-600">Stock Status</span>
                <span
                  className={`px-2 py-1 text-xs font-medium rounded-full ${
                    product.inStock
                      ? "bg-green-100 text-green-700"
                      : "bg-red-100 text-red-700"
                  }`}
                >
                  {product.inStock ? "In Stock" : "Out of Stock"}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-dark-600">Featured</span>
                {product.featured ? (
                  <span className="flex items-center gap-1 text-yellow-600">
                    <Star className="w-4 h-4 fill-current" />
                    Yes
                  </span>
                ) : (
                  <span className="text-dark-400">No</span>
                )}
              </div>
            </div>
          </div>

          {/* Details Card */}
          <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
            <h3 className="font-heading text-lg font-semibold mb-4">Details</h3>
            <div className="space-y-3">
              <div>
                <span className="text-sm text-dark-500">Price</span>
                <p className="text-2xl font-bold text-dark-900">
                  ${(product.price / 100).toFixed(2)}
                </p>
              </div>
              <div>
                <span className="text-sm text-dark-500">Category</span>
                <p className="text-dark-700 font-medium">{product.category}</p>
              </div>
              <div>
                <span className="text-sm text-dark-500">Weight</span>
                <p className="text-dark-700 font-medium">{product.weight}</p>
              </div>
              <div>
                <span className="text-sm text-dark-500">Slug</span>
                <p className="text-dark-700 font-mono text-sm">
                  {product.slug}
                </p>
              </div>
            </div>
          </div>

          {/* Stripe Info */}
          <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
            <h3 className="font-heading text-lg font-semibold mb-4">
              Stripe Integration
            </h3>
            <div className="space-y-3">
              {product.stripePriceId && (
                <div>
                  <span className="text-sm text-dark-500">Price ID</span>
                  <p className="text-dark-700 font-mono text-xs break-all">
                    {product.stripePriceId}
                  </p>
                </div>
              )}
              {product.stripePaymentLinkId && (
                <div>
                  <span className="text-sm text-dark-500">Payment Link</span>
                  <p className="text-dark-700 font-mono text-xs break-all">
                    {product.stripePaymentLinkId}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
