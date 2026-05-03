import { useState, useEffect } from "react";
import { useDispatch, useSelector } from "react-redux";
import { X, Plus, Trash2 } from "lucide-react";
import type { RootState, AppDispatch } from "../../store";
import {
  createProduct,
  updateProduct,
  fetchProductById,
} from "../../store/productsSlice";
import type { IProductInput, EProductCategory } from "../../types";

interface ProductFormDialogProps {
  productId?: string;
  onClose: () => void;
}

export function ProductFormDialog({
  productId,
  onClose,
}: ProductFormDialogProps) {
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
    category: "HONEY" as EProductCategory,
    imageUrls: [""],
    thumbnailUrls: [""],
    inStock: true,
    featured: false,
    weight: "",
    tags: [],
  });
  const [tagInput, setTagInput] = useState("");

  useEffect(() => {
    if (productId) {
      dispatch(fetchProductById(productId));
    }
  }, [dispatch, productId]);

  useEffect(() => {
    if (isEditMode && selectedProduct) {
      setFormData({
        name: selectedProduct.name,
        slug: selectedProduct.slug,
        description: selectedProduct.description,
        longDescription: selectedProduct.longDescription || "",
        price: selectedProduct.price,
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
      });
    }
  }, [isEditMode, selectedProduct]);

  const handleInputChange = (field: keyof IProductInput, value: any) => {
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

    const productData = {
      ...formData,
      imageUrls: formData.imageUrls.filter((url) => url.trim() !== ""),
      thumbnailUrls: formData.thumbnailUrls.filter((url) => url.trim() !== ""),
    };

    if (isEditMode && productId) {
      await dispatch(updateProduct({ id: productId, product: productData }));
    } else {
      await dispatch(createProduct(productData));
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl max-w-3xl w-full max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
          <h2 className="font-heading text-2xl font-bold text-dark-900">
            {isEditMode ? "Edit Product" : "Add New Product"}
          </h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-dark-500" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* Basic Info */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-dark-700 mb-2">
                Product Name *
              </label>
              <input
                type="text"
                required
                value={formData.name}
                onChange={(e) => handleInputChange("name", e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none"
                placeholder="Wildflower Raw Honey"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-dark-700 mb-2">
                Slug *
              </label>
              <input
                type="text"
                required
                value={formData.slug}
                onChange={(e) => handleInputChange("slug", e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:details focus:border-primary-500 outline-none"
                placeholder="wildflower-raw-honey"
              />
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-dark-700 mb-2">
              Short Description *
            </label>
            <input
              type="text"
              required
              value={formData.description}
              onChange={(e) => handleInputChange("description", e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none"
              placeholder="A beautiful blend of nectar from Bay Area's wild meadows"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-dark-700 mb-2">
              Long Description
            </label>
            <textarea
              value={formData.longDescription}
              onChange={(e) =>
                handleInputChange("longDescription", e.target.value)
              }
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none"
              rows={4}
              placeholder="Detailed description of the product..."
            />
          </div>

          {/* Price and Category */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-dark-700 mb-2">
                Price (cents) *
              </label>
              <input
                type="number"
                required
                min="0"
                value={formData.price}
                onChange={(e) =>
                  handleInputChange("price", parseInt(e.target.value) || 0)
                }
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none"
                placeholder="1400"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-dark-700 mb-2">
                Category *
              </label>
              <select
                value={formData.category}
                onChange={(e) =>
                  handleInputChange(
                    "category",
                    e.target.value as EProductCategory,
                  )
                }
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none"
              >
                <option value="HONEY">Honey</option>
                <option value="BEESWAX">Beeswax</option>
                <option value="GIFTS">Gift Sets</option>
                <option value="SUBSCRIPTIONS">Subscriptions</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-dark-700 mb-2">
                Weight *
              </label>
              <input
                type="text"
                required
                value={formData.weight}
                onChange={(e) => handleInputChange("weight", e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none"
                placeholder="16 oz"
              />
            </div>
          </div>

          {/* Stock and Featured */}
          <div className="flex gap-6">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={formData.inStock}
                onChange={(e) => handleInputChange("inStock", e.target.checked)}
                className="w-4 h-4 text-primary-500 border-gray-300 rounded focus:ring-primary-500"
              />
              <span className="text-sm text-dark-700">In Stock</span>
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={formData.featured}
                onChange={(e) =>
                  handleInputChange("featured", e.target.checked)
                }
                className="w-4 h-4 text-primary-500 border-gray-300 rounded focus:ring-primary-500"
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
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none"
                  placeholder="https://example.com/image.png"
                />
                <button
                  type="button"
                  onClick={() => removeImageUrl(index, "imageUrls")}
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
                    handleImageUrlChange(index, e.target.value, "thumbnailUrls")
                  }
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none"
                  placeholder="https://example.com/thumb.png"
                />
                <button
                  type="button"
                  onClick={() => removeImageUrl(index, "thumbnailUrls")}
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
            >
              <Plus className="w-4 h-4" />
              Add Thumbnail URL
            </button>
          </div>

          {/* Tags */}
          <div>
            <label className="block text-sm font-medium text-dark-700 mb-2">
              Tags
            </label>
            <div className="flex gap-2 mb-2">
              <input
                type="text"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyPress={(e) => e.key === "Enter" && handleAddTag()}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none"
                placeholder="Add a tag"
              />
              <button
                type="button"
                onClick={handleAddTag}
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
                    className="text-dark-400 hover:text-dark-600"
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-3 justify-end border-t border-gray-200 pt-6">
            <button
              type="button"
              onClick={onClose}
              className="px-6 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
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
      </div>
    </div>
  );
}
