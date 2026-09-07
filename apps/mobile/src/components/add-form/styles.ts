// Field styles shared by every Add-form section and sheet — one StyleSheet so
// the sections stay visually identical without each re-declaring it.
// The form speaks the inset-grouped idiom (§9): rows live inside material
// Cards, dividers sit on TOP of rows (the group's first row opts out via
// `fieldFirst`), and text inputs are inline — no boxed fields.

import { useMemo } from "react";
import { StyleSheet } from "react-native";

import { radius, spacing, typography, useTheme, withAlpha, type ThemeColors } from "../../theme";

export function useFormStyles() {
  const { colors } = useTheme();
  return useMemo(() => createFormStyles(colors), [colors]);
}

function createFormStyles(colors: ThemeColors) {
  return StyleSheet.create({
    // Each section is a Card; this spaces the groups down the sheet.
    group: {
      marginBottom: spacing.md,
    },
    // A caption footnote under its group, like the settings footers.
    preview: {
      ...typography.caption,
      color: colors.mutedText,
      paddingHorizontal: spacing.md,
      marginTop: -spacing.xs,
      marginBottom: spacing.md,
    },
    amountCard: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.md,
      backgroundColor: colors.material,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.hairline,
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
      borderRadius: 999,
      borderWidth: 1,
      borderColor: colors.hairline,
      backgroundColor: withAlpha(colors.accent, 0.12),
    },
    currencyChipText: { ...typography.label, color: colors.accent },
    amountInput: { ...typography.title, color: colors.text, flex: 1, textAlign: "right" },
    field: {
      paddingVertical: spacing.md,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.hairline,
      gap: spacing.sm,
    },
    rowField: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingVertical: spacing.md,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.hairline,
      gap: spacing.sm,
    },
    // The group's first row: the Card's own edge is the separation.
    fieldFirst: {
      borderTopWidth: 0,
    },
    rowControl: { flex: 1 },
    label: { ...typography.label, color: colors.text },
    // A label with a small (i) explainer sitting right after it.
    labelWithInfo: { flexDirection: "row", alignItems: "center", gap: spacing.xs + 2 },
    // A tappable value on the row's right (the weekend picker): quiet text
    // plus the up/down chevron, native-settings style.
    rowValueButton: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.xs,
      paddingVertical: spacing.xs,
    },
    rowValueText: { ...typography.body, color: colors.accent, fontWeight: "600" },
    // Inline value editing, iOS style: no box, the row is the field.
    input: {
      flex: 1,
      paddingVertical: 0,
      ...typography.body,
      color: colors.text,
      textAlign: "right",
    },
    // A standalone input on a sheet (the logo/domain field): keeps a box,
    // as a material like everything else.
    sheetInput: {
      backgroundColor: colors.material,
      borderWidth: 1,
      borderColor: colors.hairline,
      borderRadius: radius.sm,
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.md,
      ...typography.body,
      color: colors.text,
    },
    cycleRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, flexWrap: "wrap" },
    // Small numeric inputs keep a quiet contour so they read as editable.
    intervalInput: {
      width: 64,
      textAlign: "center",
      flex: 0,
      paddingVertical: spacing.xs + 2,
      borderWidth: 1,
      borderColor: colors.hairline,
      borderRadius: radius.sm,
    },
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
    // The mark grid (identity sheet): same cell language as the category
    // sheet's icon choices — tinted when active, never a solid block (§9f).
    markGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: spacing.sm,
      paddingHorizontal: spacing.lg,
      paddingBottom: spacing.lg,
      justifyContent: "center",
    },
    markCell: {
      width: 44,
      height: 44,
      borderRadius: radius.md,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.material,
      borderWidth: 1,
      borderColor: colors.hairline,
    },
    markCellActive: {
      backgroundColor: withAlpha(colors.accent, 0.18),
      borderColor: withAlpha(colors.accent, 0.45),
    },
    markEmoji: {
      fontSize: 22,
      lineHeight: 28,
    },
  });
}
