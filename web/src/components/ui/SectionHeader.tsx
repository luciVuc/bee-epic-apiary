import { motion } from "framer-motion";

interface ISectionHeaderProps {
  title: string;
  subtitle?: string;
  align?: "left" | "center" | "right";
  className?: string;
}

export const SectionHeader = ({
  title,
  subtitle,
  align = "center",
  className = "",
}: ISectionHeaderProps) => {
  const alignments = {
    left: "text-left",
    center: "text-center",
    right: "text-right",
  };

  return (
    <motion.div
      className={`mb-12 ${alignments[align]} ${className}`}
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-100px" }}
      transition={{ duration: 0.6 }}
    >
      <h2 className="font-heading text-3xl md:text-4xl lg:text-5xl font-bold text-dark-900 mb-4">
        {title}
      </h2>
      {subtitle && (
        <p className="font-body text-lg text-dark-600 max-w-2xl mx-auto">
          {subtitle}
        </p>
      )}
    </motion.div>
  );
};
