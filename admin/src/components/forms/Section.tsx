import type { ReactNode } from "react";

export interface ISectionProps {
  title: string;
  icon?: ReactNode;
  children: ReactNode;
}

export function Section({ title, icon, children }: ISectionProps) {
  return (
    <div
      className="p-4 border border-gray-200 rounded-lg"
      data-testid="section"
    >
      <h3
        className="font-heading text-lg font-semibold mb-4 flex items-center gap-2 text-dark-800"
        data-testid="section_title"
      >
        {icon}
        {title}
      </h3>
      {children}
    </div>
  );
}
