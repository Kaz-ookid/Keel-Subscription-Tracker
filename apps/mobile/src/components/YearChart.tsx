import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from "react-native-reanimated";

import {
  emphasis,
  radius,
  spacing,
  type ThemeColors,
  typography,
  useStyles,
  useTheme,
} from "../theme";

export interface YearChartMonth {
  /** Short label under the bar, e.g. "Jun". */
  label: string;
  /** Full name for the readout, e.g. "June 2026". */
  name: string;
  /** The month's real outflow in minor units of the charted currency. */
  amount: number;
  /** Pre-formatted amount for the readout. */
  formatted: string;
  /** Set on Januaries: the year this month opens — drawn as a milestone. */
  yearStart?: string;
}

interface Props {
  months: YearChartMonth[];
  /** The expected (smoothed) monthly average in minor units — drawn as a dashed line. */
  average: number;
  averageFormatted: string;
  /** Index of the current month — a thin "now" landmark sits after its bar:
   *  everything right of it is calculated future, left is the past. */
  todayIndex: number;
  /** Selected month index, or null when nothing is selected. */
  selected: number | null;
  onSelect: (index: number) => void;
  /** Optional shared ceiling (minor units) so sibling charts — e.g. one per
   *  account — keep the same relative scale and stay comparable. */
  scaleMax?: number;
}

const CHART_HEIGHT = 140;
// The landmarks' headroom: the "now" line starts here so its buoy and label
// are never clipped by the card's top; bars stop short of the top so the
// label keeps its room when the biggest month would otherwise fill the
// frame (dogfood 2026-10-11). Years are written under the month labels,
// never on the line, so no bar can ever hide one.
const LANDMARK_TOP = 6;
const BAR_MAX = CHART_HEIGHT - 22;
const COL_WIDTH = 30;
const COL_GAP = 4;
const SLOT = COL_WIDTH + COL_GAP;
// The year label's box, centered on its line.
const YEAR_WIDTH = 40;

/** One month's sounding: grows up from the seabed on mount, each a beat
 *  after its neighbour (§3.7 C/D) — the chart takes its soundings once. */
function SoundingBar({
  height,
  color,
  dim,
  delay,
}: {
  height: number;
  color: string;
  dim: boolean;
  delay: number;
}) {
  const grow = useSharedValue(0);
  useEffect(() => {
    grow.value = withDelay(
      delay,
      withTiming(1, { duration: 350, easing: Easing.out(Easing.cubic) }),
    );
  }, [grow, delay]);
  const grown = useAnimatedStyle(() => ({
    height: Math.max(2, height * grow.value),
  }));
  return (
    <Animated.View
      style={[
        barStyles.sounding,
        { backgroundColor: color, opacity: dim ? emphasis.dim : 1 },
        grown,
      ]}
    />
  );
}

const barStyles = StyleSheet.create({
  sounding: {
    borderRadius: 5,
  },
});

/**
 * A horizontally scrollable run of months — slide freely through past and
 * future. Real outflow as bars, the expected average as a dashed line, and a
 * thin "now" landmark separating what happened from what is calculated.
 * Tap a bar to inspect that month.
 */
