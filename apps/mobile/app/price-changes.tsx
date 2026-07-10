// Price creep: how far each commitment drifted from what you signed up for.
// The data is the priceHistory every amount edit appends to — this screen is
// the first reader of it. Drift is shown in budget terms (per month) because
// that's the number that quietly grows.

import {
  formatCalendarDate,
  formatMoney,
  formatTotalsIn,
  money,
  summarizePriceChanges,
  sumByCurrency,
  today,
  type CalendarDate,
} from "@keel/core";
import { SymbolView } from "expo-symbols";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { HeroCard } from "../src/components/HeroCard";
import { BrandBadge } from "../src/components/BrandBadge";
import { Card } from "../src/components/ui/Card";
import { EmptyState } from "../src/components/ui/EmptyState";
import { useAppState } from "../src/state/app-state";
import { spacing, typography, useTheme, type ThemeColors } from "../src/theme";

export default function PriceChangesScreen() {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { items, categories, displayCurrency, rates, revertPriceChange } = useAppState();

  const changes = summarizePriceChanges(items, today());

  // A recorded change can be a mistake (a typo fixed as an edit): every
  // change row can be erased, reverting the price when it was the latest.
  const confirmRemove = (paymentItemId: string, name: string, effectiveFrom: CalendarDate) => {
    Alert.alert(
      t("priceChanges.removeTitle", { name }),
      t("priceChanges.removeBody", { date: formatCalendarDate(effectiveFrom) }),
      [
        { text: t("common.cancel"), style: "cancel" },
        {
          text: t("common.delete"),
          style: "destructive",
          onPress: () => revertPriceChange(paymentItemId, effectiveFrom),
        },
      ],
    );
  };
  const creep = sumByCurrency(
    changes.map((c) =>
      money(c.monthlyCurrent.amount - c.monthlyOriginal.amount, c.monthlyCurrent.currency),
    ),
  ).filter((m) => m.amount !== 0);
  const creepLabel = (() => {
    if (creep.length === 0) return t("priceChanges.noDrift");
    return t("insights.creep", { amount: formatTotalsIn(creep, displayCurrency, rates) });
  })();

  if (changes.length === 0) {
    return (
      <View style={styles.center}>
        <EmptyState
          icon="chart.line.uptrend.xyaxis"
          title={t("priceChanges.emptyTitle")}
          hint={t("priceChanges.emptyHint")}
        />
      </View>
    );
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <HeroCard
        label={t("priceChanges.heroLabel")}
        amount={creepLabel}
        sub={t("priceChanges.heroSub")}
      />

      {changes.map((c) => {
        const up = c.changeRatio > 0;
        const pct = Math.round(Math.abs(c.changeRatio) * 100);
        const category = categories.find((cat) => cat.id === c.categoryId);
        return (
          <Card key={c.paymentItemId} variant="free" style={styles.card}>
            <View style={styles.cardHeader}>
              <BrandBadge
                domain={c.domain}
                icon={category?.icon}
                fallback={c.name.charAt(0).toUpperCase()}
                color={c.color ?? colors.accent}
                size={32}
              />
              <View style={styles.cardTitleBlock}>
                <Text style={styles.cardTitle} numberOfLines={1}>
                  {c.name}
                </Text>
                <Text style={styles.cardSub}>
                  {t("priceChanges.sinceChanges", {
                    date: formatCalendarDate(c.since),
                    count: c.changes,
                  })}
                </Text>
              </View>
              <Text
                style={[styles.pct, { color: up ? colors.tones.warning : colors.tones.success }]}
              >
                {up ? "+" : "−"}
                {pct}%
              </Text>
            </View>

            <View style={styles.driftRow}>
              <Text style={styles.driftFrom}>{formatMoney(c.original)}</Text>
              <Text style={styles.driftArrow}>→</Text>
              <Text style={styles.driftTo}>{formatMoney(c.current)}</Text>
            </View>

            {c.history.map((entry, i) => (
              <View key={`${entry.effectiveFrom}-${i}`} style={styles.historyRow}>
                <Text style={styles.historyDate}>
                  {i === 0 ? t("priceChanges.signedUp") : t("priceChanges.changedAt")} ·{" "}
                  {formatCalendarDate(entry.effectiveFrom)}
                </Text>
                <View style={styles.historyRight}>
                  <Text style={styles.historyAmount}>{formatMoney(entry.amount)}</Text>
                  {/* The signup price is not a change; only changes can go. */}
                  {i > 0 && (
                    <Pressable
                      hitSlop={8}
                      onPress={() => confirmRemove(c.paymentItemId, c.name, entry.effectiveFrom)}
                      accessibilityLabel={t("priceChanges.removeA11y")}
                    >
                      <SymbolView name="xmark.circle.fill" size={15} tintColor={colors.mutedText} />
                    </Pressable>
                  )}
                </View>
              </View>
            ))}
          </Card>
        );
      })}
    </ScrollView>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.background },
    content: { padding: spacing.md, paddingBottom: spacing.xl, gap: spacing.md },
    center: {
      flex: 1,
      justifyContent: "center",
      backgroundColor: colors.background,
    },
    card: {
      gap: spacing.sm,
    },
    cardHeader: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
    },
    cardTitleBlock: { flex: 1, gap: 1 },
    cardTitle: { ...typography.label, color: colors.text },
    cardSub: { ...typography.caption, color: colors.mutedText },
    pct: { ...typography.value },
    driftRow: {
      flexDirection: "row",
      alignItems: "baseline",
      gap: spacing.sm,
    },
    driftFrom: {
      ...typography.body,
      color: colors.mutedText,
      textDecorationLine: "line-through",
    },
    driftArrow: { ...typography.body, color: colors.mutedText },
    driftTo: { ...typography.value, color: colors.text },
    historyRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingTop: spacing.xs,
    },
    historyDate: { ...typography.caption, color: colors.mutedText },
    historyRight: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
    historyAmount: { ...typography.caption, color: colors.text },
  });
}
