import AsyncStorage from "@react-native-async-storage/async-storage";
import type { SemanticTone } from "@keel/core";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { Appearance, useColorScheme } from "react-native";

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
  /** Translucent card fill over the Ambient stage (DESIGN.md §9): the aura
   *  breathes through it. Pair with a `hairline` contour. */
  material: string;
  /** More opaque material for sheets and overlays that need presence. */
  materialStrong: string;
  /** The faint light contour on material surfaces. */
  hairline: string;
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
  /** The Ambient stage's vertical gradient (top, middle, bottom): night at
   *  sea after dark, a sea-glass morning haze by day. Lives here so the
   *  stage can never drift out of sync with `background`. */
  stage: readonly [string, string, string];
  /** The hero card's gradient: the navy hull at night, deep sea glass by
   *  day (a navy slab on the light scheme read as a foreign object). */
  hero: readonly [string, string];
  /** Categorical chart palette (donut slices, future charts). */
  chart: readonly string[];
  /** The core's semantic tones, tuned per scheme: darker inks on light
   *  surfaces, brighter ones for night at sea. */
  tones: Record<SemanticTone, string>;
}

const NAVY = "#0B1E3F";
const NAVY_DEEP = "#071429";
// The interactive brand color went BLUE (2026-09-08, from the icon): a
// friendly open-sea blue instead of the old teal sea glass (#7FB8B0). The
// harbor scenery keeps its own quarantined palette; the teal survives only
// as a chart category color.
const SEA_BLUE = "#6FA8E8";

// "Morning at sea" (reworked 2026-07-22): the earlier light palette sat
// white-on-near-white with no atmosphere, which is why dark became the
// default. The stage now carries a real sea-glass haze at the top, cards
// are brighter than the ground they float on, and a whisper of shadow
// (see cardShadow) gives light mode the separation dark gets for free.
const light: ThemeColors = {
  navy: NAVY,
  navyDeep: NAVY_DEEP,
  white: "#FFFFFF",
  background: "#F1F5F6",
  surface: "#FFFFFF",
  surface2: "#E7EDF0",
  material: "rgba(255,255,255,0.85)",
  materialStrong: "#FFFFFF",
  hairline: "rgba(11,30,63,0.1)",
  border: "#DCE4EA",
  text: "#0F1720",
  mutedText: "#5C6B7A",
  action: NAVY,
  actionText: "#FFFFFF",
  accent: "#2F6FB8",
  accentSoft: "#DBE7F7",
  accentStrong: SEA_BLUE,
  selection: "#DBE7F7",
  scrim: "rgba(7,20,41,0.45)",
  stage: ["#DCE7F5", "#F1F5F6", "#E8EDF3"],
  hero: ["#3D7AC7", "#2A5CA8"],
  chart: ["#2F6FB8", "#3E8578", "#E8A87C", "#B56576", "#6C8EBF", "#8FBC94", "#C9A66B", "#7A6C9E"],
  tones: {
    neutral: "#6E7B8A",
    info: "#2E6BD6",
    success: "#1E9950",
    warning: "#C07C00",
    danger: "#DC3B3B",
  },
};

// Exported for the widgets: they render night-at-sea regardless of scheme.
export const darkColors: ThemeColors = {
  navy: NAVY,
  navyDeep: NAVY_DEEP,
  white: "#FFFFFF",
  background: "#0B1A33",
  surface: "#152743",
  surface2: "#1E3354",
  material: "rgba(21,39,67,0.62)",
  materialStrong: "#152743",
  hairline: "rgba(237,241,245,0.08)",
  border: "#2A3A5C",
  text: "#EDF1F5",
  mutedText: "#93A0B4",
  action: SEA_BLUE,
  actionText: NAVY_DEEP,
  accent: "#82B4EF",
  accentSoft: "#172E52",
  accentStrong: SEA_BLUE,
  selection: "#172E52",
  scrim: "rgba(0,0,0,0.55)",
  // The icon's fade: brighter open blue up top, deep sea at the bottom.
  stage: ["#123156", "#0B1A33", "#071022"],
  hero: ["#1B3E6E", "#0D2144"],
  chart: ["#82B4EF", "#8FC7BF", "#E8B48C", "#C97C8C", "#8BA7D9", "#A3CCA8", "#D9BC85", "#9C8FC7"],
  tones: {
    neutral: "#8E9BAD",
    info: "#7CA9EF",
    success: "#4BC98A",
    warning: "#F0B35C",
    danger: "#F2766B",
  },
};

