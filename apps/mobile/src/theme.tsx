import AsyncStorage from "@react-native-async-storage/async-storage";
import type { SemanticTone } from "@keel/core";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useColorScheme } from "react-native";

export interface ThemeColors {
  // Brand
  navy: string;
  accent: string;
  white: string;
  // Surfaces / text (adapt to light vs dark)
  background: string;
  surface: string;
  border: string;
  text: string;
  mutedText: string;
}

const light: ThemeColors = {
  navy: "#0B1E3F",
  accent: "#7FB8B0",
  white: "#FFFFFF",
  background: "#F2F2F7",
  surface: "#FFFFFF",
  border: "#E3E3E8",
  text: "#11181C",
  mutedText: "#6B7280",
};

const dark: ThemeColors = {
  navy: "#0B1E3F",
  accent: "#7FB8B0",
  white: "#FFFFFF",
  background: "#000000",
  surface: "#1C1C1E",
  border: "#38383A",
  text: "#F2F2F7",
  mutedText: "#9BA1A6",
};

export type ColorScheme = "light" | "dark";

/** The user's appearance preference; "system" follows the device. */
export type ThemeMode = "system" | "light" | "dark";

const THEME_KEY = "keel.theme-mode.v1";

const ThemeModeContext = createContext<{ mode: ThemeMode; setMode: (mode: ThemeMode) => void }>({
  mode: "system",
  setMode: () => {},
});

/** Mounted at the very root (above everything that calls useTheme); persists
 *  the preference independently of the data blob. */
export function ThemePreferenceProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>("system");

  useEffect(() => {
    void AsyncStorage.getItem(THEME_KEY).then((stored) => {
      if (stored === "light" || stored === "dark" || stored === "system") setModeState(stored);
    });
  }, []);

  const setMode = (next: ThemeMode) => {
    setModeState(next);
    void AsyncStorage.setItem(THEME_KEY, next);
  };

  return (
    <ThemeModeContext.Provider value={{ mode, setMode }}>{children}</ThemeModeContext.Provider>
  );
}

/** Read/write the appearance preference (the Settings screen's hook). */
export function useThemeMode() {
  return useContext(ThemeModeContext);
}

/** Active colours + scheme: the user's preference, or the device's when
 *  following the system. */
export function useTheme(): { colors: ThemeColors; scheme: ColorScheme } {
  const { mode } = useContext(ThemeModeContext);
  const system = useColorScheme();
  const scheme: ColorScheme = mode === "system" ? (system === "dark" ? "dark" : "light") : mode;
  return { colors: scheme === "dark" ? dark : light, scheme };
}

/** Black or white — whichever reads on the given hex background. Used for
 *  marks drawn on top of user-picked swatch colours. */
export function contrastText(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.62 ? "#111827" : "#FFFFFF";
}

// The platform's mapping of the core's semantic tones → actual colours. These
// read acceptably on both light and dark backgrounds, so they stay static.
export const tones: Record<SemanticTone, string> = {
  neutral: "#8E8E93",
  info: "#3B82F6",
  success: "#22C55E",
  warning: "#F59E0B",
  danger: "#EF4444",
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
} as const;

export const typography = {
  title: { fontSize: 32, fontWeight: "700" },
  subtitle: { fontSize: 16 },
  body: { fontSize: 16 },
  label: { fontSize: 15, fontWeight: "600" },
  caption: { fontSize: 13 },
} as const;
