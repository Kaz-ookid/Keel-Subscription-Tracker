// A plain display donut: proportions at a glance, the headline number in the
// hole, and each slice's icon sitting just outside the ring at the slice's
// mid-angle (tinted in the slice color) — the chart names its own parts
// without a legend lookup. Display-only by design: the interaction (expand,
// navigate) belongs to the legend rows next to it, which carry the same
// colors.

import { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import Svg, { Circle } from "react-native-svg";
import { SymbolView, type SymbolViewProps } from "expo-symbols";

import { typography, useTheme } from "../theme";

export interface DonutSegment {
  key: string;
  value: number;
  color: string;
  /** SF Symbol drawn outside the ring at the slice's mid-angle. */
  icon?: string;
}

interface Props {
  /** Segments in display order; non-positive values are skipped. */
  segments: readonly DonutSegment[];
  /** The number in the hole (e.g. the year total). */
  centerTitle: string;
  /** Smaller line under it (e.g. "2026 · 52 €/mo"). */
  centerSub?: string;
  /** When set, every other slice (and its icon) dims — ties the open legend
   *  row to its slice without making the SVG itself interactive. */
  selectedKey?: string | null;
  size?: number;
  thickness?: number;
}

// Icons sit this far beyond the ring; the canvas grows to make room.
const ICON_ORBIT = 16;
const ICON_SIZE = 15;

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
  const margin = ICON_ORBIT + ICON_SIZE;
  const canvas = size + margin * 2;
  const center = canvas / 2;
  // A hairline gap between slices keeps neighbours readable without a border.
  const gap = segments.length > 1 ? 2 : 0;

  const arcs = useMemo(() => {
    const positive = segments.filter((s) => s.value > 0);
    const total = positive.reduce((sum, s) => sum + s.value, 0);
    if (total <= 0) return [];
    let offset = 0;
    return positive.map((s) => {
      const length = (s.value / total) * circumference;
      // The icon's anchor: the slice's mid-angle, measured from 12 o'clock.
      const midAngle = ((offset + length / 2) / circumference) * 2 * Math.PI - Math.PI / 2;
      const orbit = radius + thickness / 2 + ICON_ORBIT;
      const arc = {
        ...s,
        length: Math.max(length - gap, 0),
        offset,
        share: s.value / total,
        iconX: center + Math.cos(midAngle) * orbit,
        iconY: center + Math.sin(midAngle) * orbit,
      };
      offset += length;
      return arc;
    });
  }, [segments, circumference, gap, radius, thickness, center]);

  const dimmed = (key: string) => selectedKey != null && key !== selectedKey;

  return (
    <View style={{ width: canvas, height: canvas, alignItems: "center", justifyContent: "center" }}>
      <Svg width={canvas} height={canvas}>
        {arcs.length === 0 && (
          <Circle
            cx={center}
            cy={center}
            r={radius}
            stroke={colors.border}
            strokeWidth={thickness}
            fill="none"
          />
        )}
        {arcs.map((a) => (
          <Circle
            key={a.key}
            cx={center}
            cy={center}
            r={radius}
            stroke={a.color}
            strokeOpacity={dimmed(a.key) ? 0.25 : 1}
            strokeWidth={thickness}
            fill="none"
            strokeDasharray={`${a.length} ${circumference - a.length}`}
            strokeDashoffset={-a.offset}
            strokeLinecap="butt"
            // Start at 12 o'clock instead of 3.
            transform={`rotate(-90 ${center} ${center})`}
          />
        ))}
      </Svg>
      {arcs.map((a) =>
        a.icon ? (
          <View
            key={`icon-${a.key}`}
            pointerEvents="none"
            style={{
              position: "absolute",
              left: a.iconX - ICON_SIZE / 2,
              top: a.iconY - ICON_SIZE / 2,
              opacity: dimmed(a.key) ? 0.25 : 1,
            }}
          >
            <SymbolView
              name={a.icon as SymbolViewProps["name"]}
              size={ICON_SIZE}
              tintColor={a.color}
            />
          </View>
        ) : null,
      )}
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
    paddingHorizontal: 56,
  },
  centerTitle: {
    ...typography.value,
  },
  centerSub: {
    ...typography.caption,
  },
});
