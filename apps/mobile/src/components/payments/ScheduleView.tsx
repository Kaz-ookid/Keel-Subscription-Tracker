// One schedule slot, two lenses (decision 2026-07-10): the month grid is the
// default, and the Harbor is the bonus lens over the same data — redundant on
// purpose, delightful on purpose, never competing for structural weight.
//
// The lens toggle lives in ONE slot: the right end of the header row, the
// same 32pt button in both lenses (sailboat out, back arrow home — not a
// second calendar icon; the switcher above already has one). The lens state
// is owned by the Payments screen so its calendar toggle can always bring
// the grid back. Each lens fades in, so the swap reads as one surface
// changing, not a teardown.

import { SymbolView } from "expo-symbols";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, StyleSheet, View } from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";

import { radius, spacing, useTheme, type ThemeColors } from "../../theme";
import { CalendarMonthView } from "./CalendarMonthView";
import { HarborView } from "./HarborView";

export type ScheduleLens = "grid" | "harbor";

export function ScheduleView({
  lens,
  onLens,
  harborEnabled,
}: {
  lens: ScheduleLens;
  onLens: (lens: ScheduleLens) => void;
  harborEnabled: boolean;
}) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const styles = useMemo(() => createStyles(colors), [colors]);

  if (lens === "harbor" && harborEnabled) {
    return (
      <Animated.View style={styles.fill} entering={FadeIn.duration(220)}>
        {/* The same header slot as the calendar's: the toggle stays put. */}
        <View style={styles.lensRow}>
          <View style={styles.lensSpacer} />
          <Pressable
            style={styles.lensButton}
            onPress={() => onLens("grid")}
            accessibilityLabel={t("payments.calendarA11y")}
          >
            <SymbolView name="arrow.backward" size={15} tintColor={colors.text} />
          </Pressable>
        </View>
        <HarborView />
      </Animated.View>
    );
  }
  return (
    <Animated.View style={styles.fill} entering={FadeIn.duration(220)}>
      <CalendarMonthView onOpenHarbor={harborEnabled ? () => onLens("harbor") : undefined} />
    </Animated.View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    fill: { flex: 1 },
    // Mirrors the calendar header's geometry (content padding + 32pt button)
    // so the toggle sits in the identical screen position in both lenses.
    lensRow: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: spacing.md,
      paddingTop: spacing.md,
    },
    lensSpacer: { flex: 1 },
    lensButton: {
      width: 32,
      height: 32,
      borderRadius: radius.sm,
      backgroundColor: colors.surface,
      alignItems: "center",
      justifyContent: "center",
    },
  });
}
