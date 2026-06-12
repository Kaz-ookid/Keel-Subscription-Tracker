// Per-category analytics: where the recurring money goes, with each category
// expandable in place to the subscriptions behind its number. Theory view —
// the equivalents that spread yearly/quarterly items.

import {
  describeRecurrence,
  formatMoney,
  formatTotalsIn,
  groupByCategory,
  isPaymentItemComplete,
  isRecurringSchedule,
  mergeTotals,
  summarizeCommitments,
  today,
  yearlyCommitment,
  type CurrencyCode,
} from "@keel/core";
import { useRouter } from "expo-router";
import { SymbolView } from "expo-symbols";
import { useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { HeroCard } from "../src/components/HeroCard";
import { IconBadge } from "../src/components/IconBadge";
import { useAppState } from "../src/state/app-state";
import { radius, spacing, typography, useTheme, type ThemeColors } from "../src/theme";

export default function ByCategoryScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { items, categories, displayCurrency, rates } = useAppState();
  // The expanded category (its id, or "none" for the uncategorised bucket).
  const [expanded, setExpanded] = useState<string | null>(null);

  const asOf = today();
  const groups = groupByCategory(items, asOf);
  const commitments = summarizeCommitments(items, asOf);
  const yearlyTheory = yearlyCommitment(items, asOf);

  if (groups.length === 0) {
    return (
      <View style={styles.center}>
        <Text style={styles.emptyTitle}>Nothing to split yet</Text>
        <Text style={styles.emptyHint}>Add subscriptions and the category view appears here.</Text>
      </View>
    );
  }

  const totals = (values: Parameters<typeof formatTotalsIn>[0]) =>
    formatTotalsIn(values, displayCurrency, rates);
  const amountIn = (values: { amount: number; currency: CurrencyCode }[]): number => {
    if (rates) {
      const merged = mergeTotals(values, displayCurrency, rates);
      if (merged) return merged.total.amount;
    }
    return values.find((t) => t.currency === displayCurrency)?.amount ?? 0;
  };
  const yearlyTotalPrimary = Math.max(amountIn(yearlyTheory), 1);

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <HeroCard
        label="Committed monthly · theory"
        amount={commitments.monthly.length > 0 ? totals(commitments.monthly) : "Nothing"}
        sub={`${totals(yearlyTheory)} a year, split below`}
      />

      {groups.map((g) => {
        const key = g.categoryId ?? "none";
        const open = expanded === key;
        const share = Math.min(amountIn(g.yearlyTotal) / yearlyTotalPrimary, 1);
        const category = categories.find((c) => c.id === g.categoryId);
        // The live subscriptions behind this number (matches the group math).
        const members = items.filter(
          (i) =>
            (i.categoryId ?? undefined) === g.categoryId &&
            i.status === "active" &&
            isRecurringSchedule(i.schedule) &&
            !isPaymentItemComplete(i, asOf),
        );

        return (
          <View key={key} style={styles.card}>
            <Pressable style={styles.cardBody} onPress={() => setExpanded(open ? null : key)}>
              <View style={styles.cardHeader}>
                <Text style={styles.cardLabel}>
                  {category?.name ?? "No category"} <Text style={styles.cardCount}>×{g.count}</Text>
                </Text>
                <View style={styles.cardRight}>
                  <Text style={styles.cardAmount}>
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
                const recurring = isRecurringSchedule(item.schedule) ? item.schedule : undefined;
                return (
                  <Pressable
                    key={item.id}
                    style={styles.memberRow}
                    onPress={() => router.push({ pathname: "/item", params: { id: item.id } })}
                  >
                    <IconBadge
                      icon={category?.icon}
                      fallback={item.name.charAt(0).toUpperCase()}
                      color={item.color ?? colors.accent}
                      size={28}
                    />
                    <Text style={styles.memberName} numberOfLines={1}>
                      {item.name}
                    </Text>
                    <Text style={styles.memberValue}>
                      {recurring
                        ? `${formatMoney(recurring.amount)} · ${describeRecurrence(recurring.recurrence)}`
                        : ""}
                    </Text>
                    <SymbolView name="chevron.right" size={11} tintColor={colors.mutedText} />
                  </Pressable>
                );
              })}
          </View>
        );
      })}
    </ScrollView>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.background },
    content: { padding: spacing.md, paddingBottom: spacing.xl, gap: spacing.sm },
    center: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      gap: spacing.sm,
      backgroundColor: colors.background,
      padding: spacing.lg,
    },
    emptyTitle: { ...typography.subtitle, color: colors.text, fontWeight: "600" },
    emptyHint: { ...typography.body, color: colors.mutedText, textAlign: "center" },
    card: {
      backgroundColor: colors.surface,
      borderRadius: radius.md,
      paddingHorizontal: spacing.md,
    },
    cardBody: {
      paddingVertical: spacing.md,
      gap: spacing.sm,
    },
    cardHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: spacing.sm,
    },
    cardLabel: { ...typography.label, color: colors.text },
    cardCount: { ...typography.caption, color: colors.mutedText, fontWeight: "400" },
    cardRight: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
    cardAmount: { ...typography.caption, color: colors.mutedText },
    shareTrack: {
      flexDirection: "row",
      height: 4,
      borderRadius: 2,
      backgroundColor: colors.background,
      overflow: "hidden",
    },
    shareFill: { backgroundColor: colors.accent, borderRadius: 2 },
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
  });
}
