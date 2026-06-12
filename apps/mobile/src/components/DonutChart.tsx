// A plain display donut: proportions at a glance, the headline number in the
// hole. Display-only by design — the interaction (expand, navigate) belongs
// to the legend rows next to it, which carry the same colors.

import { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import Svg, { Circle } from "react-native-svg";

import { typography, useTheme } from "../theme";

export interface DonutSegment {
  key: string;
  value: number;
  color: string;
}

interface Props {
  /** Segments in display order; non-positive values are skipped. */
  segments: readonly DonutSegment[];
  /** The number in the hole (e.g. the year total). */
  centerTitle: string;
  /** Smaller line under it (e.g. "2026 · 52 €/mo"). */
  centerSub?: string;
  /** When set, every other slice dims — ties the open legend row to its
   *  slice without making the SVG itself interactive. */
  selectedKey?: string | null;
  size?: number;
  thickness?: number;
}

export function DonutChart({
  segments,
  centerTitle,
  centerSub,
  selectedKey,
  size = 200,
  thickness = 22,
}: Props) {
  const { colors } = useTheme();

  const radius = (size - thickness) / 2;
  const circumference = 2 * Math.PI * radius;
  // A hairline gap between slices keeps neighbours readable without a border.
  const gap = segments.length > 1 ? 2 : 0;

  const arcs = useMemo(() => {
    const positive = segments.filter((s) => s.value > 0);
    const total = positive.reduce((sum, s) => sum + s.value, 0);
    if (total <= 0) return [];
    let offset = 0;
    return positive.map((s) => {
      const length = (s.value / total) * circumference;
      const arc = { ...s, length: Math.max(length - gap, 0), offset };
      offset += length;
      return arc;
    });
  }, [segments, circumference, gap]);

  return (
    <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
      <Svg width={size} height={size}>
        {arcs.length === 0 && (
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke={colors.border}
            strokeWidth={thickness}
            fill="none"
          />
        )}
        {arcs.map((a) => (
          <Circle
            key={a.key}
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke={a.color}
            strokeOpacity={selectedKey == null || a.key === selectedKey ? 1 : 0.25}
            strokeWidth={thickness}
            fill="none"
            strokeDasharray={`${a.length} ${circumference - a.length}`}
            strokeDashoffset={-a.offset}
            strokeLinecap="butt"
            // Start at 12 o'clock instead of 3.
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
          />
        ))}
      </Svg>
      <View style={styles.center} pointerEvents="none">
        <Text style={[styles.centerTitle, { color: colors.text }]} numberOfLines={1}>
          {centerTitle}
        </Text>
        {centerSub ? (
          <Text style={[styles.centerSub, { color: colors.mutedText }]} numberOfLines={1}>
            {centerSub}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    position: "absolute",
    alignItems: "center",
    gap: 2,
    paddingHorizontal: 24,
  },
  centerTitle: {
    fontSize: 22,
    fontWeight: "700",
  },
  centerSub: {
    ...typography.caption,
  },
});
