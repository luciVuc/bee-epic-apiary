import { Component, type ErrorInfo, type ReactNode } from "react";

interface IErrorBoundaryProps {
  children: ReactNode;
}

interface IErrorBoundaryState {
  hasError: boolean;
}

/**
 * App-level React error boundary for the admin panel. A render/lifecycle throw
 * anywhere below it would otherwise blank the whole SPA (React unmounts the
 * tree on an uncaught error); this catches it and shows a recoverable fallback
 * so an operator can reload rather than staring at a white screen.
 *
 * A class component is required: `getDerivedStateFromError` /
 * `componentDidCatch` have no hooks equivalent, and this app uses the component
 * `<Routes>` API (not a data router with `errorElement`).
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
        className="flex flex-col items-center justify-center min-h-screen gap-3 p-6 text-center bg-gray-50 dark:bg-dark-950"
      >
        <h1 className="font-heading text-2xl font-bold text-dark-900">
          Something went wrong
        </h1>
        <p className="text-dark-600">
          An unexpected error occurred. Please reload the page to continue.
        </p>
        <button
          type="button"
          data-testid="app-error-boundary_reload-btn"
          onClick={() => window.location.reload()}
          className="px-4 py-2 rounded-md bg-amber-500 text-white hover:bg-amber-600"
          aria-label="Reload the page"
        >
          Reload
        </button>
      </div>
    );
  }
}
