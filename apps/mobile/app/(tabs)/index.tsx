// The first tab: one screen, two zooms. "Upcoming" is the cash-flow timeline
// (what hits, when, from which account); "All" is the catalog of every item,
// including ended/paused ones a timeline can't show.

import { useRouter } from "expo-router";
import { SymbolView } from "expo-symbols";
import { useEffect, useMemo, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { CalendarMonthView } from "../../src/components/payments/CalendarMonthView";
import { SubscriptionsView } from "../../src/components/payments/SubscriptionsView";
import { UpcomingView } from "../../src/components/payments/UpcomingView";
import { wasOnboardingSeen } from "../../src/lib/onboarding";
import { useAppState } from "../../src/state/app-state";
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
  // Upcoming has two zooms of its own: the timeline list and the month grid.
  const [calendar, setCalendar] = useState(false);
  const router = useRouter();
  const { items, accounts, loading } = useAppState();

  // First launch only: a truly empty app (no items, no accounts) and the tour
  // never shown → open onboarding. Checked once per mount, after hydration.
  const checkedOnboarding = useRef(false);
  useEffect(() => {
    if (loading || checkedOnboarding.current) return;
    checkedOnboarding.current = true;
    if (items.length > 0 || accounts.length > 0) return;
    void wasOnboardingSeen().then((seen) => {
      if (!seen) router.push("/onboarding");
    });
  }, [loading, items, accounts, router]);

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
        {view === "upcoming" && (
          <Pressable
            accessibilityLabel={calendar ? "Show as list" : "Show as calendar"}
            onPress={() => setCalendar((c) => !c)}
            style={styles.calendarToggle}
          >
            <SymbolView
              name={calendar ? "list.bullet" : "calendar"}
              size={17}
              tintColor={colors.text}
            />
          </Pressable>
        )}
      </View>

      {view === "upcoming" ? (
        calendar ? (
          <CalendarMonthView />
        ) : (
          <UpcomingView />
        )
      ) : (
        <SubscriptionsView />
      )}
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
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
      paddingHorizontal: spacing.md,
      paddingTop: spacing.md,
    },
    switch: {
      flex: 1,
      flexDirection: "row",
      backgroundColor: colors.surface,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 3,
      gap: 3,
    },
    calendarToggle: {
      width: 40,
      height: 40,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      alignItems: "center",
      justifyContent: "center",
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
