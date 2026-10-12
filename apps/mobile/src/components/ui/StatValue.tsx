// A labelled stat (DESIGN.md §3.4): micro overline, value-size number, quiet
// hint — the pattern the Insights stat cards hand-rolled. Lives inside a Card.

import { StyleSheet, Text, View } from "react-native";

import { type ThemeColors, typography, useStyles } from "../../theme";
import { LivingNumber } from "./LivingNumber";

interface Props {
  label: string;
  value: string;
  hint?: string;
  /** Tint for the value itself (e.g. a warning-colored drift). */
  color?: string;
}

export function StatValue({ label, value, hint, color }: Props) {
  const styles = useStyles(createStyles);
  return (
    <View style={styles.container}>
      <Text style={styles.label}>{label}</Text>
      {/* Living number (§9g): stat changes roll instead of swapping. */}
      <LivingNumber text={value} style={[styles.value, color != null && { color }]} />
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: {
      gap: 2,
    },
    label: {
      ...typography.micro,
      color: colors.mutedText,
    },
    // h1-sized (§9e): a stat tile's number should land from across the room.
    value: {
      ...typography.h1,
      color: colors.text,
    },
    hint: {
      ...typography.caption,
      color: colors.mutedText,
    },
  });
}
