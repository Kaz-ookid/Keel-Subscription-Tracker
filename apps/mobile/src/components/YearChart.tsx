import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { spacing, tones, typography, useTheme, type ThemeColors } from "../theme";

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
  /** The theoretical monthly average in minor units — drawn as a dashed line. */
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
const COL_WIDTH = 30;
const COL_GAP = 4;
const SLOT = COL_WIDTH + COL_GAP;

/**
 * A horizontally scrollable run of months — slide freely through past and
 * future. Real outflow as bars, the theory average as a dashed line, and a
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
  const { colors } = useTheme();
  const { t } = useTranslation();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const max = Math.max(scaleMax ?? 0, average, ...months.map((m) => m.amount), 1);
  const averageY = (average / max) * CHART_HEIGHT;
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
          <Text style={styles.readoutHint}>Tap a month for its payments</Text>
        )}
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentOffset={{ x: initialX, y: 0 }}
      >
        <View style={{ width: contentWidth }}>
          <View style={styles.chartArea}>
            {/* Dashed theory-average line (drawn as segments — reliable everywhere). */}
            {average > 0 && (
              <View style={[styles.averageLine, { bottom: averageY }]} pointerEvents="none">
                {Array.from({ length: months.length * 3 }, (_, i) => (
                  <View key={i} style={styles.dash} />
                ))}
              </View>
            )}

            {/* Year milestones: a hairline + vertical year at each January. */}
            {months.map((m, i) =>
              m.yearStart && i > 0 ? (
                <View
                  key={`year-${m.yearStart}`}
                  style={[styles.yearMark, { left: i * SLOT - COL_GAP / 2 - 1 }]}
                  pointerEvents="none"
                >
                  <View style={styles.yearLine} />
                  <Text style={styles.yearText}>{m.yearStart}</Text>
                </View>
              ) : null,
            )}

            {/* The "now" landmark: future lies to the right of this line. */}
            <View
              style={[styles.todayLine, { left: (todayIndex + 1) * SLOT - COL_GAP / 2 - 1 }]}
              pointerEvents="none"
            />

            <View style={styles.bars}>
              {months.map((m, i) => {
                const height = Math.max((m.amount / max) * CHART_HEIGHT, m.amount > 0 ? 3 : 2);
                const spiking = average > 0 && m.amount > average;
                return (
                  <Pressable key={m.name} style={styles.column} onPress={() => onSelect(i)}>
                    <View
                      style={[
                        styles.bar,
                        {
                          height,
                          backgroundColor: spiking ? tones.warning : colors.accent,
                          opacity: i === selected ? 1 : 0.55,
                        },
                      ]}
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
        <View style={styles.legendTodayLine} />
        <Text style={styles.legendText}>now</Text>
      </View>
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    card: {
      backgroundColor: colors.surface,
      borderRadius: 16,
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
    bar: {
      borderRadius: 3,
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
      top: 0,
      bottom: 0,
      width: 2,
      borderRadius: 1,
      backgroundColor: colors.mutedText,
      opacity: 0.45,
    },
    // Quieter than the "now" landmark: a hairline with the year written
    // vertically along it, marking each January like a roadside milestone.
    yearMark: {
      position: "absolute",
      top: 0,
      bottom: 0,
      width: 1,
    },
    yearLine: {
      flex: 1,
      width: 1,
      backgroundColor: colors.border,
    },
    yearText: {
      position: "absolute",
      top: 16,
      left: -16,
      width: 32,
      textAlign: "center",
      fontSize: 9,
      color: colors.mutedText,
      transform: [{ rotate: "90deg" }],
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
    legendTodayLine: {
      width: 2,
      height: 10,
      borderRadius: 1,
      backgroundColor: colors.mutedText,
      opacity: 0.45,
      marginLeft: spacing.sm,
    },
    legendText: {
      ...typography.caption,
      color: colors.mutedText,
    },
  });
}
