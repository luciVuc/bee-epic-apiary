import { motion } from "framer-motion";

interface ILoadingSpinnerProps {
  size?: "sm" | "md" | "lg";
  className?: string;
}

export const LoadingSpinner = ({
  size = "md",
  className = "",
}: ILoadingSpinnerProps) => {
  const sizes = {
    sm: "w-4 h-4",
    md: "w-8 h-8",
    lg: "w-12 h-12",
  };

  return (
    <div
      data-testid="loading-spinner"
      className={`flex items-center justify-center ${className}`}
      role="status"
      aria-live="polite"
    >
      <motion.div
        className={`border-2 border-primary-200 dark:border-primary-800 border-t-primary-500 dark:border-t-primary-400 rounded-full ${sizes[size]}`}
        animate={{ rotate: 360 }}
        transition={{
          duration: 1,
          repeat: Infinity,
          ease: "linear",
        }}
      />
      <span className="sr-only">Loading...</span>
    </div>
  );
};
