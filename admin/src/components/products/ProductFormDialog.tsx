import { useState, useEffect } from "react";
import { useDispatch, useSelector } from "react-redux";
import { X, Plus, Trash2 } from "lucide-react";
import type { RootState, AppDispatch } from "../../store";
import {
  createProduct,
  updateProduct,
  fetchProductById,
} from "../../store/productsSlice";
import type { IProductInput } from "../../types";
import { EProductCategory } from "../../types";
import type { ICategory } from "../../types/settings";
import * as api from "../../utils/api";

export interface IProductFormDialogProps {
  productId?: string;
  onClose: () => void;
}

export function ProductFormDialog({
  productId,
  onClose,
}: IProductFormDialogProps) {
  const dispatch = useDispatch<AppDispatch>();
  const { selectedProduct, loading } = useSelector(
    (state: RootState) => state.products,
  );
  const isEditMode = !!productId;

  const [formData, setFormData] = useState<IProductInput>({
    name: "",
    slug: "",
    description: "",
    longDescription: "",
    price: 0,
    stripePaymentLinkId: "",
    category: EProductCategory.HONEY,
    imageUrls: [""],
    thumbnailUrls: [""],
    inStock: true,
    featured: false,
    weight: "",
    tags: [],
    recurringInterval: "",
    recurringIntervalCount: 1,
  });
  const [categories, setCategories] = useState<ICategory[]>([]);
  const [tagInput, setTagInput] = useState("");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [fetchingEditData, setFetchingEditData] = useState(false);

  useEffect(() => {
    setTagInput("");
  }, [productId]);

  useEffect(() => {
    setSubmitError(null);
    if (!productId) {
      setFormData({
        name: "",
        slug: "",
        description: "",
        longDescription: "",
        price: 0,
        stripePaymentLinkId: "",
        category: EProductCategory.HONEY,
        imageUrls: [""],
        thumbnailUrls: [""],
        inStock: true,
        featured: false,
        weight: "",
        tags: [],
        recurringInterval: "",
        recurringIntervalCount: 1,
      });
    }
  }, [productId]);

  useEffect(() => {
    if (productId && (!selectedProduct || selectedProduct.id !== productId)) {
      setFetchingEditData(true);
      dispatch(fetchProductById(productId));
    }
  }, [dispatch, productId]);

  useEffect(() => {
    if (selectedProduct && selectedProduct.id === productId) {
      setFetchingEditData(false);
    }
  }, [selectedProduct, productId]);

  useEffect(() => {
    if (isEditMode && selectedProduct) {
      setFormData({
        name: selectedProduct.name,
        slug: selectedProduct.slug,
        description: selectedProduct.description,
        longDescription: selectedProduct.longDescription || "",
        price: selectedProduct.price,
        stripePaymentLinkId: selectedProduct.stripePaymentLinkId || "",
        category: selectedProduct.category as EProductCategory,
        imageUrls:
          selectedProduct.imageUrls.length > 0
            ? selectedProduct.imageUrls
            : [""],
        thumbnailUrls:
          selectedProduct.thumbnailUrls.length > 0
            ? selectedProduct.thumbnailUrls
            : [""],
        inStock: selectedProduct.inStock,
        featured: selectedProduct.featured,
        weight: selectedProduct.weight,
        tags: selectedProduct.tags || [],
        recurringInterval: selectedProduct.recurringInterval || "",
        recurringIntervalCount: selectedProduct.recurringIntervalCount || 1,
      });
    }
  }, [isEditMode, selectedProduct]);

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

  const handleInputChange = <K extends keyof IProductInput>(
    field: K,
    value: IProductInput[K],
  ) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleImageUrlChange = (
    index: number,
    value: string,
    field: "imageUrls" | "thumbnailUrls",
  ) => {
    const newUrls = [...formData[field]];
    newUrls[index] = value;
    handleInputChange(field, newUrls);
  };

  const addImageUrl = (field: "imageUrls" | "thumbnailUrls") => {
    handleInputChange(field, [...formData[field], ""]);
  };

  const removeImageUrl = (
    index: number,
    field: "imageUrls" | "thumbnailUrls",
  ) => {
    const newUrls = formData[field].filter((_, i) => i !== index);
    handleInputChange(field, newUrls.length > 0 ? newUrls : [""]);
  };

  const handleAddTag = () => {
    if (tagInput.trim() && !formData.tags.includes(tagInput.trim())) {
      handleInputChange("tags", [...formData.tags, tagInput.trim()]);
      setTagInput("");
    }
  };

  const handleRemoveTag = (tag: string) => {
    handleInputChange(
      "tags",
      formData.tags.filter((t) => t !== tag),
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);

    if (formData.price <= 0) {
      setSubmitError("Price must be greater than 0");
      return;
    }

    const productData = {
      ...formData,
      imageUrls: formData.imageUrls.filter((url) => url.trim() !== ""),
      thumbnailUrls: formData.thumbnailUrls.filter((url) => url.trim() !== ""),
    };

    if (isEditMode && productId) {
      const result = await dispatch(
        updateProduct({ id: productId, product: productData }),
      );
      if (updateProduct.rejected.match(result)) {
        setSubmitError(
          (result.payload as string) ||
            result.error?.message ||
            "Failed to update product",
        );
        return;
      }
    } else {
      const result = await dispatch(createProduct(productData));
      if (createProduct.rejected.match(result)) {
        setSubmitError(
          (result.payload as string) ||
            result.error?.message ||
            "Failed to create product",
        );
        return;
      }
    }
    onClose();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="product-form-dialog_title"
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
      data-testid="product-form-dialog"
    >
      <div
        className="bg-white rounded-2xl max-w-3xl w-full max-h-[90vh] overflow-y-auto"
        data-testid="product-form-dialog_content"
      >
        <div
          className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between"
          data-testid="product-form-dialog_header"
        >
          <h2
            id="product-form-dialog_title"
            className="font-heading text-2xl font-bold text-dark-900"
            data-testid="product-form-dialog_title"
          >
            {isEditMode ? "Edit Product" : "Add New Product"}
          </h2>
          <button
            onClick={onClose}
            aria-label="Close dialog"
            title="Close dialog"
            data-testid="product-form-dialog_close-btn"
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-dark-500" />
          </button>
        </div>

        {isEditMode && fetchingEditData ? (
          <div
            className="flex items-center justify-center h-64"
            role="status"
            aria-live="polite"
          >
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-500"></div>
            <span className="sr-only">Loading product data...</span>
          </div>
        ) : (
          <form
            onSubmit={handleSubmit}
            className="p-6 space-y-6"
            data-testid="product-form-dialog_form"
          >
            {/* Basic Info */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div data-testid="product-form-dialog_field-name">
                <label
                  htmlFor="product-name"
                  className="block text-sm font-medium text-dark-700 mb-2"
                >
                  Product Name *
                </label>
                <input
                  id="product-name"
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => handleInputChange("name", e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none"
                  placeholder="Enter product name"
                  data-testid="product-form-dialog_input-name"
                />
              </div>
              <div data-testid="product-form-dialog_field-slug">
                <label
                  htmlFor="product-slug"
                  className="block text-sm font-medium text-dark-700 mb-2"
                >
                  Slug *
                </label>
                <input
                  id="product-slug"
                  type="text"
                  required
                  value={formData.slug}
                  onChange={(e) => handleInputChange("slug", e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none"
                  placeholder="product-slug"
                  data-testid="product-form-dialog_input-slug"
                />
              </div>
            </div>

            {/* Description */}
            <div>
              <label
                htmlFor="product-description"
                className="block text-sm font-medium text-dark-700 mb-2"
              >
                Short Description *
              </label>
              <input
                id="product-description"
                type="text"
                required
                value={formData.description}
                onChange={(e) =>
                  handleInputChange("description", e.target.value)
                }
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none"
                placeholder="Short description of the product"
                data-testid="product-form-dialog_input-description"
                aria-label="Short description"
                title="Enter a short description"
              />
            </div>

            <div>
              <label
                htmlFor="product-long-description"
                className="block text-sm font-medium text-dark-700 mb-2"
              >
                Long Description
              </label>
              <textarea
                id="product-long-description"
                value={formData.longDescription}
                onChange={(e) =>
                  handleInputChange("longDescription", e.target.value)
                }
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none"
                rows={4}
                placeholder="Detailed description of the product..."
                data-testid="product-form-dialog_textarea-long-description"
                aria-label="Long description"
                title="Enter a detailed description"
              />
            </div>

            {/* Price and Category */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label
                  htmlFor="product-price"
                  className="block text-sm font-medium text-dark-700 mb-2"
                >
                  Price (cents) *
                </label>
                <input
                  id="product-price"
                  type="number"
                  required
                  min="0"
                  value={formData.price}
                  onChange={(e) =>
                    handleInputChange("price", parseInt(e.target.value) || 0)
                  }
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none"
                  placeholder="1400"
                  data-testid="product-form-dialog_input-price"
                  aria-label="Price in cents"
                  title="Enter price in cents"
                />
              </div>
              <div>
                <label
                  htmlFor="product-category"
                  className="block text-sm font-medium text-dark-700 mb-2"
                >
                  Category *
                </label>
                <select
                  id="product-category"
                  value={formData.category}
                  onChange={(e) =>
                    handleInputChange(
                      "category",
                      e.target.value as EProductCategory,
                    )
                  }
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none"
                  data-testid="product-form-dialog_select-category"
                  aria-label="Category"
                  title="Select a category"
                >
                  {categories.length === 0 ? (
                    <option value="HONEY">Honey</option>
                  ) : (
                    categories.map((cat) => (
                      <option key={cat.id} value={cat.id}>
                        {cat.label}
                      </option>
                    ))
                  )}
                </select>
              </div>
              <div>
                <label
                  htmlFor="product-weight"
                  className="block text-sm font-medium text-dark-700 mb-2"
                >
                  Weight *
                </label>
                <input
                  id="product-weight"
                  type="text"
                  required
                  value={formData.weight}
                  onChange={(e) => handleInputChange("weight", e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none"
                  placeholder="16 oz"
                  data-testid="product-form-dialog_input-weight"
                  aria-label="Weight"
                  title="Enter product weight"
                />
              </div>
            </div>

            {/* Recurring (Subscription) */}
            {formData.category === EProductCategory.SUBSCRIPTIONS && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                <div>
                  <label
                    htmlFor="product-interval"
                    className="block text-sm font-medium text-dark-700 mb-2"
                  >
                    Interval
                  </label>
                  <select
                    id="product-interval"
                    value={formData.recurringInterval || ""}
                    onChange={(e) =>
                      handleInputChange("recurringInterval", e.target.value)
                    }
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none"
                    data-testid="product-form-dialog_select-interval"
                    aria-label="Recurring interval"
                    title="Select a billing interval"
                  >
                    <option value="">Select interval...</option>
                    <option value="day">Day</option>
                    <option value="week">Week</option>
                    <option value="month">Month</option>
                    <option value="year">Year</option>
                  </select>
                </div>
                <div>
                  <label
                    htmlFor="product-interval-count"
                    className="block text-sm font-medium text-dark-700 mb-2"
                  >
                    Every
                  </label>
                  <input
                    id="product-interval-count"
                    type="number"
                    min="1"
                    value={formData.recurringIntervalCount || 1}
                    onChange={(e) =>
                      handleInputChange(
                        "recurringIntervalCount",
                        parseInt(e.target.value) || 1,
                      )
                    }
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none"
                    placeholder="1"
                    data-testid="product-form-dialog_input-interval-count"
                    aria-label="Recurring interval count"
                    title="Enter interval count"
                  />
                </div>
              </div>
            )}

            {/* Stock and Featured */}
            <div className="flex gap-6">
              <label
                htmlFor="product-inStock"
                className="flex items-center gap-2"
              >
                <input
                  id="product-inStock"
                  type="checkbox"
                  checked={formData.inStock}
                  onChange={(e) =>
                    handleInputChange("inStock", e.target.checked)
                  }
                  className="w-4 h-4 text-primary-500 border-gray-300 rounded focus:ring-primary-500"
                  data-testid="product-form-dialog_checkbox-in-stock"
                  aria-label="In Stock"
                  title="Toggle in stock status"
                />
                <span className="text-sm text-dark-700">In Stock</span>
              </label>
              <label
                htmlFor="product-featured"
                className="flex items-center gap-2"
              >
                <input
                  id="product-featured"
                  type="checkbox"
                  checked={formData.featured}
                  onChange={(e) =>
                    handleInputChange("featured", e.target.checked)
                  }
                  className="w-4 h-4 text-primary-500 border-gray-300 rounded focus:ring-primary-500"
                  data-testid="product-form-dialog_checkbox-featured"
                  aria-label="Featured product"
                  title="Toggle featured status"
                />
                <span className="text-sm text-dark-700">Featured Product</span>
              </label>
            </div>

            {/* Image URLs */}
            <div>
              <label className="block text-sm font-medium text-dark-700 mb-2">
                Image URLs
              </label>
              {formData.imageUrls.map((url, index) => (
                <div key={index} className="flex gap-2 mb-2">
                  <input
                    type="url"
                    value={url}
                    onChange={(e) =>
                      handleImageUrlChange(index, e.target.value, "imageUrls")
                    }
                    aria-label={`Image URL ${index + 1}`}
                    className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none"
                    placeholder="https://example.com/image.png"
                  />
                  <button
                    type="button"
                    onClick={() => removeImageUrl(index, "imageUrls")}
                    aria-label={`Remove image URL ${index + 1}`}
                    title={`Remove image URL ${index + 1}`}
                    className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={() => addImageUrl("imageUrls")}
                className="flex items-center gap-2 text-sm text-primary-500 hover:text-primary-600"
                title="Add image URL"
              >
                <Plus className="w-4 h-4" />
                Add Image URL
              </button>
            </div>

            {/* Thumbnail URLs */}
            <div>
              <label className="block text-sm font-medium text-dark-700 mb-2">
                Thumbnail URLs
              </label>
              {formData.thumbnailUrls.map((url, index) => (
                <div key={index} className="flex gap-2 mb-2">
                  <input
                    type="url"
                    value={url}
                    onChange={(e) =>
                      handleImageUrlChange(
                        index,
                        e.target.value,
                        "thumbnailUrls",
                      )
                    }
                    aria-label={`Thumbnail URL ${index + 1}`}
                    className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none"
                    placeholder="https://example.com/thumb.png"
                  />
                  <button
                    type="button"
                    onClick={() => removeImageUrl(index, "thumbnailUrls")}
                    aria-label={`Remove thumbnail URL ${index + 1}`}
                    title={`Remove thumbnail URL ${index + 1}`}
                    className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={() => addImageUrl("thumbnailUrls")}
                className="flex items-center gap-2 text-sm text-primary-500 hover:text-primary-600"
                title="Add thumbnail URL"
              >
                <Plus className="w-4 h-4" />
                Add Thumbnail URL
              </button>
            </div>

            {/* Stripe Payment Link ID */}
            <div>
              <label
                htmlFor="product-stripe-link"
                className="block text-sm font-medium text-dark-700 mb-2"
              >
                Stripe Payment Link ID
              </label>
              <input
                id="product-stripe-link"
                type="text"
                value={formData.stripePaymentLinkId || ""}
                onChange={(e) =>
                  handleInputChange("stripePaymentLinkId", e.target.value)
                }
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none"
                placeholder="plink_..."
                data-testid="product-form-dialog_input-stripe-link"
                aria-label="Stripe payment link ID"
                title="Enter the Stripe payment link ID"
              />
            </div>

            {/* Tags */}
            <div>
              <label
                htmlFor="product-tags-input"
                className="block text-sm font-medium text-dark-700 mb-2"
              >
                Tags
              </label>
              <div className="flex gap-2 mb-2">
                <input
                  id="product-tags-input"
                  type="text"
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleAddTag();
                    }
                  }}
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none"
                  placeholder="Add a tag"
                  data-testid="product-form-dialog_input-tags"
                  aria-label="Add a tag"
                  title="Type a tag name and press Enter"
                />
                <button
                  type="button"
                  onClick={handleAddTag}
                  aria-label="Add tag"
                  title="Add tag"
                  className="px-4 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600 transition-colors"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                {formData.tags.map((tag) => (
                  <span
                    key={tag}
                    className="inline-flex items-center gap-1 px-3 py-1 bg-gray-100 text-dark-700 rounded-full text-sm"
                  >
                    {tag}
                    <button
                      type="button"
                      onClick={() => handleRemoveTag(tag)}
                      aria-label={`Remove tag ${tag}`}
                      className="text-dark-400 hover:text-dark-600"
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            </div>

            {/* Error display */}
            {submitError && (
              <div
                role="alert"
                className="p-4 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2"
                data-testid="product-form-dialog_error"
              >
                <span className="text-red-600 text-sm flex-1">
                  {submitError}
                </span>
                <button
                  type="button"
                  onClick={() => setSubmitError(null)}
                  aria-label="Dismiss error"
                  title="Dismiss error"
                  className="text-red-400 hover:text-red-600"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}

            {/* Actions */}
            <div
              className="flex gap-3 justify-end border-t border-gray-200 pt-6"
              data-testid="product-form-dialog_actions"
            >
              <button
                type="button"
                onClick={onClose}
                data-testid="product-form-dialog_cancel-btn"
                className="px-6 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading}
                data-testid="product-form-dialog_submit-btn"
                className="px-6 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading
                  ? "Saving..."
                  : isEditMode
                    ? "Update Product"
                    : "Create Product"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
