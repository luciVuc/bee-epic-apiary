/** Admin panel entry point. Mounts the React app with Redux Provider and BrowserRouter. */
// cspell:ignore beforeinstallprompt
import React, { useState, useEffect } from "react";
import ReactDOM from "react-dom/client";
import { Provider } from "react-redux";
import { BrowserRouter } from "react-router-dom";
import { CheckCircle } from "lucide-react";
import App from "./App";
import { store } from "./store";
import { ThemeProvider } from "./hooks/useTheme";
import { ErrorBoundary } from "./components/ErrorBoundary";
import "./index.css";

interface IBeforeInstallPromptEvent extends Event {
  prompt: () => void;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] =
    useState<IBeforeInstallPromptEvent | null>(null);
  const [showInstall, setShowInstall] = useState(false);

  useEffect(() => {
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as IBeforeInstallPromptEvent);
      setShowInstall(true);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);

    return () => {
      window.removeEventListener(
        "beforeinstallprompt",
        handleBeforeInstallPrompt,
      );
    };
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;

    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;

    if (outcome === "accepted") {
      setShowInstall(false);
    }
    setDeferredPrompt(null);
  };

  if (!showInstall) return null;

  return (
    <button
      data-testid="install-prompt"
      onClick={handleInstall}
      className="fixed bottom-4 right-4 bg-amber-500 dark:bg-amber-600 hover:bg-amber-600 dark:hover:bg-amber-700 text-white px-4 py-2 rounded-lg shadow-lg flex items-center gap-2 z-50 transition-all"
    >
      <CheckCircle size={20} />
      Install App
    </button>
  );
}

history.scrollRestoration = "manual";

// Reuse a single React root across Vite HMR re-executions. Without this, every
// hot update re-runs this module and calls createRoot() on a #root that already
// has one, which React 18 warns about ("createRoot() on a container that has
// already been passed to createRoot() before"). Stash the root on `window` so
// the second invocation finds and re-renders into the existing one.
const container = document.getElementById("root")!;
type RootHost = Window & { __adminReactRoot?: ReactDOM.Root };
const w = window as RootHost;
const root = w.__adminReactRoot ?? ReactDOM.createRoot(container);
w.__adminReactRoot = root;

root.render(
  <React.StrictMode>
    <Provider store={store}>
      <BrowserRouter>
        <ErrorBoundary>
          <ThemeProvider>
            <App />
            <InstallPrompt />
          </ThemeProvider>
        </ErrorBoundary>
      </BrowserRouter>
    </Provider>
  </React.StrictMode>,
);
