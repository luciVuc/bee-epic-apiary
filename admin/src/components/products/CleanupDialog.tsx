/** Preview-then-confirm dialog for removing un-priced (unsellable) products.
 * On open it fetches a dry-run preview (count + names); confirming dispatches
 * the cleanup thunk which deletes them on Stripe and refreshes the list. */
import { useEffect, useState } from "react";
import { useDispatch } from "react-redux";
import { AlertCircle, Trash2 } from "lucide-react";
import type { AppDispatch } from "../../store";
import { cleanupProducts } from "../../store/productsSlice";
import { api, apiErrorMessage } from "../../utils/api";
import type { IProductCleanupCandidate } from "../../utils/api";

export interface ICleanupDialogProps {
  /** Whether the dialog is visible */
  isOpen: boolean;
  /** Close handler */
  onClose: () => void;
}

/**
 * Preview-then-confirm modal for removing un-priced (unsellable) products. On
 * open it runs a dry-run cleanup to list the candidates; confirming dispatches
 * the real `cleanupProducts` thunk (delete on Stripe, archive on refusal) and
 * closes on success. Renders nothing while closed.
 */
export function CleanupDialog({ isOpen, onClose }: ICleanupDialogProps) {
  const dispatch = useDispatch<AppDispatch>();
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [applying, setApplying] = useState(false);
  const [candidates, setCandidates] = useState<IProductCleanupCandidate[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    setLoadingPreview(true);
    setError(null);
    api
      .cleanupProducts(true)
      .then((result) => {
        if (cancelled) return;
        setCandidates(result.candidates ?? []);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(apiErrorMessage(err, "Failed to load cleanup preview"));
      })
      .finally(() => {
        if (!cancelled) setLoadingPreview(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const handleConfirm = async () => {
    setApplying(true);
    setError(null);
    const action = await dispatch(cleanupProducts());
    setApplying(false);
    if (cleanupProducts.rejected.match(action)) {
      setError((action.payload as string) || "Failed to clean up products");
      return;
    }
    onClose();
  };

  const count = candidates.length;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="cleanup-dialog_title"
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
      data-testid="cleanup-dialog"
    >
      <div
        className="bg-white rounded-xl p-6 max-w-md w-full mx-4 border border-gray-200 dark:bg-dark-950 dark:border-gray-700"
        data-testid="cleanup-dialog_content"
      >
        <h3
          id="cleanup-dialog_title"
          className="font-heading text-xl font-semibold mb-4 dark:text-dark-800"
          data-testid="cleanup-dialog_title"
        >
          Clean Up Un-priced Products
        </h3>

        {error && (
          <div
            role="alert"
            className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 dark:bg-red-900/20 dark:border-red-800/30"
            data-testid="cleanup-dialog_error"
          >
            <AlertCircle
              className="w-4 h-4 text-red-500 shrink-0"
              aria-hidden="true"
            />
            <span className="text-sm text-red-700 dark:text-red-300">
              {error}
            </span>
          </div>
        )}

        {loadingPreview ? (
          <p
            className="text-dark-600 mb-6"
            data-testid="cleanup-dialog_loading"
          >
            Scanning for un-priced products…
          </p>
        ) : count === 0 ? (
          <p className="text-dark-600 mb-6" data-testid="cleanup-dialog_empty">
            Nothing to clean up — every product has a price.
          </p>
        ) : (
          <>
            <p
              className="text-dark-600 mb-3"
              data-testid="cleanup-dialog_message"
            >
              Products with no price are never shown in the store. The following{" "}
              {count} product{count === 1 ? "" : "s"} will be permanently
              deleted from Stripe (or archived if they have order history):
            </p>
            <ul
              className="mb-6 max-h-48 overflow-y-auto border border-gray-200 rounded-lg divide-y divide-gray-100 dark:border-gray-700 dark:divide-gray-800"
              data-testid="cleanup-dialog_list"
            >
              {candidates.map((c) => (
                <li
                  key={c.id}
                  className="px-3 py-2 text-sm text-dark-700 dark:text-dark-300"
                >
                  <span className="font-medium">{c.name || "(unnamed)"}</span>
                  <span className="ml-2 text-dark-400">{c.id}</span>
                </li>
              ))}
            </ul>
          </>
        )}

        <div className="flex gap-3 justify-end">
          <button
            onClick={onClose}
            disabled={applying}
            data-testid="cleanup-dialog_cancel-btn"
            className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50 dark:border-gray-600 dark:hover:bg-dark-800 dark:text-dark-800"
          >
            {count === 0 ? "Close" : "Cancel"}
          </button>
          {count > 0 && !loadingPreview && (
            <button
              onClick={handleConfirm}
              disabled={applying}
              data-testid="cleanup-dialog_confirm-btn"
              className="inline-flex items-center gap-2 px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed dark:bg-red-600 dark:hover:bg-red-700"
            >
              <Trash2 className="w-4 h-4" aria-hidden="true" />
              {applying
                ? "Cleaning up…"
                : `Delete ${count} product${count === 1 ? "" : "s"}`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
