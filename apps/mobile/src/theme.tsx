import AsyncStorage from "@react-native-async-storage/async-storage";
import type { SemanticTone } from "@keel/core";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useColorScheme } from "react-native";

// Keel's palette (DESIGN.md §3.1): navy is the hull, sea glass the waterline.
// Light mode uses cool blue-greys (not iOS defaults); dark mode is "night at
// sea": navy-tinted darks, never pure black, and the primary action color
// flips to sea glass so buttons stay vivid on dark surfaces.
export interface ThemeColors {
  // Brand (scheme-independent)
  navy: string;
  navyDeep: string;
  white: string;
  // Surfaces / text
  background: string;
  surface: string;
  /** Inset fills inside a surface: tracks, wells, selected calendar day. */
  surface2: string;
  border: string;
  text: string;
  mutedText: string;
  // Interaction
  /** Primary action fill (buttons, active pills): navy by day, glass by night. */
  action: string;
  actionText: string;
  /** Interactive tint: icons, links, active tab. */
  accent: string;
  /** Quiet selected-state fill (chips, calendar selection). */
  accentSoft: string;
  /** Sea glass at full brand strength, for on-navy elements. */
  accentStrong: string;
  selection: string;
  /** Modal backdrop. */
  scrim: string;
  /** Categorical chart palette (donut slices, future charts). */
  chart: readonly string[];
}

const NAVY = "#0B1E3F";
const NAVY_DEEP = "#071429";
const SEA_GLASS = "#7FB8B0";

const light: ThemeColors = {
  navy: NAVY,
  navyDeep: NAVY_DEEP,
  white: "#FFFFFF",
  background: "#F4F6F8",
  surface: "#FFFFFF",
  surface2: "#EDF1F4",
  border: "#E2E8EE",
  text: "#0F1720",
  mutedText: "#5C6B7A",
  action: NAVY,
  actionText: "#FFFFFF",
  accent: "#3E8578",
  accentSoft: "#DCEBE8",
  accentStrong: SEA_GLASS,
  selection: "#DCEBE8",
  scrim: "rgba(7,20,41,0.45)",
  chart: ["#3E8578", "#4E79A7", "#E8A87C", "#B56576", "#6C8EBF", "#8FBC94", "#C9A66B", "#7A6C9E"],
};

const dark: ThemeColors = {
  navy: NAVY,
  navyDeep: NAVY_DEEP,
  white: "#FFFFFF",
  background: "#0A1020",
  surface: "#131B2E",
  surface2: "#1C2740",
  border: "#26314A",
  text: "#EDF1F5",
  mutedText: "#93A0B4",
  action: SEA_GLASS,
  actionText: NAVY_DEEP,
  accent: "#8FC7BF",
  accentSoft: "#1E3A38",
  accentStrong: SEA_GLASS,
  selection: "#1E3A38",
  scrim: "rgba(0,0,0,0.55)",
  chart: ["#8FC7BF", "#7FA6D9", "#E8B48C", "#C97C8C", "#8BA7D9", "#A3CCA8", "#D9BC85", "#9C8FC7"],
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

// The full scale (DESIGN.md §3.2). `value` is the mid-size stat number that
// screens used to hardcode as fontSize 17/18/22; `h1` the screen-level name;
// `micro` the uppercase overline for stat/section labels.
export const typography = {
  title: { fontSize: 32, fontWeight: "700" },
  h1: { fontSize: 24, fontWeight: "700" },
  value: { fontSize: 18, fontWeight: "700" },
  subtitle: { fontSize: 16 },
  body: { fontSize: 16 },
  label: { fontSize: 15, fontWeight: "600" },
  caption: { fontSize: 13 },
  micro: {
    fontSize: 11,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
} as const;

// Exactly two de-emphasis levels (DESIGN.md §3.3): `dim` for paid/complete/
// past elements, `hint` for secondary content on brand surfaces.
export const emphasis = {
  dim: 0.45,
  hint: 0.7,
} as const;
