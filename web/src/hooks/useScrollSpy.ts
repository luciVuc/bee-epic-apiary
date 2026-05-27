import { useState, useEffect } from "react";

export const useScrollSpy = (
  sectionIds: string[],
  offset: number = 100,
): string => {
  const [activeSection, setActiveSection] = useState<string>(
    sectionIds[0] || "",
  );

  useEffect(() => {
    const observers: IntersectionObserver[] = [];

    for (const id of sectionIds) {
      const element = document.getElementById(id);
      if (!element) continue;

      const observer = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            if (entry.isIntersecting) {
              setActiveSection(id);
            }
          }
        },
        {
          rootMargin: `-${offset}px 0px -50% 0px`,
          threshold: 0,
        },
      );

      observer.observe(element);
      observers.push(observer);
    }

    return () => {
      for (const observer of observers) {
        observer.disconnect();
      }
    };
  }, [sectionIds, offset]);

  return activeSection;
};
