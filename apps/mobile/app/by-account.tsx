// Per-account analytics: differentiator #2 in analytic form. Pick an account
// and see ITS year of months, its theory monthly load, and the commitments
// that ride on it — the structural view behind "which account needs what".

import {
  buildSpendLedger,
  calendarDate,
  endOfMonth,
  formatCalendarDate,
  formatMoney,
  formatTotalsIn,
  isInstallmentSchedule,
  isRecurringSchedule,
  mergeTotals,
  money,
  projectCharges,
  spendingByMonth,
  summarizeCommitments,
  summarizeInstallmentPlan,
  today,
  type CalendarDate,
  type CurrencyCode,
  type PaymentItem,
  type PaymentOccurrence,
} from "@keel/core";
import { useRouter } from "expo-router";
import { SymbolView } from "expo-symbols";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { HeroCard } from "../src/components/HeroCard";
import { BrandBadge } from "../src/components/BrandBadge";
import { YearChart, type YearChartMonth } from "../src/components/YearChart";
import { monthFull, monthShort } from "../src/i18n/dates";
import { localizedRecurrence } from "../src/i18n/recurrence";
import { useAppState } from "../src/state/app-state";
import { radius, spacing, typography, useTheme, type ThemeColors } from "../src/theme";

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
  const { t } = useTranslation();
  const router = useRouter();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { items, occurrences, accounts, categories, displayCurrency, rates } = useAppState();
  // An account id, or "none" for commitments not tied to any account.
  const [selected, setSelected] = useState<string>(accounts[0]?.id ?? "none");
  // Nothing selected by default: the screen opens on its commitments overview;
  // tapping a bar drills into that month's charges.
  const [selectedMonth, setSelectedMonth] = useState<number | null>(null);

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

  // Every account's chart speaks the same display currency, so the shared
  // ceiling below makes their bars genuinely comparable.
  const totals = (values: Parameters<typeof formatTotalsIn>[0]) =>
    formatTotalsIn(values, displayCurrency, rates);
  const amountIn = (values: { amount: number; currency: CurrencyCode }[]): number => {
    if (rates) {
      const merged = mergeTotals(values, displayCurrency, rates);
      if (merged) return merged.total.amount;
    }
    return values.find((t) => t.currency === displayCurrency)?.amount ?? 0;
  };

  // The heaviest month across ALL accounts sets every chart's ceiling, so
  // switching chips compares bar heights honestly instead of re-zooming.
  const globalMax = [...accounts.map((a) => a.id), "none"].reduce((max, group) => {
    const scope = scopeFor(group);
    const groupCommitments = summarizeCommitments(scope.items, asOf);
    const groupBuckets = spendingByMonth(scope.items, scope.occurrences, windowStart, windowMonths);
    const groupTop = Math.max(
      amountIn(groupCommitments.monthly),
      ...groupBuckets.map((b) => amountIn(b.totals)),
    );
    return Math.max(max, groupTop);
  }, 1);

  const chartMonths: YearChartMonth[] = buckets.map((b) => {
    const m = Number(b.monthStart.slice(5, 7)) - 1;
    const merged = rates ? mergeTotals(b.totals, displayCurrency, rates) : undefined;
    const amount = merged?.total.amount ?? amountIn(b.totals);
    const formatted = formatMoney(money(amount, displayCurrency));
    return {
      label: monthShort(m),
      name: `${monthFull(m)} ${b.monthStart.slice(0, 4)}`,
      amount,
      formatted,
      yearStart: m === 0 ? b.monthStart.slice(0, 4) : undefined,
    };
  });
  const averageTheory = amountIn(commitments.monthly);

  // The tapped month's actual charges for this account — paid (ledger) plus
  // upcoming (projection) — so selecting a bar drives the hero and the list.
  const selectedBucket = selectedMonth !== null ? buckets[selectedMonth] : undefined;
  const monthLabel = selectedMonth !== null ? chartMonths[selectedMonth]?.name : undefined;
  const monthDetail = selectedBucket
    ? (() => {
        const start = selectedBucket.monthStart;
        const end = endOfMonth(start);
        const key = start.slice(0, 7);
        const paid = buildSpendLedger(scoped, scopedOccurrences, start, end).map((e) => ({
          key: `c-${e.paymentItemId}-${e.date}`,
          paymentItemId: e.paymentItemId,
          name: e.name,
          domain: e.domain,
          color: e.color,
          categoryId: e.categoryId,
          date: e.date,
          amount: e.amount,
        }));
        const upcoming = projectCharges(scoped, end)
          .filter((c) => c.dueDate.slice(0, 7) === key)
          .map((c) => ({
            key: `p-${c.paymentItemId}-${c.dueDate}-${c.installmentIndex ?? 0}`,
            paymentItemId: c.paymentItemId,
            name: c.name,
            domain: c.domain,
            color: c.color,
            categoryId: c.categoryId,
            date: c.dueDate,
            amount: c.amount,
          }));
        return [...paid, ...upcoming].sort((a, b) => (a.date < b.date ? -1 : 1));
      })()
    : [];

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View style={styles.chipRow}>
          {[
            ...accounts.map((a) => ({ id: a.id, label: a.name, dot: a.color })),
            { id: "none", label: t("upcoming.chipNoAccount") },
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

      {selectedBucket ? (
        <HeroCard
          label={monthLabel ?? ""}
          amount={
            selectedBucket.totals.length > 0 ? totals(selectedBucket.totals) : t("insights.nothing")
          }
          sub={t("history.count", { count: monthDetail.length })}
        />
      ) : (
        <HeroCard
          label={t("byAccount.theory", { name: account?.name ?? t("upcoming.chipNoAccount") })}
          amount={
            commitments.monthly.length > 0
              ? t("byAccount.perMonth", { amount: totals(commitments.monthly) })
              : t("byAccount.nothingOngoing")
          }
          sub={
            commitments.bnplOutstanding.length > 0
              ? t("byAccount.plusOwed", { amount: totals(commitments.bnplOutstanding) })
              : t("byAccount.commitments", { count: scoped.length })
          }
        />
      )}

      <YearChart
        months={chartMonths}
        average={averageTheory}
        averageFormatted={formatMoney(money(averageTheory, displayCurrency))}
        todayIndex={MONTHS_BACK}
        selected={selectedMonth}
        onSelect={(i) => setSelectedMonth((prev) => (prev === i ? null : i))}
        scaleMax={globalMax}
      />

      {selectedBucket ? (
        monthDetail.length > 0 ? (
          <View style={styles.card}>
            {monthDetail.map((d) => {
              const category = categories.find((c) => c.id === d.categoryId);
              return (
                <Pressable
                  key={d.key}
                  style={styles.row}
                  onPress={() =>
                    router.push({ pathname: "/item", params: { id: d.paymentItemId } })
                  }
                >
                  <BrandBadge
                    domain={d.domain}
                    icon={category?.icon}
                    fallback={d.name.charAt(0).toUpperCase()}
                    color={d.color ?? colors.accent}
                    size={28}
                  />
                  <View style={styles.rowMiddle}>
                    <Text style={styles.detailName} numberOfLines={1}>
                      {d.name}
                    </Text>
                    <Text style={styles.rowSub}>{formatCalendarDate(d.date)}</Text>
                  </View>
                  <Text style={styles.detailValue}>{formatMoney(d.amount)}</Text>
                  <SymbolView name="chevron.right" size={11} tintColor={colors.mutedText} />
                </Pressable>
              );
            })}
          </View>
        ) : (
          <Text style={styles.emptyNote}>{t("insights.nothing")}</Text>
        )
      ) : (
        scoped.length > 0 && (
          <View style={styles.card}>
            {scoped.map((item) => {
              const category = categories.find((c) => c.id === item.categoryId);
              const recurring = isRecurringSchedule(item.schedule) ? item.schedule : undefined;
              const plan = isInstallmentSchedule(item.schedule)
                ? summarizeInstallmentPlan(item.schedule)
                : undefined;
              return (
                <Pressable
                  key={item.id}
                  style={styles.row}
                  onPress={() => router.push({ pathname: "/item", params: { id: item.id } })}
                >
                  <BrandBadge
                    domain={item.domain}
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
                      ? `${formatMoney(recurring.amount)} · ${localizedRecurrence(recurring.recurrence)}`
                      : plan
                        ? plan.isComplete
                          ? `${formatMoney(plan.totalAmount)} · ${t("row.doneTag").toLowerCase()}`
                          : `${formatMoney(plan.nextDue?.amount ?? plan.totalAmount)} · ${t("common.xOfY", { x: plan.paidCount, y: plan.totalCount })}`
                        : ""}
                  </Text>
                  <SymbolView name="chevron.right" size={11} tintColor={colors.mutedText} />
                </Pressable>
              );
            })}
          </View>
        )
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
    chipActive: { backgroundColor: colors.action, borderColor: colors.action },
    chipDot: { width: 8, height: 8, borderRadius: 4 },
    chipText: { ...typography.caption, fontWeight: "600", color: colors.text },
    chipTextActive: { color: colors.actionText },
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
    rowMiddle: { flex: 1, gap: 1 },
    detailName: { ...typography.body, color: colors.text },
    rowSub: { ...typography.caption, color: colors.mutedText },
    detailValue: { ...typography.caption, fontWeight: "600", color: colors.text },
    emptyNote: {
      ...typography.body,
      color: colors.mutedText,
      textAlign: "center",
      paddingVertical: spacing.md,
    },
  });
}
