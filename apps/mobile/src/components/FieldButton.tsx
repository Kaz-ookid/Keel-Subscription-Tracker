import { SymbolView } from "expo-symbols";
import { useMemo, type ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { spacing, typography, useTheme, type ThemeColors } from "../theme";

interface Props {
  label: string;
  /** Trailing text (e.g. the selected value). */
  value?: string;
  /** Optional element shown just before the chevron (e.g. an icon). */
  accessory?: ReactNode;
  /** Subtle "this still needs attention" tint on the value text. */
  hint?: boolean;
  /** The group's first row carries no divider (dividers sit on TOP). */
  first?: boolean;
  onPress: () => void;
}

/** A tappable form row: label · value/accessory · chevron — the iOS "drill in"
 *  affordance used by currency, category, colour, reminder and date. */
export function FieldButton({ label, value, accessory, hint, first, onPress }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <Pressable onPress={onPress} style={[styles.row, first && styles.rowFirst]}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.right}>
        {value ? (
          <Text style={[styles.value, hint && { color: colors.tones.warning }]}>{value}</Text>
        ) : null}
        {accessory}
        <SymbolView name="chevron.right" size={13} tintColor={colors.mutedText} />
      </View>
    </Pressable>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    // Divider on top (§9 list rule): the last row never trails a line.
    row: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingVertical: spacing.md,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
    },
    rowFirst: {
      borderTopWidth: 0,
    },
    label: {
      ...typography.label,
      color: colors.text,
    },
    right: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
    },
    value: {
      ...typography.body,
      color: colors.mutedText,
    },
  });
}
