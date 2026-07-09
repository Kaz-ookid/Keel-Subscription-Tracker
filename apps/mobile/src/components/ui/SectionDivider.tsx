// The line-label-line divider (DESIGN.md §3.4): an uppercase label between two
// hairlines — the "light but unmistakable" boundary the Upcoming timeline uses
// for month breaks. `trailing` slots a chevron when the divider is tappable.

import { useMemo, type ReactNode } from "react";
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";

import { spacing, typography, useTheme, type ThemeColors } from "../../theme";

interface Props {
  label: string;
  /** Rendered between the label and the second line (e.g. a fold chevron). */
  trailing?: ReactNode;
  style?: StyleProp<ViewStyle>;
}

export function SectionDivider({ label, trailing, style }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <View style={[styles.row, style]}>
      <View style={styles.line} />
      <Text style={styles.label}>{label}</Text>
      {trailing}
      <View style={styles.line} />
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    row: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
    },
    line: {
      flex: 1,
      height: StyleSheet.hairlineWidth,
      backgroundColor: colors.mutedText,
    },
    label: {
      ...typography.caption,
      color: colors.mutedText,
      fontWeight: "700",
      textTransform: "uppercase",
      letterSpacing: 1,
    },
  });
}
