// Per-account analytics: differentiator #2 in analytic form. Pick an account
// and see ITS year of months, its theory monthly load, and the commitments
// that ride on it — the structural view behind "which account needs what".

import {
  calendarDate,
  describeRecurrence,
  formatMoney,
  formatMoneyList,
  isInstallmentSchedule,
  isRecurringSchedule,
  money,
  spendingByMonth,
  summarizeCommitments,
  summarizeInstallmentPlan,
  today,
  type CalendarDate,
  type CurrencyCode,
  type PaymentItem,
  type PaymentOccurrence,
} from "@keel/core";
import { useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { HeroCard } from "../src/components/HeroCard";
import { IconBadge } from "../src/components/IconBadge";
import { YearChart, type YearChartMonth } from "../src/components/YearChart";
import { useAppState } from "../src/state/app-state";
import { radius, spacing, typography, useTheme, type ThemeColors } from "../src/theme";

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
const MONTHS_BACK = 12;
const MONTHS_AHEAD = 12;

function monthShifted(asOf: CalendarDate, delta: number): CalendarDate {
  const total = Number(asOf.slice(0, 4)) * 12 + (Number(asOf.slice(5, 7)) - 1) + delta;
  const y = Math.floor(total / 12);
  const m = (total % 12) + 1;
  return calendarDate(`${y}-${String(m).padStart(2, "0")}-01`);
}

export default function ByAccountScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { items, occurrences, accounts, categories } = useAppState();
  // An account id, or "none" for commitments not tied to any account.
  const [selected, setSelected] = useState<string>(accounts[0]?.id ?? "none");
  const [selectedMonth, setSelectedMonth] = useState<number | null>(MONTHS_BACK);

  const asOf = today();
  const account = accounts.find((a) => a.id === selected);

  const scopeFor = (group: string): { items: PaymentItem[]; occurrences: PaymentOccurrence[] } => {
    const groupItems = items.filter((i) =>
      group === "none" ? !i.accountId : i.accountId === group,
    );
    const ids = new Set(groupItems.map((i) => i.id));
    return { items: groupItems, occurrences: occurrences.filter((o) => ids.has(o.paymentItemId)) };
  };

  const windowStart = monthShifted(asOf, -MONTHS_BACK);
  const windowMonths = MONTHS_BACK + 1 + MONTHS_AHEAD;

  const { items: scoped, occurrences: scopedOccurrences } = scopeFor(selected);
  const buckets = spendingByMonth(scoped, scopedOccurrences, windowStart, windowMonths);
  const commitments = summarizeCommitments(scoped, asOf);

  const primary: CurrencyCode = account?.currency ?? commitments.monthly[0]?.currency ?? "EUR";
  const inPrimary = (totals: { amount: number; currency: CurrencyCode }[]) =>
    totals.find((t) => t.currency === primary)?.amount ?? 0;

  // The heaviest month across ALL accounts sets every chart's ceiling, so
  // switching chips compares bar heights honestly instead of re-zooming.
  const globalMax = [...accounts.map((a) => a.id), "none"].reduce((max, group) => {
    const scope = scopeFor(group);
    const groupAccount = accounts.find((a) => a.id === group);
    const groupCommitments = summarizeCommitments(scope.items, asOf);
    const groupPrimary: CurrencyCode =
      groupAccount?.currency ?? groupCommitments.monthly[0]?.currency ?? "EUR";
    const groupBuckets = spendingByMonth(scope.items, scope.occurrences, windowStart, windowMonths);
    const groupTop = Math.max(
      groupCommitments.monthly.find((t) => t.currency === groupPrimary)?.amount ?? 0,
      ...groupBuckets.map((b) => b.totals.find((t) => t.currency === groupPrimary)?.amount ?? 0),
    );
    return Math.max(max, groupTop);
  }, 1);

  const chartMonths: YearChartMonth[] = buckets.map((b) => {
    const m = Number(b.monthStart.slice(5, 7)) - 1;
    const amount = inPrimary(b.totals);
    return {
      label: MONTH_SHORT[m],
      name: `${MONTH_FULL[m]} ${b.monthStart.slice(0, 4)}`,
      amount,
      formatted: formatMoney(money(amount, primary)),
      yearStart: m === 0 ? b.monthStart.slice(0, 4) : undefined,
    };
  });
  const averageTheory = inPrimary(commitments.monthly);

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View style={styles.chipRow}>
          {[
            ...accounts.map((a) => ({ id: a.id, label: a.name, dot: a.color })),
            { id: "none", label: "No account" },
          ].map((chip) => {
            const active = selected === chip.id;
            return (
              <Pressable
                key={chip.id}
                onPress={() => setSelected(chip.id)}
                style={[styles.chip, active && styles.chipActive]}
              >
                {"dot" in chip && chip.dot ? (
                  <View style={[styles.chipDot, { backgroundColor: chip.dot }]} />
                ) : null}
                <Text style={[styles.chipText, active && styles.chipTextActive]}>{chip.label}</Text>
              </Pressable>
            );
          })}
        </View>
      </ScrollView>

      <HeroCard
        label={`${account?.name ?? "No account"} · theory`}
        amount={
          commitments.monthly.length > 0
            ? `${formatMoneyList(commitments.monthly)}/mo`
            : "Nothing ongoing"
        }
        sub={
          commitments.bnplOutstanding.length > 0
            ? `plus ${formatMoneyList(commitments.bnplOutstanding)} of Pay in X still owed`
            : `${scoped.length} commitment${scoped.length === 1 ? "" : "s"}`
        }
      />

      <YearChart
        months={chartMonths}
        average={averageTheory}
        averageFormatted={formatMoney(money(averageTheory, primary))}
        todayIndex={MONTHS_BACK}
        selected={selectedMonth}
        onSelect={(i) => setSelectedMonth((prev) => (prev === i ? null : i))}
        scaleMax={globalMax}
      />

      {scoped.length > 0 && (
        <View style={styles.card}>
          {scoped.map((item) => {
            const category = categories.find((c) => c.id === item.categoryId);
            const recurring = isRecurringSchedule(item.schedule) ? item.schedule : undefined;
            const plan = isInstallmentSchedule(item.schedule)
              ? summarizeInstallmentPlan(item.schedule)
              : undefined;
            return (
              <View key={item.id} style={styles.row}>
                <IconBadge
                  icon={category?.icon}
                  fallback={item.name.charAt(0).toUpperCase()}
                  color={item.color ?? colors.accent}
                  size={28}
                />
                <Text style={styles.rowName} numberOfLines={1}>
                  {item.name}
                </Text>
                <Text style={styles.rowValue}>
                  {recurring
                    ? `${formatMoney(recurring.amount)} · ${describeRecurrence(recurring.recurrence)}`
                    : plan
                      ? plan.isComplete
                        ? `${formatMoney(plan.totalAmount)} · paid`
                        : `${formatMoney(plan.nextDue?.amount ?? plan.totalAmount)} · ${plan.paidCount} of ${plan.totalCount}`
                      : ""}
                </Text>
              </View>
            );
          })}
        </View>
      )}
    </ScrollView>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.background },
    content: { padding: spacing.md, paddingBottom: spacing.xl, gap: spacing.md },
    chipRow: { flexDirection: "row", gap: spacing.sm },
    chip: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.xs + 2,
      paddingVertical: spacing.xs + 2,
      paddingHorizontal: spacing.md,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
    },
    chipActive: { backgroundColor: colors.navy, borderColor: colors.navy },
    chipDot: { width: 8, height: 8, borderRadius: 4 },
    chipText: { ...typography.caption, fontWeight: "600", color: colors.text },
    chipTextActive: { color: colors.white },
    card: {
      backgroundColor: colors.surface,
      borderRadius: radius.md,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.xs,
    },
    row: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
      paddingVertical: spacing.sm,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    rowName: { ...typography.body, color: colors.text, flex: 1 },
    rowValue: { ...typography.caption, color: colors.mutedText },
  });
}
