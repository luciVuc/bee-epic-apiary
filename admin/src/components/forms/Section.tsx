import type { ReactNode } from "react";

interface SectionProps {
  title: string;
  icon?: ReactNode;
  children: ReactNode;
}

export function Section({ title, icon, children }: SectionProps) {
  return (
    <div className="p-4 border border-gray-200 rounded-lg">
      <h3 className="font-heading text-lg font-semibold mb-4 flex items-center gap-2 text-dark-800">
        {icon}
        {title}
      </h3>
      {children}
    </div>
  );
}
