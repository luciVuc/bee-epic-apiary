import { ButtonHTMLAttributes, forwardRef } from "react";

interface IButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "outline" | "ghost";
  size?: "sm" | "md" | "lg";
  isLoading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, IButtonProps>(
  (
    {
      className = "",
      variant = "primary",
      size = "md",
      isLoading,
      children,
      disabled,
      ...props
    },
    ref,
  ) => {
    const baseStyles =
      "inline-flex items-center justify-center font-body font-medium rounded-xl transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 dark:focus:ring-offset-dark-950 disabled:opacity-50 disabled:cursor-not-allowed";

    const variants = {
      primary:
        "bg-primary-500 hover:bg-primary-600 dark:bg-primary-600 dark:hover:bg-primary-700 text-white focus:ring-primary-500 dark:focus:ring-primary-400 shadow-amber hover:shadow-amber-lg",
      secondary:
        "bg-secondary-600 hover:bg-secondary-700 dark:bg-secondary-700 dark:hover:bg-secondary-800 text-white focus:ring-secondary-600 dark:focus:ring-secondary-400",
      outline:
        "border-2 border-primary-500 dark:border-primary-400 text-primary-600 dark:text-primary-400 hover:bg-primary-50 dark:hover:bg-primary-950 focus:ring-primary-500 dark:focus:ring-primary-400",
      ghost:
        "text-dark-600 hover:text-dark-900 hover:bg-dark-100 dark:hover:text-dark-100 dark:hover:bg-dark-800 focus:ring-dark-400 dark:focus:ring-dark-300",
    };

    const sizes = {
      sm: "px-3 py-1.5 text-sm",
      md: "px-5 py-2.5 text-base",
      lg: "px-8 py-3 text-lg",
    };

    const combinedClasses = `${baseStyles} ${variants[variant]} ${sizes[size]} ${className}`;
    const buttonProps = { "data-testid": "button" as const, ...props };

    return (
      <button
        ref={ref}
        className={combinedClasses}
        disabled={disabled || isLoading}
        aria-busy={isLoading ? true : undefined}
        {...buttonProps}
      >
        {isLoading ? (
          <span className="mr-2" aria-hidden="true">
            <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
                fill="none"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
              />
            </svg>
          </span>
        ) : null}
        {children}
      </button>
    );
  },
);

Button.displayName = "Button";
