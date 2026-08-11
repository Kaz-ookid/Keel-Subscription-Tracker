// THE two-way (or n-way) pill switch (§9f): a material capsule track with a
// sliding accent wash — the same motion as the Payments Upcoming/All
// switcher, extracted so no screen hand-rolls it again. (Payments itself
// keeps its own copy of the visuals because its wash is driven LIVE by the
// pager's scroll position; this component owns the plain tap-to-switch case.)

import { useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { hapticSelection } from "../../lib/haptics";
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";

import { spacing, typography, useTheme, withAlpha, type ThemeColors } from "../../theme";

interface Option<T extends string> {
  value: T;
  label: string;
}

interface Props<T extends string> {
  options: readonly Option<T>[];
  value: T;
  onChange: (value: T) => void;
}

export function SegmentedPills<T extends string>({ options, value, onChange }: Props<T>) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [trackWidth, setTrackWidth] = useState(0);
  // Track padding 3 + 1px borders; gaps of 3 between pills.
  const pillWidth =
    trackWidth > 0 ? (trackWidth - 2 - 6 - 3 * (options.length - 1)) / options.length : 0;
  const index = Math.max(
    0,
    options.findIndex((o) => o.value === value),
  );

  const washX = useSharedValue(0);
  useEffect(() => {
    // Reanimated shared values are driven by assigning `.value`.
    washX.value = withTiming(index * (pillWidth + 3), { duration: 200 });
  }, [index, pillWidth, washX]);
  const washStyle = useAnimatedStyle(() => ({ transform: [{ translateX: washX.value }] }));

  return (
    <View style={styles.track} onLayout={(e) => setTrackWidth(e.nativeEvent.layout.width)}>
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