export function YearChart({
  months,
  average,
  averageFormatted,
  todayIndex,
  selected,
  onSelect,
  scaleMax,
}: Props) {
  const { colors, scheme } = useTheme();
  // Bars are big fills: the semantic warning INK is too hot on the light
  // ground next to the teal, so light borrows the chart palette's soft
  // orange; dark keeps the vivid one.
  const spikeFill = scheme === "dark" ? colors.tones.warning : colors.chart[2];
  const { t } = useTranslation();
  const styles = useStyles(createStyles);

  const max = Math.max(scaleMax ?? 0, average, ...months.map((m) => m.amount), 1);
  const averageY = (average / max) * BAR_MAX;
  const current = selected !== null ? months[selected] : undefined;
  const contentWidth = months.length * SLOT;
  // Open with the current month in view, a little history to its left.
  const initialX = Math.max(0, (todayIndex - 4) * SLOT);

  return (
    <View style={styles.card}>
      <View style={styles.readout}>
        {current ? (
          <>
            <Text style={styles.readoutMonth}>{current.name}</Text>
            <Text style={styles.readoutAmount}>{current.formatted}</Text>
          </>
        ) : (
          <Text style={styles.readoutHint}>{t("insights.chartTapHint")}</Text>
        )}
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentOffset={{ x: initialX, y: 0 }}
      >
        <View style={{ width: contentWidth }}>
          <View style={styles.chartArea}>
            {/* Dashed expected-average line (drawn as segments — reliable everywhere). */}
            {average > 0 && (
              <View style={[styles.averageLine, { bottom: averageY }]} pointerEvents="none">
                {Array.from({ length: months.length * 3 }, (_, i) => (
                  <View key={i} style={styles.dash} />
                ))}
              </View>
            )}

            {/* Year milestones: a hairline at each January; the year itself
                sits under the month labels. */}
            {months.map((m, i) =>
              m.yearStart && i > 0 ? (
                <View
                  key={`year-${m.yearStart}`}
                  style={[styles.yearLine, { left: i * SLOT - COL_GAP / 2 - 0.5 }]}
                  pointerEvents="none"
                />
              ) : null,
            )}

            {/* The "now" landmark: future lies to the right of this line.
                The dot riding its top is the buoy (DESIGN.md §3.7 C), and the
                line names itself right here instead of in a legend. */}
            <View
              style={[styles.todayLine, { left: (todayIndex + 1) * SLOT - COL_GAP / 2 - 1 }]}
              pointerEvents="none"
            >
              <View style={styles.buoy} />
              <Text style={styles.nowText}>{t("insights.chartNow")}</Text>
            </View>

            <View style={styles.bars}>
              {months.map((m, i) => {
                const height = Math.max((m.amount / max) * BAR_MAX, m.amount > 0 ? 3 : 2);
                const spiking = average > 0 && m.amount > average;
                return (
                  <Pressable key={m.name} style={styles.column} onPress={() => onSelect(i)}>
                    {/* The shared selection rule (DESIGN.md punch list):
                        nothing selected = everything full strength; a
                        selection dims the others, never the chosen one. */}
                    <SoundingBar
                      height={height}
                      color={spiking ? spikeFill : colors.accent}
                      dim={!(selected === null || i === selected)}
                      delay={i * 20}
                    />
                  </Pressable>
                );
              })}
            </View>
          </View>

          <View style={styles.labels}>
            {months.map((m, i) => (
              <Text
                key={m.name}
                style={[
                  styles.label,
                  i === selected && { color: colors.text, fontWeight: "700" },
                  i === todayIndex && { color: colors.accent, fontWeight: "700" },
                ]}
              >
                {m.label}
              </Text>
            ))}
          </View>
          {/* The year, centered under its milestone line (between the two
              months it separates), never behind a bar. */}
          {months.some((m, i) => m.yearStart && i > 0) && (
            <View style={styles.yearRow}>
              {months.map((m, i) =>
                m.yearStart && i > 0 ? (
                  <Text
                    key={`label-${m.yearStart}`}
                    style={[styles.yearText, { left: i * SLOT - COL_GAP / 2 - YEAR_WIDTH / 2 }]}
                  >
                    {m.yearStart}
                  </Text>
                ) : null,
              )}
            </View>
          )}
        </View>
      </ScrollView>

      <View style={styles.legend}>
        <View style={styles.legendDashes}>
          {Array.from({ length: 4 }, (_, i) => (
            <View key={i} style={styles.dash} />
          ))}
        </View>
        <Text style={styles.legendText}>
          {t("insights.chartLegend", { amount: averageFormatted })}
        </Text>
      </View>
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    // A material like every §9 card: the aura breathes through the chart.
    card: {
      backgroundColor: colors.material,
      borderWidth: 1,
      borderColor: colors.hairline,
      borderRadius: radius.xl,
      padding: spacing.md,
      gap: spacing.sm,
    },
    readout: {
      flexDirection: "row",
      alignItems: "baseline",
      justifyContent: "space-between",
    },
    readoutMonth: {
      ...typography.label,
      color: colors.text,
    },
    readoutAmount: {
      ...typography.label,
      color: colors.text,
    },
    readoutHint: {
      ...typography.caption,
      color: colors.mutedText,
    },
    chartArea: {
      height: CHART_HEIGHT,
      justifyContent: "flex-end",
    },
    bars: {
      flexDirection: "row",
      alignItems: "flex-end",
      gap: COL_GAP,
      height: CHART_HEIGHT,
    },
    column: {
      width: COL_WIDTH,
      height: CHART_HEIGHT,
      justifyContent: "flex-end",
    },
    averageLine: {
      position: "absolute",
      left: 0,
      right: 0,
      flexDirection: "row",
      justifyContent: "space-between",
      zIndex: 1,
    },
    todayLine: {
      position: "absolute",
      top: LANDMARK_TOP,
      bottom: 0,
      width: 2,
      borderRadius: 1,
      backgroundColor: colors.mutedText,
      opacity: emphasis.dim,
    },
    buoy: {
      position: "absolute",
      top: -3,
      left: -2,
      width: 6,
      height: 6,
      borderRadius: 3,
      backgroundColor: colors.accent,
    },
    // The line's own name, riding beside the buoy at the top.
    nowText: {
      position: "absolute",
      top: -4,
      left: 7,
      fontSize: 9,
      color: colors.mutedText,
      width: 40,
    },
    // Quieter than the "now" landmark: a hairline marking each January.
    yearLine: {
      position: "absolute",
      top: LANDMARK_TOP,
      bottom: 0,
      width: 1,
      backgroundColor: colors.border,
    },
    yearRow: { height: 12 },
    yearText: {
      position: "absolute",
      top: 0,
      width: YEAR_WIDTH,
      textAlign: "center",
      fontSize: 9,
      color: colors.mutedText,
    },
    dash: {
      width: 8,
      height: 2,
      borderRadius: 1,
      backgroundColor: colors.mutedText,
    },
    labels: {
      flexDirection: "row",
      gap: COL_GAP,
    },
    label: {
      width: COL_WIDTH,
      textAlign: "center",
      fontSize: 9,
      color: colors.mutedText,
    },
    legend: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
    },
    legendDashes: {
      flexDirection: "row",
      gap: 3,
    },
    legendText: {
      ...typography.caption,
      color: colors.mutedText,
    },
  });
}
