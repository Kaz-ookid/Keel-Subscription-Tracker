// Insights: the full picture. Unlabelled numbers are real money; only the
// THEORY side (averages that spread yearly/quarterly items) is marked as
// such. All math comes from @keel/core; this screen only formats.

import {
  calendarDate,
  COVERED_INSTALLMENT_STATUSES,
  describeRecurrence,
  endOfMonth,
  formatCalendarDate,
  formatMoney,
  formatTotalsIn,
  groupByCadence,
  isInstallmentSchedule,
  isPaymentItemComplete,
  isRecurringSchedule,
  mergeTotals,
  money,
  projectCharges,
  spendingByMonth,
  summarizeCommitments,
  summarizeInstallmentPlan,
  summarizePriceChanges,
  sumByCurrency,
  today,
  yearlyCommitment,
  type CalendarDate,
  type CurrencyCode,
  type Money,
} from "@keel/core";
import { useRouter } from "expo-router";
import { SymbolView } from "expo-symbols";
import { useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { BrandBadge } from "../../src/components/BrandBadge";
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
  /** For Pay-in-X payments: "2 of 4". */
  installmentIndex?: number;
  installmentCount?: number;
}

export default function InsightsScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { items, occurrences, categories, displayCurrency, rates, loading } = useAppState();
  // null = nothing selected (tapping the selected bar again deselects it).
  const [selected, setSelected] = useState<number | null>(MONTHS_BACK);
  // The expanded billing-cycle card ("interval-unit", or "bnpl").
  const [expandedCadence, setExpandedCadence] = useState<string | null>(null);

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
  const priceChanges = summarizePriceChanges(items, asOf);
  // The Explore teaser: how much more per month than at signup.
  const creep = sumByCurrency(
    priceChanges.map((c) =>
      money(c.monthlyCurrent.amount - c.monthlyOriginal.amount, c.monthlyCurrent.currency),
    ),
  ).filter((m) => m.amount !== 0);

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
        <Text style={styles.emptyTitle}>Nothing to analyse yet</Text>
        <Text style={styles.emptyHint}>Add subscriptions and the year ahead appears here.</Text>
      </View>
    );
  }

  // Everything big merges into the display currency.
  const totals = (values: Parameters<typeof formatTotalsIn>[0]) =>
    formatTotalsIn(values, displayCurrency, rates);
  const amountIn = (values: { amount: number; currency: CurrencyCode }[]): number => {
    if (rates) {
      const merged = mergeTotals(values, displayCurrency, rates);
      if (merged) return merged.total.amount;
    }
    // No usable rates: chart only what's already in the display currency.
    return values.find((t) => t.currency === displayCurrency)?.amount ?? 0;
  };

  const chartMonths: YearChartMonth[] = buckets.map((b) => {
    const m = Number(b.monthStart.slice(5, 7)) - 1;
    const merged = rates ? mergeTotals(b.totals, displayCurrency, rates) : undefined;
    const amount = merged?.total.amount ?? amountIn(b.totals);
    const formatted = formatMoney(money(amount, displayCurrency));
    return {
      label: MONTH_SHORT[m],
      name: `${MONTH_FULL[m]} ${b.monthStart.slice(0, 4)}`,
      amount,
      formatted,
      // Januaries carry the year milestone so sliding never loses the reader.
      yearStart: m === 0 ? b.monthStart.slice(0, 4) : undefined,
    };
  });
  const averageTheory = amountIn(commitments.monthly);
  // Only when rates are unavailable does anything stay outside the chart.
  const otherCurrencies =
    rates && mergeTotals(yearReal, displayCurrency, rates)
      ? []
      : yearReal.filter((t) => t.currency !== displayCurrency);

  const thisMonthReal = buckets[todayIndex].totals;
  const yearlyTotalPrimary = Math.max(amountIn(yearlyTheory), 1);

  const creepLabel = (() => {
    if (creep.length === 0) return priceChanges.length > 0 ? `${priceChanges.length} changed` : "";
    return `+${totals(creep)}/mo`;
  })();

  // Pay in X: per-month figures make no sense for a finite plan — what
  // matters is how much is STILL OWED, and how far along the plans are.
  const planItems = items.filter(
    (i) =>
      i.status === "active" && isInstallmentSchedule(i.schedule) && !isPaymentItemComplete(i, asOf),
  );
  const planSummaries = planItems.flatMap((i) =>
    isInstallmentSchedule(i.schedule) ? [summarizeInstallmentPlan(i.schedule)] : [],
  );
  const bnplRemaining = sumByCurrency(planSummaries.map((s) => s.remainingAmount));
  const bnplTotal = sumByCurrency(planSummaries.map((s) => s.totalAmount));
  const bnplPaid = sumByCurrency(planSummaries.map((s) => s.paidAmount));
  const bnplTotalDisplay = amountIn(bnplTotal);
  const bnplPaidShare =
    bnplTotalDisplay > 0 ? Math.min(amountIn(bnplPaid) / bnplTotalDisplay, 1) : 0;

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
      ? `+ ${totals(bnplThisYear)} of Pay in X this year`
      : "your recurring baseline";

  // The selected month's payments, one light card — ledger entries plus
  // projections, each with its due date (overdue ones marked as such).
  const itemNames = new Map(items.map((i) => [i.id, i.name]));
  const projected = projectCharges(items, windowEnd);
  // The other half of the headline: charges this year that haven't been
  // settled yet (overdue ones included — they're still owed).
  const yearDue = sumByCurrency(
    projected.filter((c) => c.dueDate.slice(0, 4) === year).map((c) => c.amount),
  );
  const heroSub =
    [
      ...(yearPaid.length > 0 ? [`${totals(yearPaid)} paid`] : []),
      ...(yearDue.length > 0 ? [`${totals(yearDue)} still due`] : []),
    ].join(" · ") || undefined;
  const selectedKey = selected !== null ? buckets[selected]?.monthStart.slice(0, 7) : undefined;
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
    // Pay-in-X payments live on the plan, not in the ledger — read them there.
    ...items.flatMap((item) => {
      if (!isInstallmentSchedule(item.schedule)) return [];
      const count = item.schedule.installments.length;
      return item.schedule.installments
        .filter(
          (inst) =>
            COVERED_INSTALLMENT_STATUSES.includes(inst.status) &&
            inst.dueDate.slice(0, 7) === selectedKey,
        )
        .map((inst) => ({
          key: inst.id,
          name: item.name,
          dueDate: inst.dueDate,
          amount: inst.amount,
          kind: "paid" as const,
          installmentIndex: inst.index,
          installmentCount: count,
        }));
    }),
    ...projected
      .filter((c) => c.dueDate.slice(0, 7) === selectedKey)
      .map((c) => ({
        key: `${c.paymentItemId}-${c.dueDate}-${c.installmentIndex ?? 0}`,
        name: c.name,
        dueDate: c.dueDate,
        amount: c.amount,
        kind: (c.dueDate < asOf ? "overdue" : "upcoming") as MonthDetail["kind"],
        installmentIndex: c.installmentIndex,
        installmentCount: c.installmentCount,
      })),
  ].sort((a, b) => (a.dueDate < b.dueDate ? -1 : 1));

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <HeroCard
        label={`${year} in total`}
        amount={yearReal.length > 0 ? totals(yearReal) : "Nothing planned"}
        sub={heroSub}
      />

      {/* Unlabelled numbers are real money; only the THEORY side is marked. */}
      <View style={styles.statRow}>
        <View style={styles.statCard}>
          <Text style={styles.statLabel}>This month</Text>
          <Text style={styles.statValue}>
            {thisMonthReal.length > 0 ? totals(thisMonthReal) : "Nothing"}
          </Text>
          <Text style={styles.statHint}>actually leaves</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statLabel}>Average per month</Text>
          <Text style={styles.statValue}>
            {commitments.monthly.length > 0 ? totals(commitments.monthly) : "Nothing"}
          </Text>
          <Text style={styles.statHint}>{ongoingHint}</Text>
        </View>
      </View>

      <YearChart
        months={chartMonths}
        average={averageTheory}
        averageFormatted={formatMoney(money(averageTheory, displayCurrency))}
        todayIndex={todayIndex}
        selected={selected}
        onSelect={(i) => setSelected((prev) => (prev === i ? null : i))}
      />

      {/* The tapped month's payments — light, in place, no extra screen.
          About five rows visible; the rest scroll inside the card. */}
      {details.length > 0 && (
        <ScrollView style={styles.detailCard} nestedScrollEnabled>
          {details.map((d) => (
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
              {/* Date belongs with the name; the amount stands alone right. */}
              <View style={styles.detailLeft}>
                <Text style={styles.detailName} numberOfLines={1}>
                  {d.name}
                  {d.installmentIndex && d.installmentCount ? (
                    <Text style={styles.detailCount}>
                      {" "}
                      · {d.installmentIndex} of {d.installmentCount}
                    </Text>
                  ) : null}
                </Text>
                <Text style={[styles.detailDate, d.kind === "overdue" && { color: tones.warning }]}>
                  {d.kind === "overdue"
                    ? `due ${formatCalendarDate(d.dueDate)}`
                    : d.dueDate.slice(8, 10) + "." + d.dueDate.slice(5, 7)}
                </Text>
              </View>
              <Text style={styles.detailAmount}>{formatMoney(d.amount)}</Text>
            </View>
          ))}
        </ScrollView>
      )}

      {otherCurrencies.length > 0 && (
        <Text style={styles.note}>+ {totals(otherCurrencies)} this year not charted</Text>
      )}

      {(cadences.length > 0 || planSummaries.length > 0) && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>By billing cycle · theory</Text>
          {cadences.map((g) => {
            const key = `${g.recurrence.interval}-${g.recurrence.unit}`;
            const open = expandedCadence === key;
            const share = Math.min(amountIn(g.yearlyTotal) / yearlyTotalPrimary, 1);
            const label = capitalize(describeRecurrence(g.recurrence));
            // The live subscriptions billing on this cycle.
            const members = items.filter(
              (i) =>
                i.status === "active" &&
                isRecurringSchedule(i.schedule) &&
                !isPaymentItemComplete(i, asOf) &&
                i.schedule.recurrence.unit === g.recurrence.unit &&
                i.schedule.recurrence.interval === g.recurrence.interval,
            );
            return (
              <View key={key} style={styles.cadenceRow}>
                <Pressable
                  style={styles.cadenceBody}
                  onPress={() => setExpandedCadence(open ? null : key)}
                >
                  <View style={styles.cadenceHeader}>
                    <Text style={styles.cadenceLabel}>
                      {label} <Text style={styles.cadenceCount}>×{g.count}</Text>
                    </Text>
                    <View style={styles.cadenceRight}>
                      <Text style={styles.cadenceAmount}>
                        {totals(g.monthlyTotal)}/mo · {totals(g.yearlyTotal)}/yr
                      </Text>
                      <SymbolView
                        name={open ? "chevron.up" : "chevron.down"}
                        size={11}
                        tintColor={colors.mutedText}
                      />
                    </View>
                  </View>
                  <View style={styles.shareTrack}>
                    <View style={[styles.shareFill, { flex: share }]} />
                    <View style={{ flex: 1 - share }} />
                  </View>
                </Pressable>
                {open &&
                  members.map((item) => {
                    const category = categories.find((c) => c.id === item.categoryId);
                    const recurring = isRecurringSchedule(item.schedule)
                      ? item.schedule
                      : undefined;
                    return (
                      <Pressable
                        key={item.id}
                        style={styles.memberRow}
                        onPress={() => router.push({ pathname: "/item", params: { id: item.id } })}
                      >
                        <BrandBadge
                          domain={item.domain}
                          icon={category?.icon}
                          fallback={item.name.charAt(0).toUpperCase()}
                          color={item.color ?? colors.accent}
                          size={28}
                        />
                        <Text style={styles.memberName} numberOfLines={1}>
                          {item.name}
                        </Text>
                        <Text style={styles.memberValue}>
                          {recurring ? formatMoney(recurring.amount) : ""}
                        </Text>
                        <SymbolView name="chevron.right" size={11} tintColor={colors.mutedText} />
                      </Pressable>
                    );
                  })}
              </View>
            );
          })}

          {/* Pay in X earns its own card — its bar is PROGRESS PAID, and the
              headline is what's still owed (not a meaningless per-month). */}
          {planSummaries.length > 0 && (
            <View style={styles.cadenceRow}>
              <Pressable
                style={styles.cadenceBody}
                onPress={() => setExpandedCadence(expandedCadence === "bnpl" ? null : "bnpl")}
              >
                <View style={styles.cadenceHeader}>
                  <Text style={styles.cadenceLabel}>
                    Pay in X <Text style={styles.cadenceCount}>×{planSummaries.length}</Text>
                  </Text>
                  <View style={styles.cadenceRight}>
                    <Text style={styles.bnplOwed}>{totals(bnplRemaining)} still owed</Text>
                    <SymbolView
                      name={expandedCadence === "bnpl" ? "chevron.up" : "chevron.down"}
                      size={11}
                      tintColor={colors.mutedText}
                    />
                  </View>
                </View>
                <View style={styles.shareTrack}>
                  <View style={[styles.shareFill, { flex: bnplPaidShare }]} />
                  <View style={{ flex: 1 - bnplPaidShare }} />
                </View>
                <Text style={styles.statHint}>
                  of {totals(bnplTotal)} total · the payments sit inside the bars above
                </Text>
              </Pressable>
              {expandedCadence === "bnpl" &&
                planItems.map((item) => {
                  const category = categories.find((c) => c.id === item.categoryId);
                  const plan = isInstallmentSchedule(item.schedule)
                    ? summarizeInstallmentPlan(item.schedule)
                    : undefined;
                  return (
                    <Pressable
                      key={item.id}
                      style={styles.memberRow}
                      onPress={() => router.push({ pathname: "/item", params: { id: item.id } })}
                    >
                      <BrandBadge
                        domain={item.domain}
                        icon={category?.icon}
                        fallback={item.name.charAt(0).toUpperCase()}
                        color={item.color ?? colors.accent}
                        size={28}
                      />
                      <Text style={styles.memberName} numberOfLines={1}>
                        {item.name}
                      </Text>
                      <Text style={styles.memberValue}>
                        {plan
                          ? `${formatMoney(plan.remainingAmount)} left · ${plan.paidCount} of ${plan.totalCount}`
                          : ""}
                      </Text>
                      <SymbolView name="chevron.right" size={11} tintColor={colors.mutedText} />
                    </Pressable>
                  );
                })}
            </View>
          )}
        </View>
      )}

      {/* The deeper layer: focused tools, one tap away, out of the way. */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Explore</Text>
        <View style={styles.exploreCard}>
          <Pressable style={styles.exploreRow} onPress={() => router.push("/by-category")}>
            <SymbolView name="tag.fill" size={18} tintColor={colors.accent} />
            <Text style={styles.exploreText}>By category</Text>
            <SymbolView name="chevron.right" size={12} tintColor={colors.mutedText} />
          </Pressable>
          <Pressable
            style={[styles.exploreRow, styles.exploreRowDivider]}
            onPress={() => router.push("/price-changes")}
          >
            <SymbolView name="chart.line.uptrend.xyaxis" size={18} tintColor={colors.accent} />
            <Text style={styles.exploreText}>Price changes</Text>
            <Text style={styles.exploreValue}>{creepLabel}</Text>
            <SymbolView name="chevron.right" size={12} tintColor={colors.mutedText} />
          </Pressable>
          <Pressable
            style={[styles.exploreRow, styles.exploreRowDivider]}
            onPress={() => router.push("/by-account")}
          >
            <SymbolView name="building.columns.fill" size={18} tintColor={colors.accent} />
            <Text style={styles.exploreText}>By account</Text>
            <SymbolView name="chevron.right" size={12} tintColor={colors.mutedText} />
          </Pressable>
        </View>
      </View>
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
      // ~5 rows; beyond that the card scrolls internally.
      maxHeight: 190,
    },
    detailRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
      paddingVertical: spacing.sm,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    detailLeft: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
    },
    detailName: {
      ...typography.caption,
      color: colors.text,
      flexShrink: 1,
    },
    detailCount: {
      ...typography.caption,
      color: colors.mutedText,
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
      paddingHorizontal: spacing.md,
    },
    cadenceBody: {
      paddingVertical: spacing.md,
      gap: spacing.sm,
    },
    cadenceRight: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
    },
    memberRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
      paddingVertical: spacing.sm,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
    },
    memberName: { ...typography.body, color: colors.text, flex: 1 },
    memberValue: { ...typography.caption, color: colors.mutedText },
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
    // The one number that must not read like a footnote.
    bnplOwed: {
      ...typography.label,
      color: colors.text,
    },
    exploreCard: {
      backgroundColor: colors.surface,
      borderRadius: radius.md,
      paddingHorizontal: spacing.md,
    },
    exploreRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
      paddingVertical: spacing.md,
    },
    exploreRowDivider: {
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
    },
    exploreText: {
      ...typography.body,
      color: colors.text,
      flex: 1,
    },
    exploreValue: {
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
