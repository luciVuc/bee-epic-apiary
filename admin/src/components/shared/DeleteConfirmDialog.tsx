interface DeleteConfirmDialogProps {
  isOpen: boolean;
  productName: string;
  onCancel: () => void;
  onConfirm: () => void;
}

export function DeleteConfirmDialog({
  isOpen,
  productName,
  onCancel,
  onConfirm,
}: DeleteConfirmDialogProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl p-6 max-w-md w-full mx-4">
        <h3 className="font-heading text-xl font-semibold mb-4">
          Confirm Delete
        </h3>
        <p className="text-dark-600 mb-6">
          Are you sure you want to delete "{productName}"? This action cannot be
          undone.
        </p>
        <div className="flex gap-3 justify-end">
          <button
            onClick={onCancel}
            className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors"
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}
