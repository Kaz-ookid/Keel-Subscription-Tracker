// Insights: the full picture. Unlabelled numbers are real money; only the
// THEORY side (averages that spread yearly/quarterly items) is marked as
// such. All math comes from @keel/core; this screen only formats.

import {
  calendarDate,
  describeRecurrence,
  endOfMonth,
  formatCalendarDate,
  formatMoney,
  formatMoneyList,
  groupByCadence,
  money,
  projectCharges,
  spendingByMonth,
  summarizeCommitments,
  sumByCurrency,
  today,
  yearlyCommitment,
  type CalendarDate,
  type CurrencyCode,
  type Money,
} from "@keel/core";
import { SymbolView } from "expo-symbols";
import { useMemo, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from "react-native";

import { HeroCard } from "../../src/components/HeroCard";
import { YearChart, type YearChartMonth } from "../../src/components/YearChart";
import { useAppState } from "../../src/state/app-state";
import { radius, spacing, tones, typography, useTheme, type ThemeColors } from "../../src/theme";

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

// The chart's slide range: two years back, two years ahead. Plenty of runway
// in both directions while staying a cheap, plain-View render.
const MONTHS_BACK = 24;
const MONTHS_AHEAD = 24;

function monthShifted(asOf: CalendarDate, delta: number): CalendarDate {
  const total = Number(asOf.slice(0, 4)) * 12 + (Number(asOf.slice(5, 7)) - 1) + delta;
  const y = Math.floor(total / 12);
  const m = (total % 12) + 1;
  return calendarDate(`${y}-${String(m).padStart(2, "0")}-01`);
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

interface MonthDetail {
  key: string;
  name: string;
  dueDate: CalendarDate;
  amount: Money;
  kind: "paid" | "upcoming" | "overdue";
}

export default function InsightsScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { items, occurrences, loading } = useAppState();
  const [selected, setSelected] = useState(MONTHS_BACK);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  const asOf = today();
  const windowStart = monthShifted(asOf, -MONTHS_BACK);
  const windowMonths = MONTHS_BACK + 1 + MONTHS_AHEAD;
  const windowEnd = endOfMonth(monthShifted(asOf, MONTHS_AHEAD));

  // Past months read from the payment ledger (what was actually paid — it
  // survives pausing and editing); the future is projected; an unpaid charge
  // stays standing in the month it was due until it's ticked off or skipped.
  const buckets = spendingByMonth(items, occurrences, windowStart, windowMonths);
  const todayIndex = MONTHS_BACK;

  const commitments = summarizeCommitments(items, asOf);
  const yearlyTheory = yearlyCommitment(items, asOf);
  const cadences = groupByCadence(items, asOf);

  // The headline stays the calendar year, carved out of the wide window.
  const year = asOf.slice(0, 4);
  const yearReal = sumByCurrency(
    buckets.filter((b) => b.monthStart.slice(0, 4) === year).flatMap((b) => b.totals),
  );

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
      // Januaries carry a year hint so sliding never loses the reader.
      label: m === 0 ? `${MONTH_SHORT[0]} ${b.monthStart.slice(2, 4)}` : MONTH_SHORT[m],
      name: `${MONTH_FULL[m]} ${b.monthStart.slice(0, 4)}`,
      amount,
      formatted: formatMoney(money(amount, primary)),
    };
  });
  const averageTheory = inPrimary(commitments.monthly);
  const otherCurrencies = yearReal.filter((t) => t.currency !== primary);

  const thisMonthReal = buckets[todayIndex].totals;
  const yearlyTotalPrimary = Math.max(inPrimary(yearlyTheory), 1);

  // The selected month's payments, one light card — ledger entries plus
  // projections, each with its due date (overdue ones marked as such).
  const itemNames = new Map(items.map((i) => [i.id, i.name]));
  const projected = projectCharges(items, windowEnd);
  const selectedKey = buckets[selected]?.monthStart.slice(0, 7);
  const details: MonthDetail[] = [
    ...occurrences
      .filter((o) => o.status === "charged" && o.dueDate.slice(0, 7) === selectedKey)
      .map((o) => ({
        key: o.id,
        name: itemNames.get(o.paymentItemId) ?? "(removed)",
        dueDate: o.dueDate,
        amount: o.amount,
        kind: "paid" as const,
      })),
    ...projected
      .filter((c) => c.dueDate.slice(0, 7) === selectedKey)
      .map((c) => ({
        key: `${c.paymentItemId}-${c.dueDate}-${c.installmentIndex ?? 0}`,
        name: c.name,
        dueDate: c.dueDate,
        amount: c.amount,
        kind: (c.dueDate < asOf ? "overdue" : "upcoming") as MonthDetail["kind"],
      })),
  ].sort((a, b) => (a.dueDate < b.dueDate ? -1 : 1));
  const DETAIL_CAP = 8;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <HeroCard
        label={year}
        amount={yearReal.length > 0 ? formatMoneyList(yearReal) : "Nothing planned"}
        sub={
          yearlyTheory.length > 0
            ? `in theory ${formatMoneyList(yearlyTheory)} a year, ongoing`
            : undefined
        }
      />

      {/* Unlabelled numbers are real money; only the THEORY side is marked. */}
      <View style={styles.statRow}>
        <View style={styles.statCard}>
          <Text style={styles.statLabel}>This month</Text>
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
        selected={selected}
        onSelect={setSelected}
      />

      {/* The tapped month's payments — light, in place, no extra screen. */}
      {details.length > 0 && (
        <View style={styles.detailCard}>
          {details.slice(0, DETAIL_CAP).map((d) => (
            <View key={d.key} style={styles.detailRow}>
              <SymbolView
                name={
                  d.kind === "paid"
                    ? "checkmark.circle.fill"
                    : d.kind === "overdue"
                      ? "exclamationmark.circle"
                      : "clock"
                }
                size={14}
                tintColor={
                  d.kind === "paid"
                    ? tones.success
                    : d.kind === "overdue"
                      ? tones.warning
                      : colors.mutedText
                }
              />
              <Text style={styles.detailName} numberOfLines={1}>
                {d.name}
              </Text>
              <Text style={[styles.detailDate, d.kind === "overdue" && { color: tones.warning }]}>
                {d.kind === "overdue"
                  ? `due ${formatCalendarDate(d.dueDate)}`
                  : d.dueDate.slice(8, 10) + "." + d.dueDate.slice(5, 7)}
              </Text>
              <Text style={styles.detailAmount}>{formatMoney(d.amount)}</Text>
            </View>
          ))}
          {details.length > DETAIL_CAP && (
            <Text style={styles.detailMore}>+ {details.length - DETAIL_CAP} more</Text>
          )}
        </View>
      )}

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
    detailCard: {
      backgroundColor: colors.surface,
      borderRadius: radius.md,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.xs,
    },
    detailRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
      paddingVertical: spacing.sm,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    detailName: {
      ...typography.caption,
      color: colors.text,
      flex: 1,
    },
    detailDate: {
      ...typography.caption,
      color: colors.mutedText,
    },
    detailAmount: {
      ...typography.caption,
      color: colors.text,
      fontWeight: "600",
    },
    detailMore: {
      ...typography.caption,
      color: colors.mutedText,
      textAlign: "center",
      paddingVertical: spacing.sm,
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
