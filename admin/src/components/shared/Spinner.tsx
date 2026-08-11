/** Accessible loading spinner with role="status" and sr-only text */
export interface ISpinnerProps {
  /** Additional Tailwind height/width classes (default "h-64") */
  className?: string;
}

/**
 * Centered loading spinner. Exposes `role="status"` + sr-only "Loading…" text
 * so screen readers announce the pending state; `className` overrides the
 * default container height for inline vs full-panel use.
 */
export function Spinner({ className = "h-64" }: ISpinnerProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={`flex items-center justify-center ${className}`}
      data-testid="spinner"
    >
      <div
        className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-500 dark:border-primary-400"
        data-testid="spinner_icon"
      />
      <span className="sr-only">Loading...</span>
    </div>
  );
}
