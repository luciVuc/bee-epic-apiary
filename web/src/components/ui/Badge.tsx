import { ReactNode } from "react";

interface IBadgeProps {
  children: ReactNode;
  variant?: "default" | "success" | "warning" | "error" | "featured";
  className?: string;
  "data-testid"?: string;
}

export const Badge = ({
  children,
  variant = "default",
  className = "",
  "data-testid": testId = "badge",
}: IBadgeProps) => {
  const variants = {
    default: "bg-dark-100 text-dark-700 dark:bg-dark-800 dark:text-dark-300",
    success:
      "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
    warning:
      "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
    error: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
    featured:
      "bg-primary-100 text-primary-800 dark:bg-primary-950 dark:text-primary-300",
  };

  return (
    <span
      data-testid={testId}
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium font-body ${variants[variant]} ${className}`}
    >
      {children}
    </span>
  );
};
