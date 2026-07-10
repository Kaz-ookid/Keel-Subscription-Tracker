import { LinearGradient } from "expo-linear-gradient";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { StyleSheet, Text, View } from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";

import { emphasis, radius, spacing, typography, useTheme, type ThemeColors } from "../theme";
import { Waterline } from "./Waterline";

interface Props {
  /** Small uppercase context line, e.g. "Due this month". */
  label: string;
  /** The one number that matters, already formatted. */
  amount: string;
  /** Quieter follow-up line, e.g. "then 89,99 € in July". */
  sub?: string;
  /** This month vs the monthly average (1 = riding at average). When set,
   *  the Waterline appears: above average the water climbs, below it the
   *  card rides high (DESIGN.md §3.7 A). */
  draft?: number;
}

/** The navy headline card: hull gradient, one number, and (where a screen can
 *  say "vs average") the animated waterline. */
export function HeroCard({ label, amount, sub, draft }: Props) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [width, setWidth] = useState(0);

  // 1 = average → a calm band; the level moves a bounded ±24px around it so
  // an outlier month never floods the text.
  const waterHeight =
    draft !== undefined ? 18 + Math.max(-0.5, Math.min(draft - 1, 1)) * 24 : undefined;
  // The water is data, so it says what it means: the sea-glass caption is the
  // waterline's own color, tying the words to the level.
  const pct = draft !== undefined ? Math.round((draft - 1) * 100) : 0;
  const waterCaption =
    draft === undefined
      ? undefined
      : pct >= 5
        ? t("hero.aboveAverage", { pct })
        : pct <= -5
          ? t("hero.belowAverage", { pct: -pct })
          : t("hero.atAverage");

  return (
    <View style={styles.card} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      <LinearGradient colors={[colors.navy, colors.navyDeep]} style={StyleSheet.absoluteFill} />
      {waterHeight !== undefined && width > 0 && (
        <Waterline height={waterHeight} width={width} color={colors.accentStrong} />
      )}
      <Text style={styles.label}>{label}</Text>
      {/* Re-keyed by value so a new number gets its one quiet fade-in. */}
      <Animated.Text key={amount} entering={FadeIn.duration(250)} style={styles.amount}>
        {amount}
      </Animated.Text>
      {sub ? <Text style={styles.sub}>{sub}</Text> : null}
      {waterCaption ? <Text style={styles.waterCaption}>{waterCaption}</Text> : null}
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    card: {
      backgroundColor: colors.navy,
      borderRadius: radius.lg,
      padding: spacing.lg,
      gap: spacing.xs,
      overflow: "hidden",
    },
    label: {
      ...typography.micro,
      color: colors.white,
      opacity: emphasis.hint,
      letterSpacing: 0.6,
    },
    amount: {
      ...typography.title,
      color: colors.white,
    },
    sub: {
      ...typography.caption,
      color: colors.white,
      opacity: emphasis.hint,
    },
    waterCaption: {
      ...typography.caption,
      fontWeight: "600",
      color: colors.accentStrong,
      marginTop: spacing.xs,
    },
  });
}
