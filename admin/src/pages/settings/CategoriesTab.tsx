/** Tab for managing product categories with ID and label fields */
import { Plus, Trash2 } from "lucide-react";
import type { ICategory } from "../../types/settings";
import { TextField } from "../../components/forms";

/** Props for {@link CategoriesTab}; CRUD callbacks are owned by the parent. */
export interface ICategoriesTabProps {
  /** Current category list being edited. */
  categoriesContent: ICategory[];
  /** Append a new blank category row. */
  addCategoryItem: () => void;
  /** Update one field of the category at `index`. */
  updateCategoryItem: (
    index: number,
    field: keyof ICategory,
    value: string,
  ) => void;
  /** Remove the category at `index`. */
  removeCategoryItem: (index: number) => void;
}

/**
 * Settings tab for editing the store's product categories (id + label pairs).
 * Purely presentational — add/update/remove are delegated to the parent so the
 * draft and its dirty/save lifecycle stay centralized on SettingsPage.
 */
export function CategoriesTab({
  categoriesContent,
  addCategoryItem,
  updateCategoryItem,
  removeCategoryItem,
}: ICategoriesTabProps) {
  return (
    <div className="space-y-4" data-testid="categories-tab">
      <p className="text-sm text-dark-500 mb-4">
        Define and manage product categories used across the store.
      </p>
      {categoriesContent.map((cat, i) => (
        <div
          key={cat.id || `new-${i}`}
          className="p-4 border border-gray-200 rounded-lg dark:border-gray-700"
        >
          <div className="flex items-center justify-between mb-3">
            <span className="font-medium text-dark-700">Category {i + 1}</span>
            <button
              onClick={() => removeCategoryItem(i)}
              aria-label={`Remove category ${i + 1}`}
              title={`Remove category ${i + 1}`}
              className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg dark:hover:bg-red-900/30"
            >
              <Trash2 className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <TextField
              label="ID (e.g. HONEY)"
              value={cat.id}
              onChange={(v) => updateCategoryItem(i, "id", v)}
              placeholder="HONEY"
            />
            <TextField
              label="Label (e.g. Honey)"
              value={cat.label}
              onChange={(v) => updateCategoryItem(i, "label", v)}
              placeholder="Honey"
            />
          </div>
        </div>
      ))}
      <button
        onClick={addCategoryItem}
        data-testid="categories-tab_add-btn"
        className="flex items-center gap-1 text-sm text-primary-600 hover:text-primary-700 dark:text-primary-400 dark:hover:text-primary-300"
      >
        <Plus className="w-4 h-4" aria-hidden="true" /> Add Category
      </button>
    </div>
  );
}
