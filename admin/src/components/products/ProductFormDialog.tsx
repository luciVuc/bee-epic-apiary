/** Modal dialog for creating and editing products. Handles Stripe product + price creation in sequence. */
import { useState, useEffect, useMemo, useCallback, useRef } from "react";
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
import { CATEGORIES } from "../../utils/constants";
import * as api from "../../utils/api";

/** Props for {@link ProductFormDialog}. */
export interface IProductFormDialogProps {
  /** Stripe product id to edit; omit for create mode. */
  productId?: string;
  /** Close handler (also called after a successful create/update). */
  onClose: () => void;
}

/** Shallow equality check for arrays of primitives. Hoisted above the
 *  component so it doesn't get redeclared on every render and so the
 *  hook below can reference it without the React-Hooks linter
 *  complaining about a function defined after the hooks that use it. */
function arraysEqual<T>(a: T[], b: T[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

const INITIAL_FORM_DATA: IProductInput = {
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
};

interface IUrlInputListProps {
  id: string;
  urls: string[];
  label: string;
  inputLabel: string;
  placeholder: string;
  addButtonLabel: string;
  removeButtonLabelPrefix: string;
  onUrlChange: (index: number, value: string) => void;
  onAdd: () => void;
  onRemove: (index: number) => void;
}

/**
 * Repeating list of URL inputs with per-row remove and an add button. Backs
 * both the image and thumbnail URL fields in {@link ProductFormDialog}; the
 * caller owns the array and the change/add/remove callbacks.
 */
function UrlInputList({
  id,
  urls,
  label,
  inputLabel,
  placeholder,
  addButtonLabel,
  removeButtonLabelPrefix,
  onUrlChange,
  onAdd,
  onRemove,
}: IUrlInputListProps) {
  return (
    <div data-testid={`product-form-dialog_url-input-list-${id}`}>
      <label className="block text-sm font-medium text-dark-700 mb-2">
        {label}
      </label>
      {urls.map((url, index) => (
        <div key={index} className="flex gap-2 mb-2">
          <label htmlFor={`${id}-${index}`} className="sr-only">
            {`${inputLabel} ${index + 1}`}
          </label>
          <input
            id={`${id}-${index}`}
            type="url"
            value={url}
            onChange={(e) => onUrlChange(index, e.target.value)}
            aria-label={`${inputLabel} ${index + 1}`}
            className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none dark:border-gray-600 dark:bg-dark-100 dark:text-dark-900 dark:focus:ring-primary-400 dark:focus:border-primary-400"
            placeholder={placeholder}
          />
          <button
            type="button"
            onClick={() => onRemove(index)}
            aria-label={`${removeButtonLabelPrefix} ${index + 1}`}
            title={`${removeButtonLabelPrefix} ${index + 1}`}
            className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors dark:hover:bg-red-900/30"
          >
            <Trash2 className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={onAdd}
        className="flex items-center gap-2 text-sm text-primary-500 hover:text-primary-600 dark:text-primary-400 dark:hover:text-primary-300"
        title={`Add ${inputLabel.toLowerCase()}`}
      >
        <Plus className="w-4 h-4" aria-hidden="true" />
        {addButtonLabel}
      </button>
    </div>
  );
}

/**
 * Create/edit modal for a product. In edit mode it fetches the product and
 * seeds the form exactly once per `productId` (guarded by a ref) so a
 * background refetch can't clobber unsaved edits (review I4), and the Submit
 * button stays disabled until something actually changes (`hasChanges`). Price
 * is entered in integer cents with digit-only enforcement (review I14).
 * Submitting dispatches create or update and closes on success; the underlying
 * API sequences the Stripe product + price writes.
 */
export function ProductFormDialog({
  productId,
  onClose,
}: IProductFormDialogProps) {
  const dispatch = useDispatch<AppDispatch>();
  const { selectedProduct, loading } = useSelector(
    (state: RootState) => state.products,
  );
  const isEditMode = !!productId;

  const [formData, setFormData] = useState<IProductInput>(INITIAL_FORM_DATA);
  const [categories, setCategories] = useState<ICategory[]>([]);
  const [categoryFetchError, setCategoryFetchError] = useState<string | null>(
    null,
  );
  const [tagInput, setTagInput] = useState("");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [fetchingEditData, setFetchingEditData] = useState(false);

  // Check if form has changed compared to original product data (edit mode only)
  const hasChanges = useMemo(() => {
    if (!isEditMode || !selectedProduct) return true; // In add mode, always allow submit if valid

    // Deep comparison of formData vs selectedProduct
    return (
      formData.name !== selectedProduct.name ||
      formData.slug !== selectedProduct.slug ||
      formData.description !== selectedProduct.description ||
      formData.longDescription !== (selectedProduct.longDescription || "") ||
      formData.price !== selectedProduct.price ||
      formData.stripePaymentLinkId !==
        (selectedProduct.stripePaymentLinkId || "") ||
      formData.category !== selectedProduct.category ||
      !arraysEqual(formData.imageUrls, selectedProduct.imageUrls) ||
      !arraysEqual(formData.thumbnailUrls, selectedProduct.thumbnailUrls) ||
      formData.inStock !== selectedProduct.inStock ||
      formData.featured !== selectedProduct.featured ||
      formData.weight !== selectedProduct.weight ||
      !arraysEqual(formData.tags, selectedProduct.tags || []) ||
      formData.recurringInterval !==
        (selectedProduct.recurringInterval || "") ||
      formData.recurringIntervalCount !==
        (selectedProduct.recurringIntervalCount || 1)
    );
  }, [isEditMode, selectedProduct, formData]);

  useEffect(() => {
    setTagInput("");
  }, [productId]);

  useEffect(() => {
    setSubmitError(null);
    if (!productId) {
      setFormData(INITIAL_FORM_DATA);
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

  // Seed the form ONCE per productId. Without this gate, every reference
  // change of `selectedProduct` (e.g. a background fetchProductById landing
  // while the admin is mid-edit, or any sibling slice action that produces a
  // new reference) would clobber unsaved edits with the freshly-fetched
  // values (review I4).
  const seededFor = useRef<string | null>(null);
  useEffect(() => {
    if (!isEditMode || !selectedProduct || selectedProduct.id !== productId)
      return;
    if (seededFor.current === productId) return;
    seededFor.current = productId ?? null;
    setFormData({
      name: selectedProduct.name,
      slug: selectedProduct.slug,
      description: selectedProduct.description,
      longDescription: selectedProduct.longDescription || "",
      price: selectedProduct.price,
      stripePaymentLinkId: selectedProduct.stripePaymentLinkId || "",
      category: selectedProduct.category as EProductCategory,
      imageUrls:
        selectedProduct.imageUrls.length > 0 ? selectedProduct.imageUrls : [""],
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
  }, [isEditMode, selectedProduct, productId]);

  // Reset the seeding ref when the dialog switches productId or leaves edit
  // mode entirely so a reopen on a different product re-seeds.
  useEffect(() => {
    return () => {
      seededFor.current = null;
    };
  }, [productId]);

  useEffect(() => {
    setCategoryFetchError(null);
    api.api
      .getSettings<ICategory[]>("categories")
      .then((cats) => {
        setCategories(cats || []);
      })
      .catch(() => {
        setCategories([]);
        setCategoryFetchError("Failed to load categories. Using defaults.");
      });
  }, []);

  const handleInputChange = useCallback(
    <K extends keyof IProductInput>(field: K, value: IProductInput[K]) => {
      setFormData((prev) => ({ ...prev, [field]: value }));
      // A prior submit error is stale the moment the user edits any field —
      // clear it so the banner doesn't linger while they fix the input.
      setSubmitError(null);
    },
    [],
  );

  const handleImageUrlChange = useCallback(
    (index: number, value: string, field: "imageUrls" | "thumbnailUrls") => {
      setFormData((prev) => {
        const newUrls = [...prev[field]];
        newUrls[index] = value;
        return { ...prev, [field]: newUrls };
      });
    },
    [],
  );

  const addImageUrl = useCallback((field: "imageUrls" | "thumbnailUrls") => {
    setFormData((prev) => ({
      ...prev,
      [field]: [...prev[field], ""],
    }));
  }, []);

  const removeImageUrl = useCallback(
    (index: number, field: "imageUrls" | "thumbnailUrls") => {
      setFormData((prev) => {
        const newUrls = prev[field].filter((_, i) => i !== index);
        return { ...prev, [field]: newUrls.length > 0 ? newUrls : [""] };
      });
    },
    [],
  );

  const handleAddTag = useCallback(() => {
    const trimmed = tagInput.trim();
    if (trimmed) {
      setFormData((prev) => {
        if (prev.tags.includes(trimmed)) return prev;
        return { ...prev, tags: [...prev.tags, trimmed] };
      });
      setTagInput("");
    }
  }, [tagInput]);

  const handleRemoveTag = useCallback((tag: string) => {
    setFormData((prev) => ({
      ...prev,
      tags: prev.tags.filter((t) => t !== tag),
    }));
  }, []);

  // Validate form data
  const validateForm = (): string | null => {
    if (!formData.name.trim()) {
      return "Product name is required";
    }
    if (!formData.slug.trim()) {
      return "Slug is required";
    }
    if (!formData.description.trim()) {
      return "Short description is required";
    }
    if (formData.price <= 0) {
      return "Price must be greater than 0";
    }
    if (!formData.weight.trim()) {
      return "Weight is required";
    }
    if (!formData.category) {
      return "Category is required";
    }
    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const validationError = validateForm();
    if (validationError) {
      setSubmitError(validationError);
      return;
    }
    setSubmitError(null);

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
        className="bg-white rounded-2xl max-w-3xl w-full max-h-[90vh] flex flex-col overflow-hidden border border-gray-200 dark:bg-dark-950 dark:border-gray-700"
        data-testid="product-form-dialog_content"
      >
        <div
          className="shrink-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between dark:bg-dark-950 dark:border-gray-700"
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
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors dark:hover:bg-dark-200"
          >
            <X
              className="w-5 h-5 text-dark-500 dark:text-dark-400"
              aria-hidden="true"
            />
          </button>
        </div>

        {isEditMode && fetchingEditData ? (
          <div
            className="flex items-center justify-center h-64 overflow-y-auto"
            role="status"
            aria-live="polite"
          >
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-500 dark:border-primary-400"></div>
            <span className="sr-only">Loading product data...</span>
          </div>
        ) : (
          <form
            onSubmit={handleSubmit}
            className="p-6 space-y-6 overflow-y-auto flex-1 min-h-0"
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
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none dark:border-gray-600 dark:bg-dark-100 dark:text-dark-900 dark:focus:ring-primary-400 dark:focus:border-primary-400"
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
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none dark:border-gray-600 dark:bg-dark-100 dark:text-dark-900 dark:focus:ring-primary-400 dark:focus:border-primary-400"
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
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none dark:border-gray-600 dark:bg-dark-100 dark:text-dark-900 dark:focus:ring-primary-400 dark:focus:border-primary-400"
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
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none dark:border-gray-600 dark:bg-dark-100 dark:text-dark-900 dark:focus:ring-primary-400 dark:focus:border-primary-400"
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
                  type="text"
                  required
                  inputMode="numeric"
                  pattern="\d+"
                  value={formData.price}
                  onChange={(e) => {
                    // Digits-only — the previous type=number let the browser
                    // surface "1.5", "1e10", or "-3", all silently becoming
                    // non-integer cents downstream and creating Stripe Price
                    // records the admin couldn't reconcile (review I14).
                    const v = e.target.value.replace(/[^\d]/g, "");
                    handleInputChange("price", v === "" ? 0 : Number(v));
                  }}
                  onPaste={(e) => {
                    const pasted = e.clipboardData
                      .getData("text")
                      .replace(/[^\d]/g, "");
                    if (pasted === "") {
                      e.preventDefault();
                    }
                    // Else let the default paste run; the onChange handler
                    // will strip non-digits again — idempotent.
                  }}
                  aria-describedby="price-hint"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none dark:border-gray-600 dark:bg-dark-100 dark:text-dark-900 dark:focus:ring-primary-400 dark:focus:border-primary-400"
                  placeholder="1400"
                  data-testid="product-form-dialog_input-price"
                  aria-label="Price in cents"
                  title="Enter price in cents"
                />
                <small
                  id="price-hint"
                  className="block text-xs text-dark-500 mt-1"
                >
                  Enter the price in cents (e.g. 1499 = $14.99).
                </small>
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
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none dark:border-gray-600 dark:bg-dark-100 dark:text-dark-900 dark:focus:ring-primary-400 dark:focus:border-primary-400"
                  data-testid="product-form-dialog_select-category"
                  aria-label="Category"
                  title="Select a category"
                >
                  {categories.length === 0
                    ? CATEGORIES.map((cat) => (
                        <option key={cat.id} value={cat.id}>
                          {cat.label}
                        </option>
                      ))
                    : categories.map((cat) => (
                        <option key={cat.id} value={cat.id}>
                          {cat.label}
                        </option>
                      ))}
                </select>
                {categoryFetchError && (
                  <p role="alert" className="text-sm text-amber-600 mt-1">
                    {categoryFetchError}
                  </p>
                )}
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
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none dark:border-gray-600 dark:bg-dark-100 dark:text-dark-900 dark:focus:ring-primary-400 dark:focus:border-primary-400"
                  placeholder="16 oz"
                  data-testid="product-form-dialog_input-weight"
                  aria-label="Weight"
                  title="Enter product weight"
                />
              </div>
            </div>

            {/* Recurring (Subscription) */}
            {formData.category === EProductCategory.SUBSCRIPTIONS && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 bg-blue-50 border border-blue-200 rounded-lg dark:bg-blue-900/20 dark:border-blue-800/30">
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
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none dark:border-gray-600 dark:bg-dark-100 dark:text-dark-900 dark:focus:ring-primary-400 dark:focus:border-primary-400"
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
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none dark:border-gray-600 dark:bg-dark-100 dark:text-dark-900 dark:focus:ring-primary-400 dark:focus:border-primary-400"
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
                  className="w-4 h-4 text-primary-500 border-gray-300 rounded focus:ring-primary-500 dark:border-gray-600 dark:bg-dark-100 dark:focus:ring-primary-400"
                  data-testid="product-form-dialog_checkbox-in-stock"
                  aria-label="In Stock"
                  title="Toggle in stock status"
                />
                <span className="text-sm text-dark-700 dark:text-dark-800">
                  In Stock
                </span>
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
                  className="w-4 h-4 text-primary-500 border-gray-300 rounded focus:ring-primary-500 dark:border-gray-600 dark:bg-dark-100 dark:focus:ring-primary-400"
                  data-testid="product-form-dialog_checkbox-featured"
                  aria-label="Featured product"
                  title="Toggle featured status"
                />
                <span className="text-sm text-dark-700 dark:text-dark-800">
                  Featured Product
                </span>
              </label>
            </div>

            {/* Image URLs */}
            <UrlInputList
              id="product-image-url"
              urls={formData.imageUrls}
              label="Image URLs"
              inputLabel="Image URL"
              placeholder="https://example.com/image.png"
              addButtonLabel="Add Image URL"
              removeButtonLabelPrefix="Remove image URL"
              onUrlChange={(index, value) =>
                handleImageUrlChange(index, value, "imageUrls")
              }
              onAdd={() => addImageUrl("imageUrls")}
              onRemove={(index) => removeImageUrl(index, "imageUrls")}
            />

            {/* Thumbnail URLs */}
            <UrlInputList
              id="product-thumbnail-url"
              urls={formData.thumbnailUrls}
              label="Thumbnail URLs"
              inputLabel="Thumbnail URL"
              placeholder="https://example.com/thumb.png"
              addButtonLabel="Add Thumbnail URL"
              removeButtonLabelPrefix="Remove thumbnail URL"
              onUrlChange={(index, value) =>
                handleImageUrlChange(index, value, "thumbnailUrls")
              }
              onAdd={() => addImageUrl("thumbnailUrls")}
              onRemove={(index) => removeImageUrl(index, "thumbnailUrls")}
            />

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
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none dark:border-gray-600 dark:bg-dark-100 dark:text-dark-900 dark:focus:ring-primary-400 dark:focus:border-primary-400"
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
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none dark:border-gray-600 dark:bg-dark-100 dark:text-dark-900 dark:focus:ring-primary-400 dark:focus:border-primary-400"
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
                  <Plus className="w-4 h-4" aria-hidden="true" />
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                {formData.tags.map((tag) => (
                  <span
                    key={tag}
                    className="inline-flex items-center gap-1 px-3 py-1 bg-gray-100 text-dark-700 rounded-full text-sm dark:bg-dark-200 dark:text-dark-800"
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
                className="p-4 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2 dark:bg-red-900/20 dark:border-red-800/30"
                data-testid="product-form-dialog_error"
              >
                <span className="text-red-600 text-sm flex-1 dark:text-red-400">
                  {submitError}
                </span>
                <button
                  type="button"
                  onClick={() => setSubmitError(null)}
                  aria-label="Dismiss error"
                  title="Dismiss error"
                  className="text-red-400 hover:text-red-600"
                >
                  <X className="w-4 h-4" aria-hidden="true" />
                </button>
              </div>
            )}

            {/* Actions */}
            <div
              className="flex gap-3 justify-end border-t border-gray-200 pt-6 dark:border-gray-700"
              data-testid="product-form-dialog_actions"
            >
              <button
                type="button"
                onClick={onClose}
                data-testid="product-form-dialog_cancel-btn"
                className="px-6 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors dark:border-gray-600 dark:hover:bg-dark-200 dark:text-dark-800"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={
                  loading || (isEditMode && !hasChanges) // In edit mode: disable if no changes
                }
                data-testid="product-form-dialog_submit_btn"
                className="px-6 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed dark:bg-primary-600 dark:hover:bg-primary-700"
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
