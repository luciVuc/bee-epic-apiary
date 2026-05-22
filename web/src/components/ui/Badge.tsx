import { ReactNode } from "react";

interface IBadgeProps {
  children: ReactNode;
  variant?: "default" | "success" | "warning" | "error" | "featured";
  className?: string;
}

export const Badge = ({
  children,
  variant = "default",
  className = "",
}: IBadgeProps) => {
  const variants = {
    default: "bg-dark-100 text-dark-700",
    success: "bg-green-100 text-green-800",
    warning: "bg-amber-100 text-amber-800",
    error: "bg-red-100 text-red-800",
    featured: "bg-primary-100 text-primary-800",
  };

  return (
    <span
      data-testid="badge"
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium font-body ${variants[variant]} ${className}`}
    >
      {children}
    </span>
  );
};
