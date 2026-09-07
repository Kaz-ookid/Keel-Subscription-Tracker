// The first tab: one screen, two zooms. "Upcoming" is the cash-flow timeline
// (what hits, when, from which account); "All" is the catalog of every item,
// including ended/paused ones a timeline can't show.

import { useFocusEffect, useRouter } from "expo-router";
import { SymbolView } from "expo-symbols";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, StyleSheet, Text, View } from "react-native";
import PagerView from "react-native-pager-view";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";

type PagerScrollEvent = { nativeEvent: { position: number; offset: number } };
type PagerStateEvent = { nativeEvent: { pageScrollState: "idle" | "dragging" | "settling" } };

import { ScheduleView, type ScheduleLens } from "../../src/components/payments/ScheduleView";
import { SubscriptionsView } from "../../src/components/payments/SubscriptionsView";
import { UpcomingView } from "../../src/components/payments/UpcomingView";
import { TabFade } from "../../src/components/TabFade";
import { consumePaymentsView, onTabReset, useTabReset } from "../../src/lib/tabReset";
import { wasOnboardingSeen } from "../../src/lib/onboarding";
import { useAppData } from "../../src/state/app-state";
import { spacing, typography, useTheme, withAlpha, type ThemeColors } from "../../src/theme";

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
  // Another screen may have requested a landing view (e.g. the browse picker
  // closes onto All, where its picks now live).
  const [view, setView] = useState<PaymentsView>(() => consumePaymentsView() ?? "upcoming");
  const router = useRouter();
  const { items, accounts, loading } = useAppData();

  // The schedule slot's lens lives HERE so the calendar toggle can always
  // bring the grid back, even while the harbor is showing.
  const [scheduleLens, setScheduleLens] = useState<ScheduleLens>("grid");

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
  // The scroll stream is the ground truth of where the pager REALLY is:
  // aggressive interrupted swipes (a second finger mid-settle) can make the
  // native pager swallow or mis-emit its final onPageSelected, leaving the
  // label on one page and the pager on the other — and refusing further
  // swipes. The last rounded scroll position heals that on settle.
  const scrolledPage = useRef(0);
  const onPageScroll = (e: PagerScrollEvent) => {
    // Clamped: overscroll bounces past the edges must not fling the wash
    // off the track (there is no page beyond All to wrap to).
    const progress = Math.min(1, Math.max(0, e.nativeEvent.position + e.nativeEvent.offset));
    scrolledPage.current = Math.round(progress);
    // Reanimated shared values are driven by assigning `.value`; here the
    // pager's native scroll IS the animation, so no withTiming on top of it.
    highlightX.value = progress * (pillWidth + 3);
  };
  const onPageScrollStateChanged = (e: PagerStateEvent) => {
    if (e.nativeEvent.pageScrollState !== "idle") return;
    // Settled: re-assert the truth everywhere — wash, label, and the native
    // pager's own internal position (the re-assert is what un-sticks it).
    const page = scrolledPage.current;
    highlightX.value = page * (pillWidth + 3);
    setView(page === 1 ? "all" : "upcoming");
    pagerRef.current?.setPageWithoutAnimation(page);
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

  // A requested landing view arriving while already mounted (the screen sat
  // behind a modal): consume it on focus and swing the pager over.
  useFocusEffect(
    useCallback(() => {
      const requested = consumePaymentsView();
      if (!requested) return;
      setView(requested);
      setScheduleLens("grid");
      pagerRef.current?.setPage(requested === "all" ? 1 : 0);
    }, []),
  );

  // Re-tapping the Payments tab goes home (§9i): Upcoming, scrolled to top.
  const resetSignal = useTabReset("index");
  useEffect(
    () =>
      onTabReset("index", () => {
        setView("upcoming");
        setScheduleLens("grid");
        // Animated setPage: the page SWIPES back and its scroll events carry
        // the pill wash along (setPageWithoutAnimation emits none). From the
        // calendar the pager remounts at page 0 and the [view] effect fades
        // the wash back in.
        pagerRef.current?.setPage(0);
      }),
    [],
  );

  return (
    <TabFade style={[styles.screen, { paddingTop: insets.top }]}>
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
          onPageScrollStateChanged={onPageScrollStateChanged}
          onPageSelected={(e) => {
            const page = Math.min(1, Math.max(0, e.nativeEvent.position));
            scrolledPage.current = page;
            setView(page === 1 ? "all" : "upcoming");
          }}
        >
          <View key="upcoming" style={styles.page} collapsable={false}>
            <UpcomingView resetSignal={resetSignal} />
          </View>
          <View key="all" style={styles.page} collapsable={false}>
            <SubscriptionsView />
          </View>
        </PagerView>
      ) : (
        <ScheduleView lens={scheduleLens} onLens={setScheduleLens} />
      )}
    </TabFade>
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
    // Material capsules (§9f): translucent track, hairline, accent tint wash.
    switch: {
      flex: 1,
      flexDirection: "row",
      backgroundColor: colors.material,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: colors.hairline,
      padding: 3,
      gap: 3,
      // The wash must never escape the capsule, even mid-overscroll.
      overflow: "hidden",
    },
    calendarToggle: {
      width: 40,
      height: 40,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: colors.hairline,
      backgroundColor: colors.material,
      alignItems: "center",
      justifyContent: "center",
    },
    calendarToggleActive: {
      backgroundColor: withAlpha(colors.accent, 0.2),
      borderColor: withAlpha(colors.accent, 0.45),
    },
    pill: {
      flex: 1,
      alignItems: "center",
      paddingVertical: spacing.sm,
      borderRadius: 999,
    },
    // The sliding selection wash behind the pills.
    highlight: {
      position: "absolute",
      top: 3,
      bottom: 3,
      left: 3,
      borderRadius: 999,
      backgroundColor: withAlpha(colors.accent, 0.2),
    },
    pillText: { ...typography.label, color: colors.mutedText },
    pillTextActive: { color: colors.accent },
  });
}
