// The first tab: one screen, two zooms. "Upcoming" is the cash-flow timeline
// (what hits, when, from which account); "All" is the catalog of every item,
// including ended/paused ones a timeline can't show.

import { useRouter } from "expo-router";
import { SymbolView } from "expo-symbols";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, StyleSheet, Text, View } from "react-native";
import PagerView from "react-native-pager-view";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";

type PagerScrollEvent = { nativeEvent: { position: number; offset: number } };

import { ScheduleView, type ScheduleLens } from "../../src/components/payments/ScheduleView";
import { SubscriptionsView } from "../../src/components/payments/SubscriptionsView";
import { UpcomingView } from "../../src/components/payments/UpcomingView";
import { loadHarborEnabled, onHarborChange } from "../../src/lib/experiments";
import { wasOnboardingSeen } from "../../src/lib/onboarding";
import { useAppState } from "../../src/state/app-state";
import { radius, spacing, typography, useTheme, type ThemeColors } from "../../src/theme";

// The harbor is no longer a top-level view: it lives INSIDE the schedule
// slot as the calendar's bonus lens (see ScheduleView).
type PaymentsView = "upcoming" | "all" | "calendar";

const VIEWS: { value: PaymentsView; labelKey: string }[] = [
  { value: "upcoming", labelKey: "payments.upcoming" },
  { value: "all", labelKey: "payments.all" },
];

export default function PaymentsScreen() {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [view, setView] = useState<PaymentsView>("upcoming");
  const router = useRouter();
  const { items, accounts, loading } = useAppState();

  // The schedule slot's lens lives HERE so the calendar toggle can always
  // bring the grid back, even while the harbor is showing.
  const [scheduleLens, setScheduleLens] = useState<ScheduleLens>("grid");
  const [harborEnabled, setHarborEnabled] = useState(false);
  useEffect(() => {
    void loadHarborEnabled().then(setHarborEnabled);
    return onHarborChange((enabled) => {
      setHarborEnabled(enabled);
      if (!enabled) setScheduleLens("grid");
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

  // The selection wash SLIDES between the two pills instead of teleporting,
  // and fades out when the calendar/harbor toggles own the selection.
  const [trackWidth, setTrackWidth] = useState(0);
  const highlightX = useSharedValue(0);
  const highlightOpacity = useSharedValue(1);
  const pillWidth = trackWidth > 0 ? (trackWidth - 2 - 6 - 3) / 2 : 0; // border+padding+gap
  // Upcoming ↔ All live in a native pager: the swipe is interactive (hold it
  // mid-way, pull it back) and the selection wash tracks the finger 1:1.
  const pagerRef = useRef<PagerView>(null);
  const onPageScroll = (e: PagerScrollEvent) => {
    // Reanimated shared values are driven by assigning `.value`; here the
    // pager's native scroll IS the animation, so no withTiming on top of it.
    highlightX.value = (e.nativeEvent.position + e.nativeEvent.offset) * (pillWidth + 3);
  };
  useEffect(() => {
    // Reanimated shared values are driven by assigning `.value`.
    if (view === "upcoming" || view === "all") {
      // The pager's own scroll slides the wash; this effect only brings it
      // back when returning from calendar/harbor: snap under the right pill
      // while invisible, then fade in.
      if (highlightOpacity.value < 0.05)
        highlightX.value = (view === "all" ? 1 : 0) * (pillWidth + 3);
      highlightOpacity.value = withTiming(1, { duration: 150 });
    } else {
      // Leaving for calendar/harbor: fade where it stands. Moving it too read
      // as a glitchy slide.
      highlightOpacity.value = withTiming(0, { duration: 150 });
    }
  }, [view, pillWidth, highlightX, highlightOpacity]);
  const highlightStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: highlightX.value }],
    opacity: highlightOpacity.value,
  }));

  const onPills = view === "upcoming" || view === "all";

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      {/* The screen owns its title now: large, on the Ambient stage. */}
      <Text style={styles.largeTitle}>{t("tabs.payments")}</Text>
      <View style={styles.switchWrap}>
        <View style={styles.switch} onLayout={(e) => setTrackWidth(e.nativeEvent.layout.width)}>
          {pillWidth > 0 && (
            <Animated.View style={[styles.highlight, { width: pillWidth }, highlightStyle]} />
          )}
          {VIEWS.map((v, index) => {
            const active = view === v.value;
            return (
              <Pressable
                key={v.value}
                onPress={() => {
                  if (onPills) pagerRef.current?.setPage(index);
                  setView(v.value);
                }}
                style={styles.pill}
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
          onPress={() => {
            // Always lands on the GRID: pressing it while the harbor lens is
            // up is the way back to the calendar.
            setView("calendar");
            setScheduleLens("grid");
          }}
          style={[styles.calendarToggle, view === "calendar" && styles.calendarToggleActive]}
        >
          <SymbolView
            name="calendar"
            size={17}
            tintColor={view === "calendar" ? colors.accent : colors.text}
          />
        </Pressable>
      </View>

      {onPills ? (
        <PagerView
          ref={pagerRef}
          style={styles.pager}
          initialPage={view === "all" ? 1 : 0}
          onPageScroll={onPageScroll}
          onPageSelected={(e) => setView(e.nativeEvent.position === 1 ? "all" : "upcoming")}
        >
          <View key="upcoming" style={styles.page} collapsable={false}>
            <UpcomingView />
          </View>
          <View key="all" style={styles.page} collapsable={false}>
            <SubscriptionsView />
          </View>
        </PagerView>
      ) : (
        <ScheduleView lens={scheduleLens} onLens={setScheduleLens} harborEnabled={harborEnabled} />
      )}
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    screen: {
      flex: 1,
      backgroundColor: "transparent",
    },
    pager: { flex: 1 },
    page: { flex: 1 },
    // The large title (DESIGN.md §9b): the screen names itself.
    largeTitle: {
      fontSize: 34,
      fontWeight: "700",
      color: colors.text,
      paddingHorizontal: spacing.md,
      paddingTop: spacing.sm,
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
    // The sliding selection wash behind the pills.
    highlight: {
      position: "absolute",
      top: 3,
      bottom: 3,
      left: 3,
      borderRadius: radius.sm,
      backgroundColor: colors.accentSoft,
    },
    pillText: { ...typography.label, color: colors.mutedText },
    pillTextActive: { color: colors.accent },
  });
}
