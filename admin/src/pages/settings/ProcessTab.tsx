/** Tab for managing "From Hive to Table" process steps with title, description, and icon */
import { Plus, Trash2 } from "lucide-react";
import type { IProcessStep } from "../../types/settings";
import { TextField, TextAreaField } from "../../components/forms";

export interface IProcessTabProps {
  processContent: IProcessStep[];
  addProcessStep: () => void;
  updateProcessStep: <K extends keyof IProcessStep>(
    index: number,
    field: K,
    value: IProcessStep[K],
  ) => void;
  removeProcessStep: (index: number) => void;
}

export function ProcessTab({
  processContent,
  addProcessStep,
  updateProcessStep,
  removeProcessStep,
}: IProcessTabProps) {
  return (
    <div className="space-y-4" data-testid="process-tab">
      {processContent.map((step, i) => (
        <div key={step.id} className="p-4 border border-gray-200 rounded-lg">
          <div className="flex items-center justify-between mb-3">
            <span className="font-medium text-dark-700">Step {step.step}</span>
            <button
              onClick={() => removeProcessStep(i)}
              aria-label={`Remove process step ${i + 1}`}
              title={`Remove process step ${i + 1}`}
              className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg"
            >
              <Trash2 className="w-4 h-4" />
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
        className="flex items-center gap-1 text-sm text-primary-600 hover:text-primary-700"
      >
        <Plus className="w-4 h-4" /> Add Step
      </button>
    </div>
  );
}
