export interface ISpinnerProps {
  className?: string;
}

export function Spinner({ className = "h-64" }: ISpinnerProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={`flex items-center justify-center ${className}`}
      data-testid="spinner"
    >
      <div
        className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-500"
        data-testid="spinner_icon"
      />
      <span className="sr-only">Loading...</span>
    </div>
  );
}
