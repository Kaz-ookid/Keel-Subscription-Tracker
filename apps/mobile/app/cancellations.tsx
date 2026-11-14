// Cancellations: the place to decide what to cancel, and to see what was.
// Running subscriptions are ranked by what a year of them costs; a tap marks
// one "to cancel" (the same plan as the item screen's "Remind me to cancel")
// or takes the mark off. Keel still cancels nothing itself. Stopped ones
// follow, with what a year of them used to cost. The lists are the core's
// (cancelReview); this screen sorts by display currency and formats.

import {
  cancelReview,
  formatCalendarDate,
  formatMoney,
  formatTotalsIn,
  isRecurringSchedule,
  summarizeCommitments,
  sumByCurrency,
  today,
  type Money,
  type PaymentItem,
} from "@keel/core";
import { useRouter } from "expo-router";
import { SymbolView } from "expo-symbols";
import { type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { BrandBadge } from "../src/components/BrandBadge";
import { HeroCard } from "../src/components/HeroCard";
import { Card } from "../src/components/ui/Card";
import { EmptyState } from "../src/components/ui/EmptyState";
import { ScreenTitle } from "../src/components/ui/ScreenTitle";
import { localizedRecurrence } from "../src/i18n/recurrence";
import { hapticSelection } from "../src/lib/haptics";
import { useLockGuard } from "../src/lib/lock-gate";
import { totalInDisplay } from "../src/lib/money-display";
import { useAppActions, useAppData } from "../src/state/app-state";
import { spacing, type ThemeColors, typography, useStyles, useTheme } from "../src/theme";

export default function CancellationsScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { t } = useTranslation();
  const styles = useStyles(createStyles);
  const { items, categories, displayCurrency, rates } = useAppData();
  const { planCancel, keepSubscription } = useAppActions();
  // Marking is a WRITE: the locked sheet answers instead once the trial ended.
  const guard = useLockGuard();

  const asOf = today();
  const review = cancelReview(items, asOf);
  const inDisplay = (value: Money) => totalInDisplay([value], displayCurrency, rates);
  const running = [...review.running].sort((a, b) => inDisplay(b.yearly) - inDisplay(a.yearly));
  const planned = running.filter((r) => r.planned);
  const totals = (values: Money[]) => formatTotalsIn(sumByCurrency(values), displayCurrency, rates);

  if (running.length === 0 && review.stopped.length === 0) {
    return (
      <View style={styles.center}>
        <EmptyState icon="xmark.circle" title={t("allList.emptyTitle")} />
      </View>
    );
  }

  // One row shape for both lists: who, the yearly cost, one line of context,
  // and what a tap does (a mark, or the way to the item).
  const row = (
    item: PaymentItem,
    yearly: Money,
    sub: string,
    index: number,
    trailing: ReactNode,
    onPress: () => void,
    checked?: boolean,
  ) => {
    const category = categories.find((c) => c.id === item.categoryId);
    return (
      <Pressable
        key={item.id}
        style={[styles.row, index > 0 && styles.rowDivider]}
        onPress={onPress}
        accessibilityRole={checked === undefined ? "button" : "checkbox"}
        accessibilityState={checked === undefined ? undefined : { checked }}
      >
        <BrandBadge
          domain={item.domain}
          icon={item.icon ?? category?.icon}
          fallback={item.name.charAt(0).toUpperCase()}
          color={item.color ?? colors.accent}
          size={32}
        />
        <View style={styles.rowMiddle}>
          <View style={styles.rowTop}>
            <Text style={styles.rowName} numberOfLines={1}>
              {item.name}
            </Text>
            <Text style={styles.rowYearly}>
              {t("cancel.perYear", { amount: formatMoney(yearly) })}
            </Text>
          </View>
          <Text style={styles.rowSub} numberOfLines={2}>
            {sub}
          </Text>
        </View>
        {trailing}
      </Pressable>
    );
  };

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      contentInsetAdjustmentBehavior="automatic"
    >
      <ScreenTitle>{t("titles.cancellations")}</ScreenTitle>
      <HeroCard
        label={t("cancel.sectionTitle")}
        amount={
          planned.length > 0
            ? t("cancel.perYear", { amount: totals(planned.map((p) => p.yearly)) })
            : t("insights.nothingPlanned")
        }
        sub={
          planned.length > 0
            ? t("cancel.frees", {
                amount: formatTotalsIn(
                  summarizeCommitments(
                    planned.map((p) => p.item),
                    asOf,
                  ).monthly,
                  displayCurrency,
                  rates,
                ),
              })
            : undefined
        }
      />

      {running.length > 0 && (
        <>
          <Text style={styles.hint}>{t("cancel.reviewHint")}</Text>
          <Card>
            {running.map((c, index) => {
              const schedule = isRecurringSchedule(c.item.schedule) ? c.item.schedule : undefined;
              if (!schedule) return null;
              return row(
                c.item,
                c.yearly,
                // The same price the year is built on: left times the cycle
                // equals right, also with a price change or a trial ahead.
                `${formatMoney(c.price)} ${localizedRecurrence(schedule.recurrence)} · ${t(
                  "item.since",
                  { date: formatCalendarDate(schedule.firstChargeDate) },
                )}`,
                index,
                <SymbolView
                  name={c.planned ? "checkmark.circle.fill" : "circle"}
                  size={22}
                  tintColor={c.planned ? colors.tones.warning : colors.mutedText}
                />,
                guard(() => {
                  hapticSelection();
                  if (c.planned) keepSubscription(c.item.id);
                  else planCancel(c.item.id);
                }),
                c.planned,
              );
            })}
          </Card>
        </>
      )}

      {review.stopped.length > 0 && (
        <>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>{t("cancel.stoppedTitle")}</Text>
            <Text style={styles.sectionValue} numberOfLines={1}>
              {t("cancel.saves", { amount: totals(review.stopped.map((s) => s.yearly)) })}
            </Text>
          </View>
          <Card>
            {review.stopped.map((s, index) =>
              row(
                s.item,
                s.yearly,
                t(s.ended ? "cancel.endedOn" : "cancel.endsOn", {
                  date: formatCalendarDate(s.endDate),
                }),
                index,
                <SymbolView name="chevron.right" size={13} tintColor={colors.mutedText} />,
                () => router.push({ pathname: "/item", params: { id: s.item.id } }),
              ),
            )}
          </Card>
        </>
      )}
    </ScrollView>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: "transparent" },
    content: { padding: spacing.md, paddingBottom: spacing.xl, gap: spacing.md },
    center: {
      flex: 1,
      justifyContent: "center",
      backgroundColor: "transparent",
    },
    hint: { ...typography.caption, color: colors.mutedText, paddingHorizontal: spacing.xs },
    row: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
      paddingVertical: spacing.sm + 2,
    },
    // Dividers on top, so a list never ends on a stray line.
    rowDivider: {
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
    },
    rowMiddle: { flex: 1, gap: 1 },
    rowTop: {
      flexDirection: "row",
      alignItems: "baseline",
      justifyContent: "space-between",
      gap: spacing.sm,
    },
    // The name gives way; the yearly cost is the number this screen is for.
    rowName: { ...typography.body, color: colors.text, flexShrink: 1 },
    rowYearly: { ...typography.label, color: colors.text },
    rowSub: { ...typography.caption, color: colors.mutedText },
    sectionHeader: {
      flexDirection: "row",
      alignItems: "baseline",
      justifyContent: "space-between",
      gap: spacing.sm,
      paddingHorizontal: spacing.xs,
    },
    sectionTitle: { ...typography.label, color: colors.text },
    sectionValue: { ...typography.caption, color: colors.mutedText, flexShrink: 1 },
  });
}
