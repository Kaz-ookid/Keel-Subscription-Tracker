// Insights: the full picture. Unlabelled numbers are real money; the smoothed
// figures that spread yearly/quarterly items into a monthly number are labelled
// as such (e.g. "average", "expected"). All math comes from @keel/core; this
// screen only formats. The heavier sections live in src/components/insights/.

import {
  COVERED_INSTALLMENT_STATUSES,
  endOfMonth,
  formatMoney,
  formatTotalsIn,
  isInstallmentSchedule,
  mergeTotals,
  money,
  projectCharges,
  spendingByMonth,
  summarizeCommitments,
  sumByCurrency,
  today,
  yearlyCommitment,
} from "@keel/core";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from "react-native";
import Animated from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { HeroCard } from "../../src/components/HeroCard";
import { Card } from "../../src/components/ui/Card";
import { EmptyState } from "../../src/components/ui/EmptyState";
import { StatValue } from "../../src/components/ui/StatValue";
import { YearChart, type YearChartMonth } from "../../src/components/YearChart";
import { CadenceSection } from "../../src/components/insights/CadenceSection";
import { ExploreSection } from "../../src/components/insights/ExploreSection";
import { MonthDetailList } from "../../src/components/insights/MonthDetailList";
import { monthFull, monthShort } from "../../src/i18n/dates";
import { monthShifted } from "../../src/lib/dates";
import { totalInDisplay } from "../../src/lib/money-display";
import { foldLayout } from "../../src/lib/motion";
import { TabFade } from "../../src/components/TabFade";
import { useTabReset } from "../../src/lib/tabReset";
import { useAppData } from "../../src/state/app-state";
import {
  dockClearance,
  spacing,
  type ThemeColors,
  typography,
  useStyles,
  useTheme,
} from "../../src/theme";

// The chart's slide range: two years back, two years ahead. Plenty of runway
// in both directions while staying a cheap, plain-View render.
const MONTHS_BACK = 24;
const MONTHS_AHEAD = 24;

