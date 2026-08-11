/** Tab for managing "From Hive to Table" process steps with title, description, and icon */
import { Plus, Trash2 } from "lucide-react";
import type { IProcessStep } from "../../types/settings";
import { TextField, TextAreaField } from "../../components/forms";

/** Props for {@link ProcessTab}; CRUD callbacks are owned by the parent. */
export interface IProcessTabProps {
  /** Current "From Hive to Table" process steps being edited. */
  processContent: IProcessStep[];
  /** Append a new blank process step. */
  addProcessStep: () => void;
  /** Update one field of the step at `index`. */
  updateProcessStep: <K extends keyof IProcessStep>(
    index: number,
    field: K,
    value: IProcessStep[K],
  ) => void;
  /** Remove the step at `index`. */
  removeProcessStep: (index: number) => void;
}

/**
 * Settings tab for editing the storefront's "From Hive to Table" process steps
 * (title, icon, description). Presentational only — mutations are delegated to
 * the parent so draft state and saving live on SettingsPage.
 */
export function ProcessTab({
  processContent,
  addProcessStep,
  updateProcessStep,
  removeProcessStep,
}: IProcessTabProps) {
  return (
    <div className="space-y-4" data-testid="process-tab">
      {processContent.map((step, i) => (
        <div
          key={step.id}
          className="p-4 border border-gray-200 rounded-lg dark:border-gray-700"
        >
          <div className="flex items-center justify-between mb-3">
            <span className="font-medium text-dark-700">Step {step.step}</span>
            <button
              onClick={() => removeProcessStep(i)}
              aria-label={`Remove process step ${i + 1}`}
              title={`Remove process step ${i + 1}`}
              className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg dark:hover:bg-red-900/30"
            >
              <Trash2 className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <TextField
              label="Title"
              value={step.title}
              onChange={(v) =>
                updateProcessStep(i, "title", v as IProcessStep["title"])
              }
            />
            <TextField
              label="Icon"
              value={step.icon}
              onChange={(v) =>
                updateProcessStep(i, "icon", v as IProcessStep["icon"])
              }
            />
          </div>
          <div className="mt-4">
            <TextAreaField
              label="Description"
              value={step.description}
              onChange={(v) =>
                updateProcessStep(
                  i,
                  "description",
                  v as IProcessStep["description"],
                )
              }
            />
          </div>
        </div>
      ))}
      <button
        onClick={addProcessStep}
        data-testid="process-tab_add-btn"
        className="flex items-center gap-1 text-sm text-primary-600 hover:text-primary-700 dark:text-primary-400 dark:hover:text-primary-300"
      >
        <Plus className="w-4 h-4" aria-hidden="true" /> Add Step
      </button>
    </div>
  );
}
