// THE filter chip (DESIGN.md §3.4). One implementation for every chip row
// (accounts, categories, ranges); the selected state is the quiet sea-glass
// wash with accent text, readable in both schemes, instead of the heavy
// navy fill the audit found copy-pasted across screens.

import { useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { radius, spacing, typography, useTheme, type ThemeColors } from "../../theme";

interface Props {
  label: string;
  selected: boolean;
  onPress: () => void;
  /** Optional leading color dot (account chips). */
  dot?: string;
}

export function Chip({ label, selected, onPress, dot }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <Pressable
      style={[styles.chip, selected && styles.chipSelected]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
    >
      {dot ? <View style={[styles.dot, { backgroundColor: dot }]} /> : null}
      <Text style={[styles.text, selected && styles.textSelected]}>{label}</Text>
    </Pressable>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    chip: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.xs + 2,
      paddingVertical: spacing.xs + 2,
      paddingHorizontal: spacing.md,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
    },
    chipSelected: {
      backgroundColor: colors.accentSoft,
      borderColor: colors.accent,
    },
    dot: { width: 8, height: 8, borderRadius: 4 },
    text: { ...typography.caption, fontWeight: "600", color: colors.text },
    textSelected: { color: colors.accent },
  });
}
