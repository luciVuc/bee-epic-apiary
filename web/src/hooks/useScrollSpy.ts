import { useState, useEffect, useCallback } from "react";

export const useScrollSpy = (
  sectionIds: string[],
  offset: number = 100,
): string => {
  const [activeSection, setActiveSection] = useState<string>(
    sectionIds[0] || "",
  );

  const handleScroll = useCallback(() => {
    const scrollPosition = window.scrollY + offset;

    for (let i = sectionIds.length - 1; i >= 0; i--) {
      const id = sectionIds[i];
      const element = document.getElementById(id);
      if (element) {
        const { offsetTop } = element;
        if (scrollPosition >= offsetTop) {
          setActiveSection(id);
          return;
        }
      }
    }

    if (sectionIds[0]) {
      const firstElement = document.getElementById(sectionIds[0]);
      if (firstElement && scrollPosition < offset) {
        setActiveSection(sectionIds[0]);
      }
    }
  }, [sectionIds, offset]);

  useEffect(() => {
    window.addEventListener("scroll", handleScroll, { passive: true });
    handleScroll();

    return () => {
      window.removeEventListener("scroll", handleScroll);
    };
  }, [handleScroll]);

  return activeSection;
};