export default function InsightsScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  // Tab re-tap (§9i): back to the top.
  const scrollRef = useRef<ScrollView>(null);
  const resetSignal = useTabReset("insights");
  useEffect(() => {
    if (resetSignal) scrollRef.current?.scrollTo({ y: 0, animated: true });
  }, [resetSignal]);
  const styles = useStyles(createStyles);
  const { items, occurrences, categories, displayCurrency, rates, loading } = useAppData();
  // null = nothing selected (tapping the selected bar again deselects it).
  // Nothing is pre-selected: the chart opens clean, and its readout invites
  // the tap ("Tap a month…") until the user picks one.
  const [selected, setSelected] = useState<number | null>(null);

  // The analysis window, frozen per mount: the values are day-stable and the
  // tab remounts far more often than midnight passes. Memoizing them lets the
  // compiler preserve the bucket memo below.
  const { asOf, windowStart, windowMonths, windowEnd } = useMemo(() => {
    const anchor = today();
    return {
      asOf: anchor,
      windowStart: monthShifted(anchor, -MONTHS_BACK),
      windowMonths: MONTHS_BACK + 1 + MONTHS_AHEAD,
      windowEnd: endOfMonth(monthShifted(anchor, MONTHS_AHEAD)),
    };
  }, []);

  // Past months read from the payment ledger (what was actually paid — it
  // survives pausing and editing); the future is projected; an unpaid charge
  // stays standing in the month it was due until it's ticked off or skipped.
  // (Above the loading return: hooks must run unconditionally.)
  const buckets = useMemo(
    () => spendingByMonth(items, occurrences, windowStart, windowMonths),
    [items, occurrences, windowStart, windowMonths],
  );

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }
  const todayIndex = MONTHS_BACK;

  const commitments = summarizeCommitments(items, asOf);
  const yearlyTheory = yearlyCommitment(items, asOf);

  // The headline stays the calendar year, carved out of the wide window —
  // split into its two halves so the card explains its own number: what has
  // actually been paid, and what the rest of the year is still set to charge.
  const year = asOf.slice(0, 4);
  const yearReal = sumByCurrency(
    buckets.filter((b) => b.monthStart.slice(0, 4) === year).flatMap((b) => b.totals),
  );
  const yearPaid = sumByCurrency([
    ...occurrences
      .filter((o) => o.status === "charged" && o.dueDate.slice(0, 4) === year)
      .map((o) => o.amount),
    ...items.flatMap((item) =>
      isInstallmentSchedule(item.schedule)
        ? item.schedule.installments
            .filter(
              (inst) =>
                COVERED_INSTALLMENT_STATUSES.includes(inst.status) &&
                inst.dueDate.slice(0, 4) === year,
            )
            .map((inst) => inst.amount)
        : [],
    ),
  ]);

  if (yearReal.length === 0 && yearlyTheory.length === 0) {
    return (
      <View style={styles.center}>
        <EmptyState
          icon="chart.bar.xaxis"
          title={t("insights.emptyTitle")}
          hint={t("insights.emptyHint")}
        />
      </View>
    );
  }

  // Everything big merges into the display currency.
  const totals = (values: Parameters<typeof formatTotalsIn>[0]) =>
    formatTotalsIn(values, displayCurrency, rates);

  const chartMonths: YearChartMonth[] = buckets.map((b) => {
    const m = Number(b.monthStart.slice(5, 7)) - 1;
    const amount = totalInDisplay(b.totals, displayCurrency, rates);
    const formatted = formatMoney(money(amount, displayCurrency));
    return {
      label: monthShort(m),
      name: `${monthFull(m)} ${b.monthStart.slice(0, 4)}`,
      amount,
      formatted,
      // Januaries carry the year milestone so sliding never loses the reader.
      yearStart: m === 0 ? b.monthStart.slice(0, 4) : undefined,
    };
  });
  const averageTheory = totalInDisplay(commitments.monthly, displayCurrency, rates);
  // Only when rates are unavailable does anything stay outside the chart.
  const otherCurrencies =
    rates && mergeTotals(yearReal, displayCurrency, rates)
      ? []
      : yearReal.filter((t) => t.currency !== displayCurrency);

  const thisMonthReal = buckets[todayIndex].totals;

  // The value above is the recurring, predictable part — the hint quantifies
  // what rode on top of it this year as finite Pay-in-X money (every
  // installment due this calendar year, finished plans included).
  const bnplThisYear = sumByCurrency(
    items.flatMap((item) =>
      isInstallmentSchedule(item.schedule)
        ? item.schedule.installments
            .filter((inst) => inst.dueDate.slice(0, 4) === year)
            .map((inst) => inst.amount)
        : [],
    ),
  );
  const ongoingHint =
    bnplThisYear.length > 0
      ? t("insights.bnplHint", { amount: totals(bnplThisYear) })
      : t("insights.recurringBaseline");

  // Projected once for the whole screen: the hero's "still due" half and the
  // tapped month's rows both read it.
  const projected = projectCharges(items, windowEnd);
  const yearDue = sumByCurrency(
    projected.filter((c) => c.dueDate.slice(0, 4) === year).map((c) => c.amount),
  );
  const heroSub =
    [
      ...(yearPaid.length > 0 ? [t("insights.paidPart", { amount: totals(yearPaid) })] : []),
      ...(yearDue.length > 0 ? [t("insights.duePart", { amount: totals(yearDue) })] : []),
    ].join(" · ") || undefined;
  const selectedKey = selected !== null ? buckets[selected]?.monthStart.slice(0, 7) : undefined;

  return (
    <TabFade style={styles.screen}>
      <ScrollView
        ref={scrollRef}
        style={styles.screen}
        contentContainerStyle={[styles.content, { paddingTop: insets.top + spacing.sm }]}
      >
        <Text style={styles.largeTitle}>{t("tabs.insights")}</Text>
        <HeroCard
          label={t("insights.yearInTotal", { year })}
          amount={yearReal.length > 0 ? totals(yearReal) : t("insights.nothingPlanned")}
          sub={heroSub}
        />

        {/* Unlabelled numbers are real money; only the THEORY side is marked. */}
        <View style={styles.statRow}>
          <Card variant="free" style={styles.statCard}>
            <StatValue
              label={t("insights.thisMonth")}
              value={thisMonthReal.length > 0 ? totals(thisMonthReal) : t("insights.nothing")}
              hint={t("insights.actuallyLeaves")}
            />
          </Card>
          <Card variant="free" style={styles.statCard}>
            <StatValue
              label={t("insights.averagePerMonth")}
              value={
                commitments.monthly.length > 0 ? totals(commitments.monthly) : t("insights.nothing")
              }
              hint={ongoingHint}
            />
          </Card>
        </View>

        <YearChart
          months={chartMonths}
          average={averageTheory}
          averageFormatted={formatMoney(money(averageTheory, displayCurrency))}
          todayIndex={todayIndex}
          selected={selected}
          onSelect={(i) => setSelected((prev) => (prev === i ? null : i))}
        />

        {/* The tapped month's payments — light, in place, no extra screen. */}
        <MonthDetailList
          items={items}
          occurrences={occurrences}
          projected={projected}
          selectedKey={selectedKey}
          asOf={asOf}
        />

        {otherCurrencies.length > 0 && (
          <Animated.Text layout={foldLayout} style={styles.note}>
            {t("insights.notCharted", { amount: totals(otherCurrencies) })}
          </Animated.Text>
        )}

        <CadenceSection
          items={items}
          categories={categories}
          asOf={asOf}
          displayCurrency={displayCurrency}
          rates={rates}
        />

        <ExploreSection items={items} asOf={asOf} displayCurrency={displayCurrency} rates={rates} />
      </ScrollView>
    </TabFade>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    screen: {
      flex: 1,
      backgroundColor: "transparent",
    },
    largeTitle: {
      fontSize: 34,
      fontWeight: "700",
      color: colors.text,
    },
    content: {
      padding: spacing.md,
      paddingBottom: dockClearance,
      gap: spacing.md,
    },
    center: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      gap: spacing.sm,
      backgroundColor: "transparent",
      padding: spacing.lg,
    },
    statRow: {
      flexDirection: "row",
      gap: spacing.sm,
    },
    statCard: {
      flex: 1,
    },
    note: {
      ...typography.caption,
      color: colors.mutedText,
    },
  });
}
