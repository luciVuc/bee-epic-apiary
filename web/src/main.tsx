import { StrictMode, useState, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { Provider } from "react-redux";
import { HelmetProvider } from "react-helmet-async";
import { CheckCircle } from "lucide-react";
import App from "./App.tsx";
import { store } from "./store";
import { ThemeProvider } from "./hooks/useTheme";
import { UpdatePrompt } from "./components/pwa/UpdatePrompt";
import { ErrorBoundary } from "./components/ErrorBoundary";
import "./index.css";

/** The `beforeinstallprompt` event, typed with the PWA install methods not in lib.dom. */
interface IBeforeInstallPromptEvent extends Event {
  prompt: () => void;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

/**
 * "Install App" button for the PWA. Captures the deferred
 * `beforeinstallprompt` event, then shows a button that triggers the native
 * install prompt on click and hides itself once accepted.
 */
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

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Provider store={store}>
      <HelmetProvider>
        <BrowserRouter>
          <ErrorBoundary>
            <ThemeProvider>
              <App />
              <InstallPrompt />
              <UpdatePrompt />
            </ThemeProvider>
          </ErrorBoundary>
        </BrowserRouter>
      </HelmetProvider>
    </Provider>
  </StrictMode>,
);
