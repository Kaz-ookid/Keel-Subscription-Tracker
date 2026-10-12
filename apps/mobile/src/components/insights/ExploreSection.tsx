// The Explore card at the bottom of Insights: the deeper, focused lenses
// (by category, by account, price changes) one tap away, out of the way.
// The price-changes row carries its own teaser: how much more per month
// than at signup, or just how many prices changed.

import {
  formatTotalsIn,
  money,
  summarizePriceChanges,
  sumByCurrency,
  type CalendarDate,
  type CurrencyCode,
  type ExchangeRates,
  type PaymentItem,
} from "@keel/core";
import { useRouter } from "expo-router";
import { SymbolView } from "expo-symbols";
import { useTranslation } from "react-i18next";
import { Pressable, StyleSheet, Text } from "react-native";
import Animated from "react-native-reanimated";

import { foldLayout } from "../../lib/motion";
import { spacing, type ThemeColors, typography, useStyles, useTheme } from "../../theme";
import { Card } from "../ui/Card";

interface Props {
  items: PaymentItem[];
  asOf: CalendarDate;
  displayCurrency: CurrencyCode;
  rates: ExchangeRates | null;
}

export function ExploreSection({ items, asOf, displayCurrency, rates }: Props) {
  const router = useRouter();
  const { colors } = useTheme();
  const { t } = useTranslation();
  const styles = useStyles(createStyles);

  // The teaser: how much more per month than at signup.
  const priceChanges = summarizePriceChanges(items, asOf);
  const creep = sumByCurrency(
    priceChanges.map((c) =>
      money(c.monthlyCurrent.amount - c.monthlyOriginal.amount, c.monthlyCurrent.currency),
    ),
  ).filter((m) => m.amount !== 0);
  const creepLabel =
    creep.length === 0
      ? priceChanges.length > 0
        ? t("insights.changed", { count: priceChanges.length })
        : ""
      : t("insights.creep", { amount: formatTotalsIn(creep, displayCurrency, rates) });

  return (
    <Animated.View layout={foldLayout} style={styles.section}>
      <Text style={styles.sectionTitle}>{t("insights.explore")}</Text>
      <Card>
        <Pressable style={styles.exploreRow} onPress={() => router.push("/by-category")}>
          <SymbolView name="tag.fill" size={18} tintColor={colors.accent} />
          <Text style={styles.exploreText}>{t("titles.byCategory")}</Text>
          <SymbolView name="chevron.right" size={13} tintColor={colors.mutedText} />
        </Pressable>
        <Pressable
          style={[styles.exploreRow, styles.exploreRowDivider]}
          onPress={() => router.push("/by-account")}
        >
          <SymbolView name="building.columns.fill" size={18} tintColor={colors.accent} />
          <Text style={styles.exploreText}>{t("titles.byAccount")}</Text>
          <SymbolView name="chevron.right" size={13} tintColor={colors.mutedText} />
        </Pressable>
        {/* Price changes is the long-term, least-used lens — keep it last. */}
        <Pressable
          style={[styles.exploreRow, styles.exploreRowDivider]}
          onPress={() => router.push("/price-changes")}
        >
          <SymbolView name="chart.line.uptrend.xyaxis" size={18} tintColor={colors.accent} />
          <Text style={styles.exploreText}>{t("titles.priceChanges")}</Text>
          <Text style={styles.exploreValue}>{creepLabel}</Text>
          <SymbolView name="chevron.right" size={13} tintColor={colors.mutedText} />
        </Pressable>
      </Card>
    </Animated.View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    section: {
      gap: spacing.sm,
    },
    sectionTitle: {
      ...typography.label,
      color: colors.text,
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
  });
}
