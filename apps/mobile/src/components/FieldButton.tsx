import { SymbolView } from "expo-symbols";
import { useMemo, type ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { spacing, tones, typography, useTheme, type ThemeColors } from "../theme";

interface Props {
  label: string;
  /** Trailing text (e.g. the selected value). */
  value?: string;
  /** Optional element shown just before the chevron (e.g. an icon). */
  accessory?: ReactNode;
  /** Subtle "this still needs attention" tint on the value text. */
  hint?: boolean;
  onPress: () => void;
}

/** A tappable form row: label · value/accessory · chevron — the iOS "drill in"
 *  affordance used by currency, category, colour, reminder and date. */
export function FieldButton({ label, value, accessory, hint, onPress }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <Pressable onPress={onPress} style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.right}>
        {value ? (
          <Text style={[styles.value, hint && { color: tones.warning }]}>{value}</Text>
        ) : null}
        {accessory}
        <SymbolView name="chevron.right" size={13} tintColor={colors.mutedText} />
      </View>
    </Pressable>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    row: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingVertical: spacing.md,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
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
