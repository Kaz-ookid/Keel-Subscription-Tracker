// Where this year's money goes: a donut of the calendar year's REAL spending
// per category (ledger for the past, projection for the rest — the same basis
// as the Insights headline, so the numbers reconcile). Pay-in-X installments
// count inside their item's own category: a financed sofa is still furniture
// spending; the financing mechanism has its own card on the Insights screen.
// The category cards double as the donut's legend and expand to the items
// behind each number.

import {
  calendarDate,
  formatMoney,
  formatTotalsIn,
  mergeTotals,
  money,
  spendingByCategory,
  today,
  type CurrencyCode,
} from "@keel/core";
import { useRouter } from "expo-router";
import { SymbolView } from "expo-symbols";
import { useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { BrandBadge } from "../src/components/BrandBadge";
import { DonutChart, type DonutSegment } from "../src/components/DonutChart";
import { useAppState } from "../src/state/app-state";
import { radius, spacing, typography, useTheme, type ThemeColors } from "../src/theme";

// Distinct slice hues that read on light and dark; the tail beyond them is
// grouped into one grey "everything else" slice so the donut stays legible.
const PALETTE = ["#4E79A7", "#F28E2B", "#E15759", "#76B7B2", "#59A14F", "#EDC948"];
const TAIL_COLOR = "#9AA0A6";

export default function ByCategoryScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { items, occurrences, categories, displayCurrency, rates } = useAppState();
  // The expanded category (its id, or "none" for the uncategorised bucket).
  const [expanded, setExpanded] = useState<string | null>(null);

  const asOf = today();
  const year = asOf.slice(0, 4);
  const groups = spendingByCategory(
    items,
    occurrences,
    calendarDate(`${year}-01-01`),
    calendarDate(`${year}-12-31`),
  );

  const totals = (values: Parameters<typeof formatTotalsIn>[0]) =>
    formatTotalsIn(values, displayCurrency, rates);
  const amountIn = (values: { amount: number; currency: CurrencyCode }[]): number => {
    if (rates) {
      const merged = mergeTotals(values, displayCurrency, rates);
      if (merged) return merged.total.amount;
    }
    return values.find((t) => t.currency === displayCurrency)?.amount ?? 0;
  };

  // Order by converted value so multi-currency households sort correctly.
  const ordered = [...groups].sort((a, b) => amountIn(b.totals) - amountIn(a.totals));
  const grandTotal = ordered.reduce((sum, g) => sum + amountIn(g.totals), 0);

  if (ordered.length === 0 || grandTotal <= 0) {
    return (
      <View style={styles.center}>
        <Text style={styles.emptyTitle}>Nothing to split yet</Text>
        <Text style={styles.emptyHint}>Add subscriptions and the category view appears here.</Text>
      </View>
    );
  }

  // Top slices get their own colour; the rest merge into one grey slice but
  // keep their own legend cards (carrying the same grey dot).
  const sliceColor = (index: number) => (index < PALETTE.length ? PALETTE[index] : TAIL_COLOR);
  const segments: DonutSegment[] = [
    ...ordered.slice(0, PALETTE.length).map((g, i) => ({
      key: g.categoryId ?? "none",
      value: amountIn(g.totals),
      color: sliceColor(i),
      icon: categories.find((c) => c.id === g.categoryId)?.icon ?? "questionmark",
    })),
    ...(ordered.length > PALETTE.length
      ? [
          {
            key: "tail",
            value: ordered.slice(PALETTE.length).reduce((sum, g) => sum + amountIn(g.totals), 0),
            color: TAIL_COLOR,
            icon: "ellipsis",
          },
        ]
      : []),
  ];

  // The hole follows the selection: open a category card and it shows that
  // category's number; otherwise the year total.
  const expandedGroup = expanded
    ? ordered.find((g) => (g.categoryId ?? "none") === expanded)
    : undefined;
  const yearTotals = ordered.flatMap((g) => g.totals);
  const monthlyMean = formatMoney(money(Math.round(grandTotal / 12), displayCurrency));
  const centerTitle = expandedGroup ? totals(expandedGroup.totals) : totals(yearTotals);
  const centerSub = expandedGroup
    ? (categories.find((c) => c.id === expandedGroup.categoryId)?.name ?? "No category")
    : `${year} · ${monthlyMean}/mo`;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.donutWrap}>
        <DonutChart
          segments={segments}
          centerTitle={centerTitle}
          centerSub={centerSub}
          // The open card's slice lights up; tail categories share the grey
          // "everything else" slice, so any of them lights that one.
          selectedKey={
            expanded === null
              ? null
              : ordered.findIndex((g) => (g.categoryId ?? "none") === expanded) < PALETTE.length
                ? expanded
                : "tail"
          }
        />
      </View>

      {ordered.map((g, index) => {
        const key = g.categoryId ?? "none";
        const open = expanded === key;
        const category = categories.find((c) => c.id === g.categoryId);
        const share = grandTotal > 0 ? amountIn(g.totals) / grandTotal : 0;

        return (
          <View key={key} style={styles.card}>
            <Pressable style={styles.cardBody} onPress={() => setExpanded(open ? null : key)}>
              <View style={styles.cardHeader}>
                <View style={[styles.dot, { backgroundColor: sliceColor(index) }]} />
                <Text style={styles.cardLabel}>
                  {category?.name ?? "No category"}{" "}
                  <Text style={styles.cardCount}>×{g.items.length}</Text>
                </Text>
                <View style={styles.cardRight}>
                  <Text style={styles.cardShare}>{Math.round(share * 100)}%</Text>
                  <Text style={styles.cardAmount}>{totals(g.totals)}</Text>
                  <SymbolView
                    name={open ? "chevron.up" : "chevron.down"}
                    size={11}
                    tintColor={colors.mutedText}
                  />
                </View>
              </View>
            </Pressable>

            {open &&
              g.items.map((member) => {
                const exists = items.some((i) => i.id === member.paymentItemId);
                return (
                  <Pressable
                    key={member.paymentItemId}
                    style={styles.memberRow}
                    disabled={!exists}
                    onPress={() =>
                      router.push({ pathname: "/item", params: { id: member.paymentItemId } })
                    }
                  >
                    <BrandBadge
                      domain={member.domain}
                      icon={category?.icon}
                      fallback={member.name.charAt(0).toUpperCase()}
                      color={member.color ?? colors.accent}
                      size={28}
                    />
                    <Text style={styles.memberName} numberOfLines={1}>
                      {member.name}
                    </Text>
                    <Text style={styles.memberValue}>{totals(member.totals)}</Text>
                    {exists && (
                      <SymbolView name="chevron.right" size={11} tintColor={colors.mutedText} />
                    )}
                  </Pressable>
                );
              })}
          </View>
        );
      })}

      <Text style={styles.note}>
        Real money over {year}: what was paid, plus what the rest of the year is set to charge.
      </Text>
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
    donutWrap: {
      alignItems: "center",
      paddingVertical: spacing.md,
    },
    card: {
      backgroundColor: colors.surface,
      borderRadius: radius.md,
      paddingHorizontal: spacing.md,
    },
    cardBody: {
      paddingVertical: spacing.md,
    },
    cardHeader: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
    },
    dot: { width: 10, height: 10, borderRadius: 5 },
    cardLabel: { ...typography.label, color: colors.text, flex: 1 },
    cardCount: { ...typography.caption, color: colors.mutedText, fontWeight: "400" },
    cardRight: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
    cardShare: { ...typography.label, color: colors.text },
    cardAmount: { ...typography.caption, color: colors.mutedText },
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
    note: { ...typography.caption, color: colors.mutedText, paddingTop: spacing.sm },
  });
}
