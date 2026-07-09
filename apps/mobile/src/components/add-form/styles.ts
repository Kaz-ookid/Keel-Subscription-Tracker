// Field styles shared by every Add-form section and sheet — one StyleSheet so
// the sections stay visually identical without each re-declaring it.

import { useMemo } from "react";
import { StyleSheet } from "react-native";

import { radius, spacing, typography, useTheme, type ThemeColors } from "../../theme";

export function useFormStyles() {
  const { colors } = useTheme();
  return useMemo(() => createFormStyles(colors), [colors]);
}

function createFormStyles(colors: ThemeColors) {
  return StyleSheet.create({
    preview: {
      ...typography.caption,
      color: colors.mutedText,
      paddingTop: spacing.sm,
    },
    amountCard: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.md,
      backgroundColor: colors.surface,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: "transparent",
      padding: spacing.md,
      marginBottom: spacing.md,
    },
    // Subtle hint for an empty required field (name / amount).
    requiredMissing: {
      borderColor: colors.tones.warning,
    },
    currencyChip: {
      paddingVertical: spacing.xs + 2,
      paddingHorizontal: spacing.md,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.border,
    },
    currencyChipText: { ...typography.label, color: colors.text },
    amountInput: { ...typography.title, color: colors.text, flex: 1, textAlign: "right" },
    field: {
      paddingVertical: spacing.md,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
      gap: spacing.sm,
    },
    rowField: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingVertical: spacing.md,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
      gap: spacing.sm,
    },
    rowControl: { flex: 1 },
    label: { ...typography.label, color: colors.text },
    input: {
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.sm,
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.md,
      ...typography.body,
      color: colors.text,
    },
    cycleRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, flexWrap: "wrap" },
    intervalInput: { width: 64, textAlign: "center" },
    dot: { width: 20, height: 20, borderRadius: 10 },
    swatchGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: spacing.md,
      padding: spacing.lg,
      justifyContent: "center",
    },
    colorSwatch: {
      width: 48,
      height: 48,
      borderRadius: 24,
      alignItems: "center",
      justifyContent: "center",
    },
  });
}
