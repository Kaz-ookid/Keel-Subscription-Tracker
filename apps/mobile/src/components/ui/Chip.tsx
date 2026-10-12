// THE filter chip (DESIGN.md §3.4). One implementation for every chip row
// (accounts, categories, ranges); the selected state is the quiet sea-glass
// wash with accent text, readable in both schemes, instead of the heavy
// navy fill the audit found copy-pasted across screens.

import { Pressable, StyleSheet, Text, View } from "react-native";

import { spacing, type ThemeColors, typography, useStyles, withAlpha } from "../../theme";

interface Props {
  label: string;
  selected: boolean;
  onPress: () => void;
  /** Optional press-and-hold action (account chips open their editor). */
  onLongPress?: () => void;
  /** Optional leading color dot (account chips). */
  dot?: string;
}

export function Chip({ label, selected, onPress, onLongPress, dot }: Props) {
  const styles = useStyles(createStyles);
  return (
    <Pressable
      style={[styles.chip, selected && styles.chipSelected]}
      onPress={onPress}
      onLongPress={onLongPress}
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
    // Material capsule (§9f): translucent over the Ambient, hairline contour;
    // selection is an accent TINT, never a solid block.
    chip: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.xs + 2,
      paddingVertical: spacing.xs + 2,
      paddingHorizontal: spacing.md,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: colors.hairline,
      backgroundColor: colors.material,
    },
    chipSelected: {
      backgroundColor: withAlpha(colors.accent, 0.18),
      borderColor: withAlpha(colors.accent, 0.45),
    },
    dot: { width: 8, height: 8, borderRadius: 4 },
    text: { ...typography.caption, fontWeight: "600", color: colors.text },
    textSelected: { color: colors.accent },
  });
}
