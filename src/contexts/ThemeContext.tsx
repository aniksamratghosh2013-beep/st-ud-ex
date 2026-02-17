import { createContext, useContext, useEffect, useState, ReactNode } from "react";

type Theme = "light" | "dark";

interface ThemeContextType {
  theme: Theme;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextType>({
  theme: "light",
  toggleTheme: () => {},
});

export const useTheme = () => useContext(ThemeContext);

const COLOR_SCHEMES: Record<string, { hue: number; sat: number; light: string; darkLight: string }> = {
  indigo: { hue: 245, sat: 58, light: "51", darkLight: "60" },
  blue: { hue: 210, sat: 70, light: "50", darkLight: "55" },
  emerald: { hue: 155, sat: 60, light: "40", darkLight: "50" },
  rose: { hue: 350, sat: 65, light: "50", darkLight: "55" },
  amber: { hue: 35, sat: 85, light: "50", darkLight: "55" },
  violet: { hue: 270, sat: 60, light: "50", darkLight: "60" },
  teal: { hue: 175, sat: 55, light: "40", darkLight: "50" },
  crimson: { hue: 0, sat: 72, light: "48", darkLight: "50" },
};

function applySchemeToRoot(schemeId: string, isDark: boolean) {
  const scheme = COLOR_SCHEMES[schemeId];
  if (!scheme) return;
  const root = document.documentElement;
  const h = scheme.hue;
  const s = scheme.sat;
  const l = isDark ? scheme.darkLight : scheme.light;

  root.style.setProperty("--primary", `${h} ${s}% ${l}%`);
  root.style.setProperty("--ring", `${h} ${s}% ${l}%`);
  root.style.setProperty("--accent", isDark ? `${h} 40% 20%` : `${h} ${s}% 95%`);
  root.style.setProperty("--accent-foreground", isDark ? `${h} ${s}% 75%` : `${h} ${s}% 40%`);
  root.style.setProperty("--sidebar-primary", `${h} ${s}% ${l}%`);
  root.style.setProperty("--sidebar-primary-foreground", `0 0% 100%`);
  root.style.setProperty("--sidebar-accent", isDark ? `${h} 30% 18%` : `${h} ${s}% 96%`);
  root.style.setProperty("--sidebar-accent-foreground", isDark ? `${h} ${s}% 75%` : `${h} ${s}% 40%`);
  root.style.setProperty("--sidebar-ring", `${h} ${s}% ${l}%`);
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(() => {
    const stored = localStorage.getItem("syncup-theme");
    return (stored as Theme) || "light";
  });

  useEffect(() => {
    const root = window.document.documentElement;
    root.classList.remove("light", "dark");
    root.classList.add(theme);
    localStorage.setItem("syncup-theme", theme);

    // Apply saved color scheme
    const savedScheme = localStorage.getItem("syncup-color-scheme") || "indigo";
    applySchemeToRoot(savedScheme, theme === "dark");

    // Apply saved font size
    const FONT_SCALES: Record<string, number> = { small: 0.875, default: 1, large: 1.125, xl: 1.25 };
    const savedFontSize = localStorage.getItem("syncup-font-size") || "default";
    root.style.fontSize = `${(FONT_SCALES[savedFontSize] || 1) * 16}px`;

    // Apply saved border radius
    const RADIUS_VALUES: Record<string, string> = { none: "0", sm: "0.375rem", md: "0.75rem", lg: "1rem", full: "1.5rem" };
    const savedRadius = localStorage.getItem("syncup-radius") || "md";
    root.style.setProperty("--radius", RADIUS_VALUES[savedRadius] || "0.75rem");
  }, [theme]);

  const toggleTheme = () => setTheme((t) => (t === "light" ? "dark" : "light"));

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}
