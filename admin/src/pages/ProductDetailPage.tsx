/** Single product detail page with images, description, status card, and inline edit/delete actions */
import { useEffect, useState, useRef } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { useDispatch, useSelector } from "react-redux";
import { ArrowLeft, Edit, Trash2, Star, AlertCircle } from "lucide-react";
import { Link } from "react-router-dom";
import type { RootState, AppDispatch } from "../store";
import {
  fetchProductById,
  deleteProduct,
  setSelectedProduct,
} from "../store/productsSlice";
import { Spinner } from "../components/shared/Spinner";
import { ProductFormDialog } from "../components/products/ProductFormDialog";
import { DeleteConfirmDialog } from "../components/shared/DeleteConfirmDialog";
import { EProductCategory } from "../types";
import { DEFAULT_PRODUCT_IMAGE } from "../utils/constants";
import {
  stockBadgeClass,
  stockLabel,
  recurringText,
  formatPrice,
} from "../utils/badgeClasses";

function getBackUrl(location: ReturnType<typeof useLocation>): string {
  return (location.state as { from?: string } | null)?.from || "/products";
}

export function ProductDetailPage() {
  const { id } = useParams<{ id: string }>();
  const location = useLocation();
  const dispatch = useDispatch<AppDispatch>();
  const navigate = useNavigate();
  const {
    selectedProduct: product,
    loading,
    error,
  } = useSelector((state: RootState) => state.products);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const fetchedId = useRef<string | undefined>(undefined);

  const isEditMode = location.pathname.endsWith("/edit");

  useEffect(() => {
    if (id && fetchedId.current !== id) {
      fetchedId.current = id;
      dispatch(fetchProductById(id));
    }
    return () => {
      dispatch(setSelectedProduct(null));
    };
  }, [dispatch, id]);

  const handleDelete = async () => {
    if (!product) return;
    await dispatch(deleteProduct(product.id));
    navigate(getBackUrl(location));
  };

  const handleCloseDialog = () => {
    navigate(`/products/${id}`, {
      replace: true,
      state: { from: getBackUrl(location) },
    });
  };

  const handleEdit = () => {
    navigate(`/products/${id}/edit`, {
      replace: true,
      state: { from: getBackUrl(location) },
    });
  };

  if (error) {
    return (
      <div
        className="text-center py-12"
        data-testid="product-detail-page_error"
      >
        <AlertCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
        <h2 className="text-2xl font-bold text-red-600 mb-4">
          Product Not Found
        </h2>
        <p className="text-dark-600 mb-6">
          The requested product could not be loaded.
        </p>
        <Link
          to={getBackUrl(location)}
          className="inline-flex items-center gap-2 px-4 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600 transition-colors"
        >
          Back to Products
        </Link>
      </div>
    );
  }

  if (loading || !product) {
    return <Spinner />;
  }

  if (isEditMode) {
    return <ProductFormDialog productId={id} onClose={handleCloseDialog} />;
  }

  const backUrl = getBackUrl(location);

  return (
    <div data-testid="product-detail-page">
      <div
        data-testid="product-detail-page_header"
        className="sticky top-0 z-20 bg-white border-b border-gray-200 px-4 py-4 flex items-start justify-between mb-6 dark:bg-dark-950 dark:border-gray-700"
      >
        <div
          data-testid="product-detail-page_header-content"
          className="flex items-start gap-4"
        >
          <button
            data-testid="product-detail-page_back-button"
            onClick={() => navigate(backUrl)}
            aria-label="Back to products"
            title="Back to products"
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors dark:hover:bg-dark-800"
          >
            <ArrowLeft className="w-5 h-5 text-dark-600" />
          </button>
          <h2
            data-testid="product-detail-page_name"
            className="font-heading text-3xl font-bold text-dark-900"
          >
            {product.name}
          </h2>
        </div>
        <div
          data-testid="product-detail-page_header-actions"
          className="flex gap-3"
        >
          <button
            data-testid="product-detail-page_edit-button"
            onClick={handleEdit}
            className="flex items-center gap-2 px-4 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600 transition-colors"
            title="Edit Product"
          >
            <Edit className="w-4 h-4" />
            <span
              data-testid="product-detail-page_edit-button_text"
              className="hidden md:block"
            >
              Edit
            </span>
          </button>
          <button
            data-testid="product-detail-page_delete-button"
            onClick={() => setDeleteConfirm(true)}
            className="flex items-center gap-2 px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors"
            title="Delete Product"
          >
            <Trash2 className="w-4 h-4" />
            <span
              data-testid="product-detail-page_delete-button_text"
              className="hidden md:block"
            >
              Delete
            </span>
          </button>
        </div>
      </div>

      <div
        data-testid="product-detail-page_content"
        className="grid grid-cols-1 lg:grid-cols-3 gap-6"
      >
        {/* Main Content */}
        <div
          data-testid="product-detail-page_main-content"
          className="lg:col-span-2 space-y-6"
        >
          {/* Images */}
          <div
            data-testid="product-detail-page_images"
            className="bg-white rounded-xl p-6 shadow-sm border border-gray-200 dark:bg-dark-950 dark:border-gray-700"
          >
            <h3
              data-testid="product-detail-page_images_header"
              className="font-heading text-xl font-semibold mb-4 dark:text-dark-800"
            >
              Product Images
            </h3>
            <div
              data-testid="product-detail-page_images_grid"
              className="grid grid-cols md:grid-cols-2 lg:grid-cols-3 gap-4"
            >
              {product.imageUrls.map((url, index) => (
                <img
                  key={index}
                  src={url || DEFAULT_PRODUCT_IMAGE}
                  alt={`${product.name} ${index + 1}`}
                  data-testid={`product-detail-page_image_${index}`}
                  loading="lazy"
                  className="w-48 h-48 object-cover rounded-lg"
                />
              ))}
            </div>
          </div>

          {/* Description */}
          <div
            data-testid="product-detail-page_description"
            className="bg-white rounded-xl p-6 shadow-sm border border-gray-200 dark:bg-dark-950 dark:border-gray-700"
          >
            <h3
              data-testid="product-detail-page_description_header"
              className="font-heading text-xl font-semibold mb-4 dark:text-dark-800"
            >
              Description
            </h3>
            <p
              data-testid="product-detail-page_description_content"
              className="text-dark-600 mb-4"
            >
              {product.description}
            </p>
            {product.longDescription && (
              <div className="prose max-w-none">
                <p className="text-dark-600">{product.longDescription}</p>
              </div>
            )}
          </div>

          {/* Tags */}
          {product.tags.length > 0 && (
            <div
              data-testid="product-detail-page_tags"
              className="bg-white rounded-xl p-6 shadow-sm border border-gray-200 dark:bg-dark-950 dark:border-gray-700"
            >
              <h3
                data-testid="product-detail-page_tags_header"
                className="font-heading text-xl font-semibold mb-4 dark:text-dark-800"
              >
                Tags
              </h3>
              <div className="flex flex-wrap gap-2">
                {product.tags.map((tag) => (
                  <span
                    key={tag}
                    data-testid={`product-detail-page_tag_${tag}`}
                    className="px-3 py-1 bg-gray-100 text-dark-700 rounded-full text-sm dark:bg-dark-200 dark:text-dark-800"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div data-testid="product-detail-page_sidebar" className="space-y-6">
          {/* Status Card */}
          <div
            data-testid="product-detail-page_status"
            className="bg-white rounded-xl p-6 shadow-sm border border-gray-200 dark:bg-dark-950 dark:border-gray-700"
          >
            <h3
              data-testid="product-detail-page_status_header"
              className="font-heading text-lg font-semibold mb-4 dark:text-dark-800"
            >
              Status
            </h3>
            <div
              data-testid="product-detail-page_status_content"
              className="space-y-3"
            >
              <div className="flex items-center justify-between">
                <span className="text-dark-600">Stock Status</span>
                <span
                  className={`px-2 py-1 text-xs font-medium rounded-full ${stockBadgeClass(product.inStock)}`}
                >
                  {stockLabel(product.inStock)}
                </span>
              </div>
              <div
                data-testid="product-detail-page_featured"
                className="flex items-center justify-between"
              >
                <span className="text-dark-600">Featured</span>
                {product.featured ? (
                  <span className="flex items-center gap-1 text-yellow-600 dark:text-yellow-400">
                    <Star className="w-4 h-4 fill-current" />
                    Yes
                  </span>
                ) : (
                  <span className="text-dark-400">No</span>
                )}
              </div>
              {product.category === EProductCategory.SUBSCRIPTIONS && (
                <div
                  data-testid="product-detail-page_type"
                  className="flex items-center justify-between"
                >
                  <span className="text-dark-600">Type</span>
                  <span className="px-2 py-1 text-xs font-medium rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
                    Subscription
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Details Card */}
          <div
            data-testid="product-detail-page_details"
            className="bg-white rounded-xl p-6 shadow-sm border border-gray-200 dark:bg-dark-950 dark:border-gray-700"
          >
            <h3
              data-testid="product-detail-page_details_header"
              className="font-heading text-lg font-semibold mb-4 dark:text-dark-800"
            >
              Details
            </h3>
            <div
              data-testid="product-detail-page_details_content"
              className="space-y-3"
            >
              <div
                data-testid="product-detail-page_price"
                className="flex items-center justify-between"
              >
                <span
                  data-testid="product-detail-page_price_label"
                  className="text-sm text-dark-500"
                >
                  Price
                </span>
                <p
                  data-testid="product-detail-page_price_value"
                  className="text-2xl font-bold text-dark-900"
                >
                  {formatPrice(product.price)}
                </p>
                {product.recurringInterval && (
                  <p
                    data-testid="product-detail-page_recurring"
                    className="text-sm text-blue-600 mt-1"
                  >
                    {recurringText(
                      product.recurringInterval,
                      product.recurringIntervalCount,
                    )}
                  </p>
                )}
              </div>
              <div
                data-testid="product-detail-page_category"
                className="flex items-center justify-between"
              >
                <span className="text-sm text-dark-500">Category</span>
                <p className="text-dark-700 font-medium">{product.category}</p>
              </div>
              <div
                data-testid="product-detail-page_weight"
                className="flex items-center justify-between"
              >
                <span className="text-sm text-dark-500">Weight</span>
                <p className="text-dark-700 font-medium">{product.weight}</p>
              </div>
              <div
                data-testid="product-detail-page_slug"
                className="flex items-center justify-between"
              >
                <span className="text-sm text-dark-500">Slug</span>
                <p className="text-dark-700 font-mono text-sm">
                  {product.slug}
                </p>
              </div>
            </div>
          </div>

          {/* Stripe Info */}
          <div
            data-testid="product-detail-page_stripe-info"
            className="bg-white rounded-xl p-6 shadow-sm border border-gray-200 dark:bg-dark-950 dark:border-gray-700"
          >
            <h3
              data-testid="product-detail-page_stripe-info_header"
              className="font-heading text-lg font-semibold mb-4 dark:text-dark-800"
            >
              Stripe Integration
            </h3>
            <div
              data-testid="product-detail-page_stripe-info_content"
              className="space-y-3"
            >
              {product.stripePriceId && (
                <div
                  data-testid="product-detail-page_stripe-price-id"
                  className="flex items-center justify-between"
                >
                  <span
                    data-testid="product-detail-page_stripe-price-id_label"
                    className="text-sm text-dark-500"
                  >
                    Price ID
                  </span>
                  <p
                    data-testid="product-detail-page_stripe-price-id_value"
                    className="text-dark-700 font-mono text-xs break-all"
                  >
                    {product.stripePriceId}
                  </p>
                </div>
              )}
              {product.stripePaymentLinkId && (
                <div
                  data-testid="product-detail-page_stripe-payment-link"
                  className="flex items-center justify-between"
                >
                  <span
                    data-testid="product-detail-page_stripe-payment-link_label"
                    className="text-sm text-dark-500"
                  >
                    Payment Link
                  </span>
                  <p
                    data-testid="product-detail-page_stripe-payment-link_value"
                    className="text-dark-700 font-mono text-xs break-all"
                  >
                    {product.stripePaymentLinkId}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Delete Confirmation Dialog */}
      <DeleteConfirmDialog
        data-testid="product-detail-page_delete-confirm-dialog"
        isOpen={deleteConfirm}
        productName={product.name}
        onCancel={() => setDeleteConfirm(false)}
        onConfirm={() => {
          setDeleteConfirm(false);
          handleDelete();
        }}
      />
    </div>
  );
}
