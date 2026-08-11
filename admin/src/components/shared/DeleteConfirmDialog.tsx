/** Confirmation modal for destructive delete actions. Accessible with role="dialog" and aria-labelledby. */
import { useEffect, useRef } from "react";

export interface IDeleteConfirmDialogProps {
  /** Whether the dialog is visible */
  isOpen: boolean;
  /** Name of the product being deleted (displayed in the confirmation message) */
  productName: string;
  /** Cancel/close handler */
  onCancel: () => void;
  /** Confirm delete handler */
  onConfirm: () => void;
}

/**
 * Modal that gates a destructive delete behind an explicit confirm. Renders
 * nothing while `isOpen` is false. On open it moves focus to the Cancel
 * (non-destructive) button and binds Escape-to-dismiss, the baseline a11y
 * behaviors for a `role="dialog"` overlay.
 */
export function DeleteConfirmDialog({
  isOpen,
  productName,
  onCancel,
  onConfirm,
}: IDeleteConfirmDialogProps) {
  // Move focus to the non-destructive Cancel button when the dialog opens, and
  // allow Escape to dismiss — both are baseline modal accessibility behaviors.
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    cancelRef.current?.focus();
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [isOpen, onCancel]);

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="delete-confirm-dialog_title"
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
      data-testid="delete-confirm-dialog"
    >
      <div
        className="bg-white rounded-xl p-6 max-w-md w-full mx-4 border border-gray-200 dark:bg-dark-950 dark:border-gray-700"
        data-testid="delete-confirm-dialog_content"
      >
        <h3
          id="delete-confirm-dialog_title"
          className="font-heading text-xl font-semibold mb-4 dark:text-dark-800"
          data-testid="delete-confirm-dialog_title"
        >
          Confirm Delete
        </h3>
        <p
          className="text-dark-600 mb-6"
          data-testid="delete-confirm-dialog_message"
        >
          Are you sure you want to delete "{productName}"? This action cannot be
          undone.
        </p>
        <div className="flex gap-3 justify-end">
          <button
            ref={cancelRef}
            onClick={onCancel}
            data-testid="delete-confirm-dialog_cancel-btn"
            className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors dark:border-gray-600 dark:hover:bg-dark-800 dark:text-dark-800"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            data-testid="delete-confirm-dialog_confirm-btn"
            className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors dark:bg-red-600 dark:hover:bg-red-700"
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}
