/**
 * PWA "new version available" toast (review #12).
 *
 * Before this component existed, vite-plugin-pwa was configured with
 * `registerType: "autoUpdate"` — the service worker silently took over on
 * the next navigation, with no signal to the user that anything changed.
 * That's invisible to most users and confusing for the rest (state from
 * the prior version sticks around in-memory while CSS/JS swaps under
 * them).
 *
 * Switching to `registerType: "prompt"` and rendering this toast lets the
 * user decide when to reload. `useRegisterSW` from
 * `virtual:pwa-register/react` is the official react binding for the
 * vite-plugin-pwa registration lifecycle.
 */
import { useRegisterSW } from "virtual:pwa-register/react";
import { RefreshCw, X } from "lucide-react";

export function UpdatePrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisterError(err: unknown) {
      console.error("SW registration error", err);
    },
  });

  if (!needRefresh) return null;

  return (
    <div
      role="alert"
      data-testid="update-prompt"
      className="fixed bottom-4 left-4 sm:left-auto sm:right-4 z-50 max-w-sm bg-white dark:bg-dark-100 border border-amber-200 dark:border-amber-700 rounded-xl shadow-xl p-4 flex items-start gap-3"
    >
      <RefreshCw
        className="w-5 h-5 text-amber-500 shrink-0 mt-0.5"
        aria-hidden="true"
      />
      <div className="flex-1">
        <p className="font-body text-sm font-semibold text-dark-900 mb-1">
          A new version is available
        </p>
        <p className="font-body text-xs text-dark-600 mb-3">
          Reload to get the latest improvements.
        </p>
        <div className="flex gap-2">
          <button
            data-testid="update-prompt_reload"
            onClick={() => updateServiceWorker(true)}
            className="px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-white text-xs font-medium rounded-md transition-colors"
          >
            Reload
          </button>
          <button
            data-testid="update-prompt_dismiss"
            onClick={() => setNeedRefresh(false)}
            className="px-3 py-1.5 bg-transparent hover:bg-dark-50 dark:hover:bg-dark-200 text-dark-700 text-xs font-medium rounded-md transition-colors"
          >
            Later
          </button>
        </div>
      </div>
      <button
        data-testid="update-prompt_close"
        onClick={() => setNeedRefresh(false)}
        aria-label="Dismiss update prompt"
        className="text-dark-400 hover:text-dark-700 transition-colors"
      >
        <X className="w-4 h-4" aria-hidden="true" />
      </button>
    </div>
  );
}
