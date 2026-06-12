// Insights: the full picture. REAL money (what actually leaves, month by
// month) is never conflated with THEORY (what life costs once yearly and
// quarterly items are spread out) — every number is labelled as one or the
// other. All math comes from @keel/core; this screen only formats.

import {
  calendarDate,
  describeRecurrence,
  formatMoney,
  formatMoneyList,
  groupByCadence,
  money,
  spendingByMonth,
  summarizeCommitments,
  sumByCurrency,
  today,
  yearlyCommitment,
  type CurrencyCode,
} from "@keel/core";
import { useMemo } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from "react-native";

import { HeroCard } from "../../src/components/HeroCard";
import { YearChart, type YearChartMonth } from "../../src/components/YearChart";
import { useAppState } from "../../src/state/app-state";
import { radius, spacing, typography, useTheme, type ThemeColors } from "../../src/theme";

const MONTH_SHORT = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];
const MONTH_FULL = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export default function InsightsScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { items, occurrences, loading } = useAppState();

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  const asOf = today();
  // The calendar year: past months from the payment ledger (what was actually
  // paid — survives pausing), future months projected, unpaid overdue charges
  // still standing in the month they were due.
  const todayIndex = Number(asOf.slice(5, 7)) - 1;
  const buckets = spendingByMonth(
    items,
    occurrences,
    calendarDate(`${asOf.slice(0, 4)}-01-01`),
    12,
  );
  const commitments = summarizeCommitments(items, asOf);
  const yearlyTheory = yearlyCommitment(items, asOf);
  const cadences = groupByCadence(items, asOf);

  // REAL: the whole year — actuals so far plus everything still to come.
  const yearReal = sumByCurrency(buckets.flatMap((b) => b.totals));

  if (yearReal.length === 0 && yearlyTheory.length === 0) {
    return (
      <View style={styles.center}>
        <Text style={styles.emptyTitle}>Nothing to analyse yet</Text>
        <Text style={styles.emptyHint}>Add subscriptions and the year ahead appears here.</Text>
      </View>
    );
  }

  // The chart speaks one currency — the one carrying the largest yearly total.
  const primary: CurrencyCode = (yearReal.length > 0 ? yearReal : yearlyTheory).reduce((a, b) =>
    b.amount > a.amount ? b : a,
  ).currency;
  const inPrimary = (totals: { amount: number; currency: CurrencyCode }[]) =>
    totals.find((t) => t.currency === primary)?.amount ?? 0;

  const chartMonths: YearChartMonth[] = buckets.map((b) => {
    const m = Number(b.monthStart.slice(5, 7)) - 1;
    const amount = inPrimary(b.totals);
    return {
      label: MONTH_SHORT[m],
      name: `${MONTH_FULL[m]} ${b.monthStart.slice(0, 4)}`,
      amount,
      formatted: formatMoney(money(amount, primary)),
    };
  });
  const averageTheory = inPrimary(commitments.monthly);
  const otherCurrencies = yearReal.filter((t) => t.currency !== primary);

  const thisMonthReal = buckets[todayIndex].totals;
  const yearlyTotalPrimary = Math.max(inPrimary(yearlyTheory), 1);

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <HeroCard
        label={`${asOf.slice(0, 4)} · real`}
        amount={yearReal.length > 0 ? formatMoneyList(yearReal) : "Nothing planned"}
        sub={
          yearlyTheory.length > 0
            ? `in theory ${formatMoneyList(yearlyTheory)} a year, ongoing`
            : undefined
        }
      />

      {/* REAL vs THEORY — the distinction the whole screen exists for. */}
      <View style={styles.statRow}>
        <View style={styles.statCard}>
          <Text style={styles.statLabel}>This month · real</Text>
          <Text style={styles.statValue}>
            {thisMonthReal.length > 0 ? formatMoneyList(thisMonthReal) : "Nothing"}
          </Text>
          <Text style={styles.statHint}>actually leaves</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statLabel}>Average · theory</Text>
          <Text style={styles.statValue}>
            {commitments.monthly.length > 0 ? formatMoneyList(commitments.monthly) : "Nothing"}
          </Text>
          <Text style={styles.statHint}>yearly costs spread out</Text>
        </View>
      </View>

      <YearChart
        months={chartMonths}
        average={averageTheory}
        averageFormatted={formatMoney(money(averageTheory, primary))}
        todayIndex={todayIndex}
      />
      {otherCurrencies.length > 0 && (
        <Text style={styles.note}>+ {formatMoneyList(otherCurrencies)} this year not charted</Text>
      )}

      {cadences.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>By billing cycle · theory</Text>
          {cadences.map((g) => {
            const share = Math.min(inPrimary(g.yearlyTotal) / yearlyTotalPrimary, 1);
            const label = capitalize(describeRecurrence(g.recurrence));
            return (
              <View key={`${g.recurrence.interval}-${g.recurrence.unit}`} style={styles.cadenceRow}>
                <View style={styles.cadenceHeader}>
                  <Text style={styles.cadenceLabel}>
                    {label} <Text style={styles.cadenceCount}>×{g.count}</Text>
                  </Text>
                  <Text style={styles.cadenceAmount}>
                    {formatMoneyList(g.monthlyTotal)}/mo · {formatMoneyList(g.yearlyTotal)}/yr
                  </Text>
                </View>
                <View style={styles.shareTrack}>
                  <View style={[styles.shareFill, { flex: share }]} />
                  <View style={{ flex: 1 - share }} />
                </View>
              </View>
            );
          })}
        </View>
      )}

      {commitments.bnplOutstanding.length > 0 && (
        <Text style={styles.note}>
          Pay in X: {formatMoneyList(commitments.bnplOutstanding)} still owed — those payments are
          inside the bars above.
        </Text>
      )}
    </ScrollView>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    screen: {
      flex: 1,
      backgroundColor: colors.background,
    },
    content: {
      padding: spacing.md,
      paddingBottom: spacing.xl,
      gap: spacing.md,
    },
    center: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      gap: spacing.sm,
      backgroundColor: colors.background,
      padding: spacing.lg,
    },
    emptyTitle: {
      ...typography.subtitle,
      color: colors.text,
      fontWeight: "600",
    },
    emptyHint: {
      ...typography.body,
      color: colors.mutedText,
      textAlign: "center",
    },
    statRow: {
      flexDirection: "row",
      gap: spacing.sm,
    },
    statCard: {
      flex: 1,
      backgroundColor: colors.surface,
      borderRadius: radius.md,
      padding: spacing.md,
      gap: 2,
    },
    statLabel: {
      ...typography.caption,
      color: colors.mutedText,
      textTransform: "uppercase",
      letterSpacing: 0.4,
      fontSize: 11,
    },
    statValue: {
      ...typography.label,
      fontSize: 18,
      color: colors.text,
    },
    statHint: {
      ...typography.caption,
      color: colors.mutedText,
    },
    note: {
      ...typography.caption,
      color: colors.mutedText,
    },
    section: {
      gap: spacing.sm,
    },
    sectionTitle: {
      ...typography.label,
      color: colors.text,
    },
    cadenceRow: {
      backgroundColor: colors.surface,
      borderRadius: radius.md,
      padding: spacing.md,
      gap: spacing.sm,
    },
    cadenceHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: spacing.sm,
    },
    cadenceLabel: {
      ...typography.label,
      color: colors.text,
    },
    cadenceCount: {
      ...typography.caption,
      color: colors.mutedText,
      fontWeight: "400",
    },
    cadenceAmount: {
      ...typography.caption,
      color: colors.mutedText,
    },
    shareTrack: {
      flexDirection: "row",
      height: 4,
      borderRadius: 2,
      backgroundColor: colors.background,
      overflow: "hidden",
    },
    shareFill: {
      backgroundColor: colors.accent,
      borderRadius: 2,
    },
  });
}
