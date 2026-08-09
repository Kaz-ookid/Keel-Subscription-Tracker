// The stage every screen stands on (DESIGN.md §9, "Made for Apple" rework):
// a quiet vertical gradient with a sea-glass aura breathing from the top.
// Mounted ONCE behind the navigator; screens go transparent so material
// cards float over one continuous atmosphere instead of flat paint.
// Night at sea after dark, morning haze by day — never a flat fill again.

import { LinearGradient } from "expo-linear-gradient";
import { StyleSheet } from "react-native";
import Svg, { Defs, RadialGradient, Rect, Stop } from "react-native-svg";

import { useTheme } from "../theme";

export function Ambient() {
  const { colors, scheme } = useTheme();
  const dark = scheme === "dark";
  return (
    <LinearGradient
      // The stops live in the theme (colors.stage) so the stage can never
      // drift out of sync with the background token.
      colors={[...colors.stage]}
      style={StyleSheet.absoluteFill}
      pointerEvents="none"
    >
      <Svg width="100%" height="100%">
        <Defs>
          <RadialGradient id="aura" cx="50%" cy="-12%" r="85%">
            {/* The morning haze needs a stronger aura than the night: sea
                glass over a light ground reads at a fraction of its dark
                glow, so light gets 0.32 where dark keeps 0.20. */}
            <Stop offset="0%" stopColor={colors.accentStrong} stopOpacity={dark ? 0.2 : 0.32} />
            <Stop offset="55%" stopColor={colors.accentStrong} stopOpacity={0.05} />
            <Stop offset="100%" stopColor={colors.accentStrong} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill="url(#aura)" />
      </Svg>
    </LinearGradient>
  );
}
