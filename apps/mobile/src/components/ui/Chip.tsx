// THE filter chip (DESIGN.md §3.4). One implementation for every chip row
// (accounts, categories, ranges); the selected state is the quiet sea-glass
// wash with accent text, readable in both schemes, instead of the heavy
// navy fill the audit found copy-pasted across screens. Selecting crossfades
// (useSelectionProgress), like every pill picker.

import { Pressable, StyleSheet, View } from "react-native";
import Animated, { interpolateColor, useAnimatedStyle } from "react-native-reanimated";

import { useSelectionProgress } from "../../lib/motion";
import { spacing, typography, useTheme, withAlpha } from "../../theme";

interface Props {
  label: string;
  selected: boolean;
  onPress: () => void;
  /** Optional press-and-hold action (account chips open their editor). */
  onLongPress?: () => void;
  /** Optional leading color dot (account chips). */
  dot?: string;
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export function Chip({ label, selected, onPress, onLongPress, dot }: Props) {
  const { colors } = useTheme();
  const progress = useSelectionProgress(selected);
  // Material capsule (§9f): translucent over the Ambient, hairline contour;
  // selection is an accent TINT, never a solid block.
  const fills = [colors.material, withAlpha(colors.accent, 0.18)];
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
      style={[styles.chip, surface]}
      onPress={onPress}
      onLongPress={onLongPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
    >
      {dot ? <View style={[styles.dot, { backgroundColor: dot }]} /> : null}
      <Animated.Text
        style={[styles.text, ink]}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.8}
      >
        {label}
      </Animated.Text>
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs + 2,
    paddingVertical: spacing.xs + 2,
    paddingHorizontal: spacing.md,
    borderRadius: 999,
    borderWidth: 1,
  },
  dot: { width: 8, height: 8, borderRadius: 4 },
  // flexShrink: beside the dot the label narrows instead of overflowing.
  text: { ...typography.caption, fontWeight: "600", flexShrink: 1 },
});
