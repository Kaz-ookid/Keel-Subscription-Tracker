// The first tab: one screen, two zooms. "Upcoming" is the cash-flow timeline
// (what hits, when, from which account); "All" is the catalog of every item,
// including ended/paused ones a timeline can't show.

import { useFocusEffect, useRouter } from "expo-router";
import { SymbolView } from "expo-symbols";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useSharedValue, withTiming } from "react-native-reanimated";

import { closeAllSwipeRows } from "../../src/components/ui/SwipeRow";
import { SegmentedPills } from "../../src/components/ui/SegmentedPills";
import { usePager } from "../../src/components/ui/usePager";
import { ScheduleView, type ScheduleLens } from "../../src/components/payments/ScheduleView";
import { SubscriptionsView } from "../../src/components/payments/SubscriptionsView";
import { UpcomingView } from "../../src/components/payments/UpcomingView";
import { TabFade } from "../../src/components/TabFade";
import { consumePaymentsView, onTabReset, useTabReset } from "../../src/lib/tabReset";
import { wasOnboardingSeen } from "../../src/lib/onboarding";
import { useAppData } from "../../src/state/app-state";
import { spacing, type ThemeColors, useStyles, useTheme, withAlpha } from "../../src/theme";

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
  const styles = useStyles(createStyles);
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

  // The pills are the shared SegmentedPills, driven LIVE by the pager's
  // progress instead of teleporting on settle; the wash fades out when the
  // calendar/harbor toggles own the selection.
  const highlightOpacity = useSharedValue(1);
  // Upcoming ↔ All live in a plain PAGING SCROLLVIEW, not a PagerView: with
  // bounces off, a UIScrollView is physically clamped to its two pages, so
  // the wrap-around PagerView produced under aggressive two-finger swipes
  // cannot exist — there is no state to heal, the edges ARE the track.
  const onPills = view === "upcoming" || view === "all";
  const { width: pageWidth } = useWindowDimensions();
  const pagerRef = useRef<ScrollView>(null);
  const pager = usePager({
    ref: pagerRef,
    pageWidth,
    pageCount: 2,
    initialPage: view === "all" ? 1 : 0,
    // Returning from calendar/harbor remounts the pager on the remembered page.
    mountKey: onPills,
    onSettle: (page) => setView(page === 1 ? "all" : "upcoming"),
  });
  const goToPage = (page: number, animated: boolean) => {
    closeAllSwipeRows();
    pager.goTo(page, animated);
  };
  // ANY page movement (finger or programmatic) folds open swipe rows shut,
  // and so does leaving the screen — a revealed trash button must never
  // survive a context change.
  const onPagerBeginDrag = () => closeAllSwipeRows();
  useFocusEffect(
    useCallback(() => {
      return () => closeAllSwipeRows();
    }, []),
  );
  useEffect(() => {
    // Reanimated shared values are driven by assigning `.value`.
    if (view === "upcoming" || view === "all") {
      // The pager's own scroll slides the wash; this effect only brings it
      // back when returning from calendar/harbor: snap under the right pill
      // while invisible, then fade in.
      if (highlightOpacity.value < 0.05) pager.goTo(view === "all" ? 1 : 0, false);
      highlightOpacity.value = withTiming(1, { duration: 150 });
    } else {
      // Leaving for calendar/harbor: fade where it stands. Moving it too read
      // as a glitchy slide.
      highlightOpacity.value = withTiming(0, { duration: 150 });
    }
    // pager.goTo is a per-render closure; the effect is about `view`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, highlightOpacity]);

  // A requested landing view arriving while already mounted (the screen sat
  // behind a modal): consume it on focus and swing the pager over.
  useFocusEffect(
    useCallback(() => {
      const requested = consumePaymentsView();
      if (!requested) return;
      setView(requested);
      setScheduleLens("grid");
      goToPage(requested === "all" ? 1 : 0, true);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []),
  );

  // Re-tapping the Payments tab goes home (§9i): Upcoming, scrolled to top.
  const resetSignal = useTabReset("index");
  useEffect(
    () =>
      onTabReset("index", () => {
        setView("upcoming");
        setScheduleLens("grid");
        // Animated: the page SWIPES back and its scroll events carry the
        // pill wash along. From the calendar the pager remounts at page 0
        // and the [view] effect fades the wash back in.
        goToPage(0, true);
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  return (
    <TabFade style={[styles.screen, { paddingTop: insets.top }]}>
      {/* The screen owns its title now: large, on the Ambient stage. */}
      <Text style={styles.largeTitle}>{t("tabs.payments")}</Text>
      <View style={styles.switchWrap}>
        <SegmentedPills
          options={VIEWS.map((v) => ({ value: v.value, label: t(v.labelKey) }))}
          value={view}
          onChange={(next) => {
            if (onPills)
              goToPage(
                VIEWS.findIndex((v) => v.value === next),
                true,
              );
            setView(next);
          }}
          progress={pager.progress}
          washOpacity={highlightOpacity}
          style={styles.switch}
        />
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
        <ScrollView
          ref={pagerRef}
          style={styles.pager}
          onScrollBeginDrag={onPagerBeginDrag}
          {...pager.scrollProps}
        >
          <View key="upcoming" style={[styles.page, { width: pageWidth }]} collapsable={false}>
            <UpcomingView resetSignal={resetSignal} />
          </View>
          <View key="all" style={[styles.page, { width: pageWidth }]} collapsable={false}>
            <SubscriptionsView />
          </View>
        </ScrollView>
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
    // Width comes inline (the window width); flex here would zero the
    // flex-basis and collapse the horizontal content run.
    page: { height: "100%" },
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
    switch: { flex: 1 },
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
  });
}
