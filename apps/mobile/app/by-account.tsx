// Per-account analytics: differentiator #2 in analytic form. Pick an account
// and see ITS year of months, its theory monthly load, and the commitments
// that ride on it — the structural view behind "which account needs what".

import {
  buildSpendLedger,
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
  type CurrencyCode,
  type PaymentItem,
  type PaymentOccurrence,
} from "@keel/core";
import { useRouter } from "expo-router";
import { SymbolView } from "expo-symbols";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { HeroCard } from "../src/components/HeroCard";
import { BrandBadge } from "../src/components/BrandBadge";
import { Card } from "../src/components/ui/Card";
import { Chip } from "../src/components/ui/Chip";
import { YearChart, type YearChartMonth } from "../src/components/YearChart";
import { monthFull, monthShort } from "../src/i18n/dates";
import { monthShifted } from "../src/lib/dates";
import { localizedRecurrence } from "../src/i18n/recurrence";
import { useAppData } from "../src/state/app-state";
import { spacing, type ThemeColors, typography, useStyles, useTheme } from "../src/theme";

const MONTHS_BACK = 12;
const MONTHS_AHEAD = 12;

export default function ByAccountScreen() {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const router = useRouter();
  const styles = useStyles(createStyles);
  const { items, occurrences, accounts, categories, displayCurrency, rates } = useAppData();
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
          icon: e.icon,
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
            icon: c.icon,
            categoryId: c.categoryId,
            date: c.dueDate,
            amount: c.amount,
          }));
        return [...paid, ...upcoming].sort((a, b) => (a.date < b.date ? -1 : 1));
      })()
    : [];

  // No month tapped → the account's commitments by PRICE, heaviest first
  // (the displayed amount, converted so currencies compare honestly). A
  // tapped month keeps its date order — there the timeline is the point.
  const priceOf = (item: (typeof scoped)[number]): number => {
    if (isRecurringSchedule(item.schedule)) return amountIn([item.schedule.amount]);
    if (!isInstallmentSchedule(item.schedule)) return 0;
    const plan = summarizeInstallmentPlan(item.schedule);
    return amountIn([
      plan.isComplete ? plan.totalAmount : (plan.nextDue?.amount ?? plan.totalAmount),
    ]);
  };
  const scopedByPrice = [...scoped].sort((a, b) => priceOf(b) - priceOf(a));

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      contentInsetAdjustmentBehavior="automatic"
    >
      <Text style={styles.largeTitle}>{t("titles.byAccount")}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View style={styles.chipRow}>
          {[
            ...accounts.map((a) => ({ id: a.id, label: a.name, dot: a.color })),
            { id: "none", label: t("upcoming.chipNoAccount") },
          ].map((chip) => (
            <Chip
              key={chip.id}
              label={chip.label}
              selected={selected === chip.id}
              onPress={() => setSelected(chip.id)}
              dot={"dot" in chip ? chip.dot : undefined}
            />
          ))}
        </View>
      </ScrollView>

      {selectedBucket ? (
        <HeroCard
          label={monthLabel ?? ""}
          amount={
            selectedBucket.totals.length > 0 ? totals(selectedBucket.totals) : t("insights.nothing")
          }
          sub={t("byAccount.payments", { count: monthDetail.length })}
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
          <Card>
            {monthDetail.map((d, i) => {
              const category = categories.find((c) => c.id === d.categoryId);
              return (
                <Pressable
                  key={d.key}
                  style={[styles.row, i > 0 && styles.rowDivider]}
                  onPress={() =>
                    router.push({ pathname: "/item", params: { id: d.paymentItemId } })
                  }
                >
                  <BrandBadge
                    domain={d.domain}
                    icon={d.icon ?? category?.icon}
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
                  <SymbolView name="chevron.right" size={13} tintColor={colors.mutedText} />
                </Pressable>
              );
            })}
          </Card>
        ) : (
          <Text style={styles.emptyNote}>{t("insights.nothing")}</Text>
        )
      ) : (
        scoped.length > 0 && (
          <Card>
            {scopedByPrice.map((item, i) => {
              const category = categories.find((c) => c.id === item.categoryId);
              const recurring = isRecurringSchedule(item.schedule) ? item.schedule : undefined;
              const plan = isInstallmentSchedule(item.schedule)
                ? summarizeInstallmentPlan(item.schedule)
                : undefined;
              return (
                <Pressable
                  key={item.id}
                  style={[styles.row, i > 0 && styles.rowDivider]}
                  onPress={() => router.push({ pathname: "/item", params: { id: item.id } })}
                >
                  <BrandBadge
                    domain={item.domain}
                    icon={item.icon ?? category?.icon}
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
                  <SymbolView name="chevron.right" size={13} tintColor={colors.mutedText} />
                </Pressable>
              );
            })}
          </Card>
        )
      )}
    </ScrollView>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: "transparent" },
    largeTitle: { fontSize: 34, fontWeight: "700", color: colors.text },
    content: { padding: spacing.md, paddingBottom: spacing.xl, gap: spacing.md },
    chipRow: { flexDirection: "row", gap: spacing.sm },
    row: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
      paddingVertical: spacing.sm,
    },
    // Divider on top, skipped for the first row: no trailing line.
    rowDivider: {
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
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
