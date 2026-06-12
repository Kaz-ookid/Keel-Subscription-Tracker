import { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

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
}

interface Props {
  months: YearChartMonth[];
  /** The theoretical monthly average in minor units — drawn as a dashed line. */
  average: number;
  averageFormatted: string;
  /** Bars before this index are the past (already paid) — drawn muted. */
  todayIndex?: number;
}

const CHART_HEIGHT = 140;

/**
 * Twelve bars of REAL monthly outflow with a dashed line at the THEORY
 * average. Past months (muted) show what was actually paid; calm future
 * months sit under the line and the bar spiking above it is the yearly fee.
 * Tap a bar to read the exact month.
 */
export function YearChart({ months, average, averageFormatted, todayIndex = 0 }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [selected, setSelected] = useState(todayIndex);

  const max = Math.max(average, ...months.map((m) => m.amount), 1);
  const averageY = (average / max) * CHART_HEIGHT;
  const current = months[selected];

  return (
    <View style={styles.card}>
      <View style={styles.readout}>
        <Text style={styles.readoutMonth}>{current?.name}</Text>
        <Text style={styles.readoutAmount}>{current?.formatted}</Text>
      </View>

      <View style={styles.chartArea}>
        {/* Dashed theory-average line (drawn as segments — reliable everywhere). */}
        {average > 0 && (
          <View style={[styles.averageLine, { bottom: averageY }]} pointerEvents="none">
            {Array.from({ length: 24 }, (_, i) => (
              <View key={i} style={styles.dash} />
            ))}
          </View>
        )}

        <View style={styles.bars}>
          {months.map((m, i) => {
            const height = Math.max((m.amount / max) * CHART_HEIGHT, m.amount > 0 ? 3 : 2);
            const spiking = average > 0 && m.amount > average;
            // The past is fact: muted, never warning-tinted.
            const past = i < todayIndex;
            return (
              <Pressable key={m.name} style={styles.column} onPress={() => setSelected(i)}>
                <View
                  style={[
                    styles.bar,
                    {
                      height,
                      backgroundColor: past
                        ? colors.mutedText
                        : spiking
                          ? tones.warning
                          : colors.accent,
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
            style={[styles.label, i === selected && { color: colors.text, fontWeight: "700" }]}
          >
            {m.label}
          </Text>
        ))}
      </View>

      <View style={styles.legend}>
        <View style={styles.legendDashes}>
          {Array.from({ length: 4 }, (_, i) => (
            <View key={i} style={styles.dash} />
          ))}
        </View>
        <Text style={styles.legendText}>theory average · {averageFormatted}/mo</Text>
        {todayIndex > 0 && (
          <>
            <View style={[styles.legendSwatch, { backgroundColor: colors.mutedText }]} />
            <Text style={styles.legendText}>paid</Text>
          </>
        )}
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
    chartArea: {
      height: CHART_HEIGHT,
      justifyContent: "flex-end",
    },
    bars: {
      flexDirection: "row",
      alignItems: "flex-end",
      gap: 4,
      height: CHART_HEIGHT,
    },
    column: {
      flex: 1,
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
    dash: {
      width: 8,
      height: 2,
      borderRadius: 1,
      backgroundColor: colors.mutedText,
    },
    labels: {
      flexDirection: "row",
      gap: 4,
    },
    label: {
      flex: 1,
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
    legendSwatch: {
      width: 8,
      height: 8,
      borderRadius: 2,
      marginLeft: spacing.sm,
    },
    legendText: {
      ...typography.caption,
      color: colors.mutedText,
    },
  });
}
