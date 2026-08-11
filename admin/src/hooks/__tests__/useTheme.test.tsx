/** Tests for the useTheme/ThemeProvider hook */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ThemeProvider, useTheme } from "../useTheme";

function Demo() {
  const { theme, toggleTheme, isDark } = useTheme();
  return (
    <div>
      <span data-testid="theme-value">{theme}</span>
      <span data-testid="theme-is-dark">{String(isDark)}</span>
      <button data-testid="toggle" onClick={toggleTheme}>
        toggle
      </button>
    </div>
  );
}

describe("ThemeProvider / useTheme", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.classList.remove("dark");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("defaults to light when no stored value", () => {
    render(
      <ThemeProvider>
        <Demo />
      </ThemeProvider>,
    );
    expect(screen.getByTestId("theme-value").textContent).toBe("light");
  });

  it("reads the stored value on initial mount", () => {
    localStorage.setItem("theme", "dark");
    render(
      <ThemeProvider>
        <Demo />
      </ThemeProvider>,
    );
    expect(screen.getByTestId("theme-value").textContent).toBe("dark");
  });

  it("toggles theme and persists to localStorage", () => {
    render(
      <ThemeProvider>
        <Demo />
      </ThemeProvider>,
    );
    fireEvent.click(screen.getByTestId("toggle"));
    expect(screen.getByTestId("theme-value").textContent).toBe("dark");
    expect(localStorage.getItem("theme")).toBe("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });

  describe("localStorage tolerance (review I7)", () => {
    /**
     * Safari Private Browsing, locked-down corporate browsers, and disabled
     * cookies/storage settings can all make localStorage throw on get/set.
     * Before this fix, the throw escaped from the initializer / commit
     * effect and crashed the whole admin shell — a worse UX than just
     * silently falling back to the default theme.
     */

    it("does not throw when getItem throws on initial read", () => {
      vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
        throw new Error("SecurityError: storage unavailable");
      });
      expect(() => {
        render(
          <ThemeProvider>
            <Demo />
          </ThemeProvider>,
        );
      }).not.toThrow();
      // Falls back to the light default.
      expect(screen.getByTestId("theme-value").textContent).toBe("light");
    });

    it("does not throw when setItem throws on theme change", () => {
      vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
        throw new Error("QuotaExceeded");
      });
      render(
        <ThemeProvider>
          <Demo />
        </ThemeProvider>,
      );
      expect(() => fireEvent.click(screen.getByTestId("toggle"))).not.toThrow();
      // Toggle still affected the in-memory state and the DOM class.
      expect(screen.getByTestId("theme-value").textContent).toBe("dark");
      expect(document.documentElement.classList.contains("dark")).toBe(true);
    });
  });
});
