// The tapped month's payments under the Insights chart — ledger entries plus
// projections, each with its due date (overdue ones marked as such). One light
// in-place card, no extra screen: about five rows visible, the rest scroll
// inside the card. Renders nothing while no month is selected.

import {
  COVERED_INSTALLMENT_STATUSES,
  formatCalendarDate,
  formatMoney,
  isInstallmentSchedule,
  type CalendarDate,
  type Money,
  type PaymentItem,
  type PaymentOccurrence,
  type ProjectedCharge,
} from "@keel/core";
import { useRouter } from "expo-router";
import { SymbolView } from "expo-symbols";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import Animated from "react-native-reanimated";

import { foldIn, foldLayout, foldOut } from "../../lib/motion";
import { radius, spacing, typography, useTheme, type ThemeColors } from "../../theme";

interface MonthDetail {
  key: string;
  /** The owning item — every visible payment can open its detail screen. */
  paymentItemId: string;
  name: string;
  dueDate: CalendarDate;
  amount: Money;
  kind: "paid" | "upcoming" | "overdue";
  /** For Pay-in-X payments: "2 of 4". */
  installmentIndex?: number;
  installmentCount?: number;
}

interface Props {
  items: PaymentItem[];
  occurrences: PaymentOccurrence[];
  /** The screen's projection window, shared so it's computed once up there. */
  projected: ProjectedCharge[];
  /** "YYYY-MM" of the selected chart month; undefined = nothing selected. */
  selectedKey: string | undefined;
  asOf: CalendarDate;
}

export function MonthDetailList({ items, occurrences, projected, selectedKey, asOf }: Props) {
  const router = useRouter();
  const { colors } = useTheme();
  const { t } = useTranslation();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const itemNames = new Map(items.map((i) => [i.id, i.name]));
  const details: MonthDetail[] = [
    ...occurrences
      .filter((o) => o.status === "charged" && o.dueDate.slice(0, 7) === selectedKey)
      .map((o) => ({
        key: o.id,
        paymentItemId: o.paymentItemId,
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
          paymentItemId: item.id,
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
        paymentItemId: c.paymentItemId,
        name: c.name,
        dueDate: c.dueDate,
        amount: c.amount,
        kind: (c.dueDate < asOf ? "overdue" : "upcoming") as MonthDetail["kind"],
        installmentIndex: c.installmentIndex,
        installmentCount: c.installmentCount,
      })),
  ].sort((a, b) => (a.dueDate < b.dueDate ? -1 : 1));

  if (details.length === 0) return null;

  return (
    <Animated.View entering={foldIn} exiting={foldOut} layout={foldLayout}>
      <ScrollView style={styles.detailCard} nestedScrollEnabled>
        {details.map((d, i) => (
          <Pressable
            key={d.key}
            style={[styles.detailRow, i > 0 && styles.detailRowDivider]}
            onPress={() => router.push({ pathname: "/item", params: { id: d.paymentItemId } })}
          >
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
                  ? colors.tones.success
                  : d.kind === "overdue"
                    ? colors.tones.warning
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
                    · {t("common.xOfY", { x: d.installmentIndex, y: d.installmentCount })}
                  </Text>
                ) : null}
              </Text>
              <Text
                style={[styles.detailDate, d.kind === "overdue" && { color: colors.tones.warning }]}
              >
                {d.kind === "overdue"
                  ? t("row.due", { date: formatCalendarDate(d.dueDate) })
                  : d.dueDate.slice(8, 10) + "." + d.dueDate.slice(5, 7)}
              </Text>
            </View>
            <Text style={styles.detailAmount}>{formatMoney(d.amount)}</Text>
          </Pressable>
        ))}
      </ScrollView>
    </Animated.View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
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
    },
    // Divider on top, skipped for the first row: no trailing line.
    detailRowDivider: {
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
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
  });
}
