import "@testing-library/jest-dom/vitest";
import { afterEach, vi } from "vitest";
import { cleanup } from "@testing-library/react";

// jsdom has no IntersectionObserver; framer-motion's `whileInView` (used by
// ProductCard) calls it on mount. Provide a no-op stub so viewport-animated
// components render in tests.
if (!("IntersectionObserver" in globalThis)) {
  class MockIntersectionObserver {
    observe = vi.fn();
    unobserve = vi.fn();
    disconnect = vi.fn();
    takeRecords = vi.fn(() => []);
    root = null;
    rootMargin = "";
    thresholds = [];
  }
  vi.stubGlobal("IntersectionObserver", MockIntersectionObserver);
}

afterEach(() => {
  cleanup();
});
