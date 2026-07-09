import { useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { radius, spacing, typography, useTheme, type ThemeColors } from "../theme";

export interface SegmentedOption<T> {
  value: T;
  label: string;
}

interface Props<T> {
  options: SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
}

/** A simple wrap-around pill selector — no native picker, no dependency. */
export function Segmented<T extends string | number>({ options, value, onChange }: Props<T>) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
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
    pill: {
      paddingVertical: spacing.xs + 2,
      paddingHorizontal: spacing.md,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
    },
    // Selected = the quiet sea-glass wash (selection, not action).
    pillActive: {
      backgroundColor: colors.accentSoft,
      borderColor: colors.accent,
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
