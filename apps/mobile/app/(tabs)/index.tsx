// The first tab: one screen, two zooms. "Upcoming" is the cash-flow timeline
// (what hits, when, from which account); "All" is the catalog of every item,
// including ended/paused ones a timeline can't show.

import { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { SubscriptionsView } from "../../src/components/payments/SubscriptionsView";
import { UpcomingView } from "../../src/components/payments/UpcomingView";
import { radius, spacing, typography, useTheme, type ThemeColors } from "../../src/theme";

type PaymentsView = "upcoming" | "all";

const VIEWS: { value: PaymentsView; label: string }[] = [
  { value: "upcoming", label: "Upcoming" },
  { value: "all", label: "All" },
];

export default function PaymentsScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [view, setView] = useState<PaymentsView>("upcoming");

  return (
    <View style={styles.screen}>
      <View style={styles.switchWrap}>
        <View style={styles.switch}>
          {VIEWS.map((v) => {
            const active = view === v.value;
            return (
              <Pressable
                key={v.value}
                onPress={() => setView(v.value)}
                style={[styles.pill, active && styles.pillActive]}
              >
                <Text style={[styles.pillText, active && styles.pillTextActive]}>{v.label}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {view === "upcoming" ? <UpcomingView /> : <SubscriptionsView />}
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    screen: {
      flex: 1,
      backgroundColor: colors.background,
    },
    switchWrap: {
      paddingHorizontal: spacing.md,
      paddingTop: spacing.md,
    },
    switch: {
      flexDirection: "row",
      backgroundColor: colors.surface,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 3,
      gap: 3,
    },
    pill: {
      flex: 1,
      alignItems: "center",
      paddingVertical: spacing.sm,
      borderRadius: radius.sm,
    },
    pillActive: { backgroundColor: colors.navy },
    pillText: { ...typography.label, color: colors.mutedText },
    pillTextActive: { color: colors.white },
  });
}