export type ColorScheme = "light" | "dark";

/** The user's appearance preference; "system" follows the device. */
export type ThemeMode = "system" | "light" | "dark";

const THEME_KEY = "keel.theme-mode.v1";

// Module mirror of the live preference, for non-React consumers (the widget
// snapshot writer): the provider keeps it current from hydrate and setMode.
let currentMode: ThemeMode = "system";

/** The appearance preference as of now (non-React; widgets ride it). */
export function themeModeSnapshot(): ThemeMode {
  return currentMode;
}

// Non-React listeners (the widget snapshot writer re-renders on a change).
const modeListeners = new Set<() => void>();
function setCurrentMode(next: ThemeMode): void {
  if (next === currentMode) return;
  currentMode = next;
  for (const listener of modeListeners) listener();
}

/** Subscribe to appearance changes; returns the unsubscribe. */
export function onThemeModeChange(listener: () => void): () => void {
  modeListeners.add(listener);
  return () => {
    modeListeners.delete(listener);
  };
}

/** The RESOLVED scheme, outside React (for module-level color resolution
 *  like brand.ts): the user's explicit choice, or the device's under
 *  "system". Snapshot semantics — callers re-run per render anyway. */
export function resolvedSchemeSnapshot(): ColorScheme {
  if (currentMode === "system") return Appearance.getColorScheme() === "dark" ? "dark" : "light";
  return currentMode;
}

// "Match device" is the DEFAULT (2026-09-08, superseding the 2026-07-11
// dark-first default): the app follows the system scheme until the user
// explicitly picks light or dark. A stored choice from before is honored.
const ThemeModeContext = createContext<{ mode: ThemeMode; setMode: (mode: ThemeMode) => void }>({
  mode: "system",
  setMode: () => {},
});

/** Mounted at the very root (above everything that calls useTheme); persists
 *  the preference independently of the data blob. */
export function ThemePreferenceProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>("system");
  // Nothing renders until the stored preference is read: the one frame of
  // wrong-default used to flash wrong-scheme tints (teal glass circles, a
  // dark blink for light users) on every cold start. The read is a few ms.
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    void AsyncStorage.getItem(THEME_KEY)
      .then((stored) => {
        if (stored === "light" || stored === "dark" || stored === "system") {
          setModeState(stored);
          setCurrentMode(stored);
        }
      })
      .finally(() => setHydrated(true));
  }, []);

  const setMode = (next: ThemeMode) => {
    setModeState(next);
    setCurrentMode(next);
    void AsyncStorage.setItem(THEME_KEY, next);
  };

  if (!hydrated) return null;
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
  return { colors: scheme === "dark" ? darkColors : light, scheme };
}

/** The separation model light mode was missing: a whisper of navy shadow
 *  under every material card (iOS-conventional). Dark needs none — light
 *  ink on dark ground separates by itself — so its entry is empty and the
 *  spread stays a no-op there. Applied in ONE place (ui/Card). */
export const cardShadow = {
  light: {
    shadowColor: NAVY,
    shadowOpacity: 0.06,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
  },
  dark: {},
} as const;

/** A hex color at the given alpha — brand washes and bleeds (§9c). */
export function withAlpha(hex: string, alpha: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
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
  /** Material cards over the Ambient stage (DESIGN.md §9). */
  xl: 24,
} as const;

// The full scale (DESIGN.md §3.2). `value` is the mid-size stat number that
// screens used to hardcode as fontSize 17/18/22; `h1` the screen-level name;
// `micro` the uppercase overline for stat/section labels.
export const typography = {
  /** Hero amounts (§9e): the one number a screen is about. */
  display: { fontSize: 40, fontWeight: "700", letterSpacing: -0.5 },
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

/** Bottom padding scrollable tab screens need so their last rows can clear
 *  the floating glass dock (DESIGN.md §9b). */
export const dockClearance = 108;
