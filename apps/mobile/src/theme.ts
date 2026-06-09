import type { SemanticTone } from "@keel/core";

export const colors = {
  // Brand
  navy: "#0B1E3F",
  accent: "#7FB8B0",
  white: "#FFFFFF",
  // Neutrals (light UI surfaces for lists & forms)
  background: "#F2F2F7",
  surface: "#FFFFFF",
  border: "#E3E3E8",
  text: "#11181C",
  mutedText: "#6B7280",
} as const;

// The platform's mapping of the core's semantic tones → actual colours.
// `@keel/core` only knows a status is (say) "danger"; this is where danger
// becomes red. Keeping it here is what lets the core stay UI-agnostic.
export const tones: Record<SemanticTone, string> = {
  neutral: "#6B7280",
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
  title: {
    fontSize: 32,
    fontWeight: "700",
  },
  subtitle: {
    fontSize: 16,
  },
  body: {
    fontSize: 16,
  },
  label: {
    fontSize: 15,
    fontWeight: "600",
  },
  caption: {
    fontSize: 13,
  },
} as const;
