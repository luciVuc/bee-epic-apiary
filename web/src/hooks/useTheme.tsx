import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

type TTheme = "light" | "dark";

interface IThemeContext {
  theme: TTheme;
  toggleTheme: () => void;
  isDark: boolean;
}

const ThemeContext = createContext<IThemeContext | undefined>(undefined);

/**
 * Provides light/dark theme state to descendants. Initializes from the
 * persisted `theme` localStorage key (defaulting to light), toggles the `dark`
 * class on `<html>`, and writes the choice back to localStorage on change.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<TTheme>(() => {
    const stored = localStorage.getItem("theme");
    if (stored === "dark" || stored === "light") return stored;
    return "light";
  });

  useEffect(() => {
    const root = document.documentElement;
    if (theme === "dark") {
      root.classList.add("dark");
    } else {
      root.classList.remove("dark");
    }
    localStorage.setItem("theme", theme);
  }, [theme]);

  const toggleTheme = () =>
    setTheme((prev) => (prev === "light" ? "dark" : "light"));

  return (
    <ThemeContext.Provider
      value={{ theme, toggleTheme, isDark: theme === "dark" }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

/** Access the current theme, `isDark` flag, and `toggleTheme`. Throws if used outside a {@link ThemeProvider}. */
export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error("useTheme must be used within a ThemeProvider");
  return context;
}
