import { createContext, useContext, useMemo, useState } from "react";

const ThemeContext = createContext(null);

function getInitialTheme() {
  const savedTheme = localStorage.getItem("brightloop-theme");
  if (savedTheme === "light" || savedTheme === "dark") return savedTheme;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(getInitialTheme);
  const value = useMemo(() => ({
    theme,
    toggleTheme() {
      const nextTheme = theme === "dark" ? "light" : "dark";
      localStorage.setItem("brightloop-theme", nextTheme);
      document.documentElement.classList.toggle("dark", nextTheme === "dark");
      setTheme(nextTheme);
    },
  }), [theme]);

  document.documentElement.classList.toggle("dark", theme === "dark");
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error("useTheme must be used within ThemeProvider.");
  return context;
}
