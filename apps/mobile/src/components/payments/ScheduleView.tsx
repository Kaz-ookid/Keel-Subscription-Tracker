// One schedule slot, two lenses (decision 2026-07-10): the month grid is the
// default, and the Harbor is the bonus lens over the same data — redundant on
// purpose, delightful on purpose, never competing for structural weight. The
// sailboat button in the calendar header opens it (only while the Settings
// debug experiment is on); a floating calendar chip sails you back.

import { SymbolView } from "expo-symbols";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, StyleSheet, View } from "react-native";

import { loadHarborEnabled, onHarborChange } from "../../lib/experiments";
import { radius, spacing, useTheme, type ThemeColors } from "../../theme";
import { CalendarMonthView } from "./CalendarMonthView";
import { HarborView } from "./HarborView";

export function ScheduleView() {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [lens, setLens] = useState<"grid" | "harbor">("grid");
  const [harborOn, setHarborOn] = useState(false);
  useEffect(() => {
    void loadHarborEnabled().then(setHarborOn);
    return onHarborChange((enabled) => {
      setHarborOn(enabled);
      if (!enabled) setLens("grid");
    });
  }, []);

  if (lens === "harbor" && harborOn) {
    return (
      <View style={styles.fill}>
        <HarborView />
        <Pressable
          style={styles.lensChip}
          onPress={() => setLens("grid")}
          accessibilityLabel={t("payments.calendarA11y")}
        >
          <SymbolView name="calendar" size={17} tintColor={colors.accent} />
        </Pressable>
      </View>
    );
  }
  return <CalendarMonthView onOpenHarbor={harborOn ? () => setLens("harbor") : undefined} />;
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    fill: { flex: 1 },
    // Floats over the harbor canvas, clear of the paused shelf below it.
    lensChip: {
      position: "absolute",
      top: spacing.md + spacing.sm,
      right: spacing.md + spacing.sm,
      width: 36,
      height: 36,
      borderRadius: radius.md,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: "center",
      justifyContent: "center",
    },
  });
}
