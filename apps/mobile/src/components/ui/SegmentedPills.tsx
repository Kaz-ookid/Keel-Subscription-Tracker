// THE two-way (or n-way) pill switch (§9f): a material capsule track with a
// sliding accent wash. Two drivers, one look:
// - tap-to-switch (the form's Subscription/Split): the wash animates to the
//   selected pill on its own;
// - pager-driven (Payments' Upcoming/All, the import hub): the caller hands
//   in a shared `progress` in pages (0..n-1) fed by its paging ScrollView, so
//   the wash follows the finger; the caller re-asserts the settled page.
// No screen hand-rolls this capsule again (the hub did once, 2026-10-12, and
// Payments kept a copy for three months: this component now covers both).

import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";

import { hapticSelection } from "../../lib/haptics";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";

import { spacing, type ThemeColors, typography, useStyles, withAlpha } from "../../theme";

interface Option<T extends string> {
  value: T;
  label: string;
}

interface Props<T extends string> {
  options: readonly Option<T>[];
  /** The selected value. May be outside `options` (Payments on the calendar):
   *  then no label is lit and the wash sits where `progress` says. */
  value: T;
  onChange: (value: T) => void;
  /** A pager's live position in pages. When given, the wash follows it
   *  instead of animating on `value` changes. */
  progress?: SharedValue<number>;
  /** Wash opacity, for callers that fade it when something else owns the
   *  selection (Payments' calendar/harbor toggles). */
  washOpacity?: SharedValue<number>;
  style?: StyleProp<ViewStyle>;
}

export function SegmentedPills<T extends string>({
  options,
  value,
  onChange,
  progress,
  washOpacity,
  style,
}: Props<T>) {
  const styles = useStyles(createStyles);
  const [trackWidth, setTrackWidth] = useState(0);
  // Track padding 3 + 1px borders; gaps of 3 between pills.
  const pillWidth =
    trackWidth > 0 ? (trackWidth - 2 - 6 - 3 * (options.length - 1)) / options.length : 0;
  const index = Math.max(
    0,
    options.findIndex((o) => o.value === value),
  );

  // Tap mode's own driver, in pages like `progress`.
  const washX = useSharedValue(index);
  useEffect(() => {
    // Reanimated shared values are driven by assigning `.value`.
    if (!progress) washX.value = withTiming(index, { duration: 200 });
  }, [index, progress, washX]);
  const washStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: (progress ? progress.value : washX.value) * (pillWidth + 3) }],
    opacity: washOpacity ? washOpacity.value : 1,
  }));

  return (
    <View style={[styles.track, style]} onLayout={(e) => setTrackWidth(e.nativeEvent.layout.width)}>
      {pillWidth > 0 && <Animated.View style={[styles.wash, { width: pillWidth }, washStyle]} />}
      {options.map((option) => {
        const active = option.value === value;
        return (
          <Pressable
            key={option.value}
            style={styles.pill}
            onPress={() => {
              // The picker tick (§3.6): only when the selection actually moves.
              if (option.value !== value) hapticSelection();
              onChange(option.value);
            }}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
          >
            <Text style={[styles.label, active && styles.labelActive]}>{option.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    track: {
      flexDirection: "row",
      backgroundColor: colors.material,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: colors.hairline,
      padding: 3,
      gap: 3,
      // The wash must never escape the capsule, even mid-overscroll.
      overflow: "hidden",
    },
    wash: {
      position: "absolute",
      top: 3,
      bottom: 3,
      left: 3,
      borderRadius: 999,
      backgroundColor: withAlpha(colors.accent, 0.2),
    },
    pill: {
      flex: 1,
      alignItems: "center",
      paddingVertical: spacing.sm,
      borderRadius: 999,
    },
    label: { ...typography.label, color: colors.mutedText },
    labelActive: { color: colors.accent },
  });
}
