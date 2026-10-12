import { Pressable, StyleSheet, Text, View } from "react-native";

import { spacing, type ThemeColors, typography, useStyles, withAlpha } from "../theme";

export interface SegmentedOption<T> {
  value: T;
  label: string;
}

interface Props<T> {
  options: SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
}

/** The WRAP-AROUND pill picker for lists that do not fit one track (the
 *  day/week/month/year unit). Two-way switches use ui/SegmentedPills. */
export function Segmented<T extends string | number>({ options, value, onChange }: Props<T>) {
  const styles = useStyles(createStyles);
  return (
    <View style={styles.row}>
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <Pressable
            key={String(opt.value)}
            onPress={() => onChange(opt.value)}
            style={[styles.pill, active && styles.pillActive]}
          >
            <Text style={[styles.label, active && styles.labelActive]}>{opt.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    row: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: spacing.sm,
      justifyContent: "flex-end",
    },
    // Tinted materials (§9f): a hairline capsule, never a solid block.
    pill: {
      paddingVertical: spacing.xs + 2,
      paddingHorizontal: spacing.md,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: colors.hairline,
    },
    // Selected = the quiet accent wash (selection, not action).
    pillActive: {
      backgroundColor: withAlpha(colors.accent, 0.18),
      borderColor: withAlpha(colors.accent, 0.45),
    },
    label: {
      ...typography.caption,
      color: colors.text,
    },
    labelActive: {
      color: colors.accent,
      fontWeight: "600",
    },
  });
}
