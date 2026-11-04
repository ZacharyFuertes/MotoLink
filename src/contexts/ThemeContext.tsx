import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

export type Theme = "dark" | "light" | "system";

export const THEME_STORAGE_KEY = "motolink_theme";

interface ThemeContextType {
  theme: Theme;
  /** Resolved "dark" or "light" after applying system preference. */
  resolvedTheme: "dark" | "light";
  isDark: boolean;
  toggleTheme: () => void;
  setTheme: (theme: Theme) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

const MEDIA_QUERY = "(prefers-color-scheme: dark)";

const resolveTheme = (theme: Theme): "dark" | "light" => {
  if (theme !== "system") return theme;
  return typeof window !== "undefined" && window.matchMedia(MEDIA_QUERY).matches
    ? "dark"
    : "light";
};

const applyThemeClass = (theme: Theme) => {
  const root = document.documentElement;
  const resolved = resolveTheme(theme);
  root.classList.toggle("dark", resolved === "dark");
  root.classList.toggle("light", resolved === "light");
};

const getInitialTheme = (): Theme => {
  if (typeof window === "undefined") return "system";
  const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
  return stored === "light" || stored === "dark" || stored === "system"
    ? (stored as Theme)
    : "system";
};

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [theme, setThemeState] = useState<Theme>(getInitialTheme);
  const [systemPreferenceVersion, setSystemPreferenceVersion] = useState(0);

  // Apply theme class on mount and whenever theme changes.
  useEffect(() => {
    applyThemeClass(theme);
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      /* storage unavailable ignore */
    }
  }, [theme]);

  // Listen for OS preference changes when in system mode.
  useEffect(() => {
    if (theme !== "system") return;
    const media = window.matchMedia(MEDIA_QUERY);
    const handler = () => {
      applyThemeClass("system");
      setSystemPreferenceVersion((version) => version + 1);
    };
    media.addEventListener("change", handler);
    return () => media.removeEventListener("change", handler);
  }, [theme]);

  // Briefly enable a global color transition so the whole UI cross-fades when
  // the theme flips. Removed afterwards so it never interferes with other
  // animations or hover states during normal use.
  const animateThemeSwap = useCallback(() => {
    const root = document.documentElement;
    root.classList.add("theme-transition");
    window.setTimeout(() => root.classList.remove("theme-transition"), 300);
  }, []);

  const setTheme = useCallback(
    (next: Theme) => {
      animateThemeSwap();
      setThemeState(next);
    },
    [animateThemeSwap],
  );

  const toggleTheme = useCallback(() => {
    animateThemeSwap();
    setThemeState((current) => {
      if (current === "dark") return "light";
      if (current === "light") return "system";
      return "dark";
    });
  }, []);

  const value = useMemo<ThemeContextType>(
    () => {
      const resolved = resolveTheme(theme);
      return {
        theme,
        resolvedTheme: resolved,
        isDark: resolved === "dark",
        toggleTheme,
        setTheme,
      };
    },
    [theme, toggleTheme, setTheme, systemPreferenceVersion],
  );

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
};

export const useTheme = (): ThemeContextType => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return context;
};

export default ThemeContext;
