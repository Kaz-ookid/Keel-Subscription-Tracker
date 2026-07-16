// The Apple-Settings row grammar (§9d): a saturated icon chip, the label, an
// optional muted value, then either a custom right element (a Switch) or a
// chevron for rows that navigate. One component keeps every settings row
// aligned and lets the screen read as a declarative list.

import { SymbolView } from "expo-symbols";
import { useMemo, type ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { spacing, typography, useTheme, type ThemeColors } from "../../theme";

/** The saturated rounded square with a white glyph — the system's own visual
 *  language for settings lists. */
export function IconChip({ icon, color }: { icon: string; color: string }) {
  return (
    <View style={[chipStyles.chip, { backgroundColor: color }]}>
      <SymbolView name={icon as never} size={15} tintColor="#FFFFFF" />
    </View>
  );
}

const chipStyles = StyleSheet.create({
  chip: {
    width: 29,
    height: 29,
    borderRadius: 6.5,
    alignItems: "center",
    justifyContent: "center",
  },
});

interface Props {
  icon: string;
  chipColor: string;
  label: string;
  /** Muted trailing text (current value); renders before the chevron. */
  value?: string;
  /** Rows that navigate show the chevron; toggles don't. */
  chevron?: boolean;
  /** Hairline on top — every row but a card's first. */
  divider?: boolean;
  onPress?: () => void;
  /** Custom right element (a Switch); rendered after the value. */
  right?: ReactNode;
}

export function SettingsRow({
  icon,
  chipColor,
  label,
  value,
  chevron,
  divider,
  onPress,
  right,
}: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const content = (
    <>
      <IconChip icon={icon} color={chipColor} />
      <Text style={styles.rowText}>{label}</Text>
      {value !== undefined && <Text style={styles.rowValue}>{value}</Text>}
      {right}
      {chevron && <SymbolView name="chevron.right" size={13} tintColor={colors.mutedText} />}
    </>
  );
  return onPress ? (
    <Pressable style={[styles.row, divider && styles.rowDivider]} onPress={onPress}>
      {content}
    </Pressable>
  ) : (
    <View style={[styles.row, divider && styles.rowDivider]}>{content}</View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    row: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
      paddingVertical: spacing.md,
    },
    rowText: {
      ...typography.body,
      color: colors.text,
      flex: 1,
    },
    rowValue: {
      ...typography.body,
      color: colors.mutedText,
    },
    rowDivider: {
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
    },
  });
}
