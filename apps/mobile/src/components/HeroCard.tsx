import { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";

import { emphasis, radius, spacing, typography, useTheme, type ThemeColors } from "../theme";

interface Props {
  /** Small uppercase context line, e.g. "Due this month". */
  label: string;
  /** The one number that matters, already formatted. */
  amount: string;
  /** Quieter follow-up line, e.g. "then 89,99 € in July". */
  sub?: string;
}

/** The navy headline card used on the Subscriptions and Upcoming screens. */
export function HeroCard({ label, amount, sub }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <View style={styles.card}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.amount}>{amount}</Text>
      {sub ? <Text style={styles.sub}>{sub}</Text> : null}
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
  });
}
