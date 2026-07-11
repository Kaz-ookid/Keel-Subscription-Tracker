// THE surface card (DESIGN.md §3.4, rebuilt for §9): a MATERIAL — a
// translucent fill with a hairline contour over the Ambient stage, so the
// aura breathes through every card. "list" hugs rows that carry their own
// vertical padding (facts, settings rows); "free" is a freestanding block
// (stat cards, price-change cards).

import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";

import { radius, spacing, useTheme } from "../../theme";
import type { ReactNode } from "react";

export type CardVariant = "list" | "free";

interface Props {
  variant?: CardVariant;
  style?: StyleProp<ViewStyle>;
  children: ReactNode;
}

export function Card({ variant = "list", style, children }: Props) {
  const { colors } = useTheme();
  return (
    <View
      style={[
        styles.base,
        { backgroundColor: colors.material, borderColor: colors.hairline },
        variant === "list" ? styles.list : styles.free,
        style,
      ]}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: radius.xl,
    borderWidth: 1,
    // Content (row washes, expanded folds) must respect the curve.
    overflow: "hidden",
  },
  list: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  free: {
    padding: spacing.md,
  },
});
