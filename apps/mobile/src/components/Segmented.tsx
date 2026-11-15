import { Pressable, StyleSheet, View } from "react-native";
import Animated, { interpolateColor, useAnimatedStyle } from "react-native-reanimated";

import { useSelectionProgress } from "../lib/motion";
import { spacing, typography, useTheme, withAlpha } from "../theme";

export interface SegmentedOption<T> {
  value: T;
  label: string;
}

interface Props<T> {
  options: SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

// One pill: its wash, contour and label crossfade on selection
// (useSelectionProgress), like ui/Chip.
function Pill({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  const { colors } = useTheme();
  const progress = useSelectionProgress(active);
  // Tinted materials (§9f): a hairline capsule, never a solid block.
  // Selected = the quiet accent wash (selection, not action).
  const fills = [withAlpha(colors.accent, 0), withAlpha(colors.accent, 0.18)];
  const contours = [colors.hairline, withAlpha(colors.accent, 0.45)];
  const inks = [colors.text, colors.accent];
  const surface = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(progress.value, [0, 1], fills),
    borderColor: interpolateColor(progress.value, [0, 1], contours),
  }));
  const ink = useAnimatedStyle(() => ({
    color: interpolateColor(progress.value, [0, 1], inks),
  }));
  return (
    <AnimatedPressable
      onPress={onPress}
      style={[styles.pill, surface]}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
    >
      <Animated.Text style={[styles.label, active && styles.labelActive, ink]}>
        {label}
      </Animated.Text>
    </AnimatedPressable>
  );
}

/** The WRAP-AROUND pill picker for lists that do not fit one track (the
 *  day/week/month/year unit). Two-way switches use ui/SegmentedPills. */
export function Segmented<T extends string | number>({ options, value, onChange }: Props<T>) {
  return (
    <View style={styles.row}>
      {options.map((opt) => (
        <Pill
          key={String(opt.value)}
          label={opt.label}
          active={opt.value === value}
          onPress={() => onChange(opt.value)}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    justifyContent: "flex-end",
  },
  pill: {
    paddingVertical: spacing.xs + 2,
    paddingHorizontal: spacing.md,
    borderRadius: 999,
    borderWidth: 1,
  },
  label: { ...typography.caption },
  labelActive: { fontWeight: "600" },
});
