import { Component, type ErrorInfo, type ReactNode } from "react";

interface IErrorBoundaryProps {
  children: ReactNode;
}

interface IErrorBoundaryState {
  hasError: boolean;
}

/**
 * App-level React error boundary. Client-side navigation and render throws
 * (a bad prop, an undefined access in a component body, a throwing effect)
 * would otherwise blank the entire SPA — the storefront is the revenue path,
 * so a white screen means a lost sale. This catches any render/lifecycle throw
 * below it and shows a recoverable fallback instead.
 *
 * A class component is required: `getDerivedStateFromError` /
 * `componentDidCatch` have no hooks equivalent, and this app uses the
 * component `<Routes>` API (not a data router with `errorElement`).
 *
 * The thrown error's message is intentionally NOT rendered — it can contain
 * internal detail. It's logged to the console (where prod error monitoring can
 * pick it up) and the user gets a generic, actionable card.
 */
export class ErrorBoundary extends Component<
  IErrorBoundaryProps,
  IErrorBoundaryState
> {
  state: IErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): IErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("Unhandled render error:", error, info.componentStack);
  }

  render(): ReactNode {
    if (!this.state.hasError) return this.props.children;

    return (
      <div
        data-testid="app-error-boundary"
        role="alert"
        className="min-h-screen flex items-center justify-center bg-primary-50 dark:bg-dark-950 px-4"
      >
        <div className="text-center">
          <h1 className="font-heading text-2xl font-bold text-dark-900 mb-4">
            Something went wrong
          </h1>
          <p className="font-body text-dark-600 mb-6">
            An unexpected error occurred. Please reload the page to continue.
          </p>
          <button
            data-testid="app-error-boundary_reload-btn"
            onClick={() => window.location.reload()}
            className="px-6 py-2 bg-primary-500 dark:bg-primary-600 text-white rounded-xl font-body font-medium hover:bg-primary-600 dark:hover:bg-primary-700 transition-colors"
            aria-label="Reload the page"
            title="Reload the page"
          >
            Reload
          </button>
        </div>
      </div>
    );
  }
}
