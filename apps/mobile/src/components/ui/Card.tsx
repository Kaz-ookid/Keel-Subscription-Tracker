// THE surface card (DESIGN.md §3.4): one background, one radius, two paddings.
// "list" hugs rows that carry their own vertical padding (facts, settings
// rows); "free" is a freestanding block (stat cards, price-change cards).

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
        { backgroundColor: colors.surface },
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
    borderRadius: radius.md,
  },
  list: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  free: {
    padding: spacing.md,
  },
});
