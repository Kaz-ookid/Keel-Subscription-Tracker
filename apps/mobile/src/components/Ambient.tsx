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
      colors={dark ? ["#0C1830", "#0A1020", "#070C18"] : ["#EAF2F1", "#F4F6F8", "#EFF3F5"]}
      style={StyleSheet.absoluteFill}
      pointerEvents="none"
    >
      <Svg width="100%" height="100%">
        <Defs>
          <RadialGradient id="aura" cx="50%" cy="-12%" r="85%">
            <Stop offset="0%" stopColor={colors.accentStrong} stopOpacity={dark ? 0.2 : 0.28} />
            <Stop offset="55%" stopColor={colors.accentStrong} stopOpacity={0.05} />
            <Stop offset="100%" stopColor={colors.accentStrong} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill="url(#aura)" />
      </Svg>
    </LinearGradient>
  );
}
