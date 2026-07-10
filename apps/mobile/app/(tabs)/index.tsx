// The first tab: one screen, two zooms. "Upcoming" is the cash-flow timeline
// (what hits, when, from which account); "All" is the catalog of every item,
// including ended/paused ones a timeline can't show.

import { useRouter } from "expo-router";
import { SymbolView } from "expo-symbols";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";

import { CalendarMonthView } from "../../src/components/payments/CalendarMonthView";
import { HarborView } from "../../src/components/payments/HarborView";
import { SubscriptionsView } from "../../src/components/payments/SubscriptionsView";
import { UpcomingView } from "../../src/components/payments/UpcomingView";
import { loadHarborEnabled, onHarborChange } from "../../src/lib/experiments";
import { wasOnboardingSeen } from "../../src/lib/onboarding";
import { useAppState } from "../../src/state/app-state";
import { radius, spacing, typography, useTheme, type ThemeColors } from "../../src/theme";

type PaymentsView = "upcoming" | "all" | "calendar" | "harbor";

const VIEWS: { value: PaymentsView; labelKey: string }[] = [
  { value: "upcoming", labelKey: "payments.upcoming" },
  { value: "all", labelKey: "payments.all" },
];

export default function PaymentsScreen() {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [view, setView] = useState<PaymentsView>("upcoming");
  const router = useRouter();
  const { items, accounts, loading } = useAppState();

  // The experimental Harbor view (DESIGN.md §3.7 B): its toggle only appears
  // while the Settings debug switch is on.
  const [harborEnabled, setHarborEnabled] = useState(false);
  useEffect(() => {
    void loadHarborEnabled().then(setHarborEnabled);
    return onHarborChange((enabled) => {
      setHarborEnabled(enabled);
      if (!enabled) setView((v) => (v === "harbor" ? "upcoming" : v));
    });
  }, []);

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
                <Text style={[styles.pillText, active && styles.pillTextActive]}>
                  {t(v.labelKey)}
                </Text>
              </Pressable>
            );
          })}
        </View>
        <Pressable
          accessibilityLabel={t("payments.calendarA11y")}
          onPress={() => setView("calendar")}
          style={[styles.calendarToggle, view === "calendar" && styles.calendarToggleActive]}
        >
          <SymbolView
            name="calendar"
            size={17}
            tintColor={view === "calendar" ? colors.accent : colors.text}
          />
        </Pressable>
        {harborEnabled && (
          <Pressable
            accessibilityLabel={t("payments.harborA11y")}
            onPress={() => setView("harbor")}
            style={[styles.calendarToggle, view === "harbor" && styles.calendarToggleActive]}
          >
            <SymbolView
              name="sailboat"
              size={17}
              tintColor={view === "harbor" ? colors.accent : colors.text}
            />
          </Pressable>
        )}
      </View>

      {/* Fade-through on view switches (§3.6): keyed remount so the old view
          fades out while the new one fades in. */}
      <Animated.View
        key={view}
        entering={FadeIn.duration(150)}
        exiting={FadeOut.duration(100)}
        style={styles.viewWrap}
      >
        {view === "upcoming" && <UpcomingView />}
        {view === "all" && <SubscriptionsView />}
        {view === "calendar" && <CalendarMonthView />}
        {view === "harbor" && <HarborView />}
      </Animated.View>
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    screen: {
      flex: 1,
      backgroundColor: colors.background,
    },
    viewWrap: {
      flex: 1,
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
    calendarToggleActive: {
      backgroundColor: colors.accentSoft,
      borderColor: colors.accent,
    },
    pill: {
      flex: 1,
      alignItems: "center",
      paddingVertical: spacing.sm,
      borderRadius: radius.sm,
    },
    pillActive: { backgroundColor: colors.accentSoft },
    pillText: { ...typography.label, color: colors.mutedText },
    pillTextActive: { color: colors.accent },
  });
}
