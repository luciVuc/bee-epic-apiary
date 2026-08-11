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
 * localStorage access throws under Safari Private Browsing, locked-down
 * corporate browsers, and when the user has disabled site data. Treating it
 * as unconditionally available is enough to crash the entire admin shell at
 * boot (review I7). The wrappers silently fall back to defaults so theme
 * just doesn't persist across reloads in those environments.
 */
function safeGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSet(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // ignore — theme will just not persist across reloads.
  }
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<TTheme>(() => {
    const stored = safeGet("theme");
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
    safeSet("theme", theme);
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

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error("useTheme must be used within a ThemeProvider");
  return context;
}
