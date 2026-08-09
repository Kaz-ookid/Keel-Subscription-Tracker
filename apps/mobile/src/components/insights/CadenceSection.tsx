// The "By billing cycle" section of Insights: one accordion row per cadence
// bucket (monthly / yearly / other) listing its live subscriptions biggest
// first, plus the Pay-in-X card — whose bar is PROGRESS PAID and whose headline
// is what's still owed (a per-month figure makes no sense for a finite plan).
// Owns its expand state; renders nothing when there is nothing to group.

import {
  cadenceBucket,
  formatMoney,
  formatTotalsIn,
  groupByCadence,
  isInstallmentSchedule,
  isPaymentItemComplete,
  isRecurringSchedule,
  summarizeInstallmentPlan,
  sumByCurrency,
  type CalendarDate,
  type Category,
  type CurrencyCode,
  type ExchangeRates,
  type PaymentItem,
} from "@keel/core";
import { useRouter } from "expo-router";
import { SymbolView } from "expo-symbols";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Animated from "react-native-reanimated";

import { localizedRecurrence } from "../../i18n/recurrence";
import { totalInDisplay } from "../../lib/money-display";
import { foldIn, foldLayout, foldOut } from "../../lib/motion";
import { radius, spacing, typography, useTheme, type ThemeColors } from "../../theme";
import { BrandBadge } from "../BrandBadge";

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

interface Props {
  items: PaymentItem[];
  categories: Category[];
  asOf: CalendarDate;
  displayCurrency: CurrencyCode;
  rates: ExchangeRates | null;
}

export function CadenceSection({ items, categories, asOf, displayCurrency, rates }: Props) {
  const router = useRouter();
  const { colors } = useTheme();
  const { t } = useTranslation();
  const styles = useMemo(() => createStyles(colors), [colors]);
  // The expanded billing-cycle card ("interval-unit", or "bnpl").
  const [expanded, setExpanded] = useState<string | null>(null);

  const totals = (values: Parameters<typeof formatTotalsIn>[0]) =>
    formatTotalsIn(values, displayCurrency, rates);

  const cadences = groupByCadence(items, asOf);

  // Pay in X: what matters is how much is STILL OWED, and how far along.
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
  const bnplTotalDisplay = totalInDisplay(bnplTotal, displayCurrency, rates);
  const bnplPaidShare =
    bnplTotalDisplay > 0
      ? Math.min(totalInDisplay(bnplPaid, displayCurrency, rates) / bnplTotalDisplay, 1)
      : 0;

  if (cadences.length === 0 && planSummaries.length === 0) return null;

  return (
    <Animated.View layout={foldLayout} style={styles.section}>
      <Text style={styles.sectionTitle}>{t("insights.byBillingCycle")}</Text>
      {cadences.map((g) => {
        const key = g.kind;
        const open = expanded === key;
        const label =
          g.kind === "monthly"
            ? t("insights.cycleMonthly")
            : g.kind === "yearly"
              ? t("insights.cycleYearly")
              : t("insights.cycleOther");
        // The live subscriptions in this bucket, biggest first.
        const members = items
          .filter(
            (i) =>
              i.status === "active" &&
              isRecurringSchedule(i.schedule) &&
              !isPaymentItemComplete(i, asOf) &&
              cadenceBucket(i.schedule.recurrence) === g.kind,
          )
          .sort((a, b) => {
            const av = isRecurringSchedule(a.schedule)
              ? totalInDisplay([a.schedule.amount], displayCurrency, rates)
              : 0;
            const bv = isRecurringSchedule(b.schedule)
              ? totalInDisplay([b.schedule.amount], displayCurrency, rates)
              : 0;
            return bv - av;
          });
        return (
          // The accordion: this row grows and everything below slides.
          <Animated.View key={key} style={styles.cadenceRow} layout={foldLayout}>
            <Pressable style={styles.cadenceBody} onPress={() => setExpanded(open ? null : key)}>
              <View style={styles.cadenceHeader}>
                <Text style={styles.cadenceLabel}>
                  {label} <Text style={styles.cadenceCount}>×{g.count}</Text>
                </Text>
                <View style={styles.cadenceRight}>
                  <Text style={styles.cadenceAmount}>
                    {t("insights.perMoYr", {
                      mo: totals(g.monthlyTotal),
                      yr: totals(g.yearlyTotal),
                    })}
                  </Text>
                  <SymbolView
                    name={open ? "chevron.up" : "chevron.down"}
                    size={11}
                    tintColor={colors.mutedText}
                  />
                </View>
              </View>
            </Pressable>
            {open && (
              <Animated.View entering={foldIn} exiting={foldOut}>
                {members.map((item) => {
                  const category = categories.find((c) => c.id === item.categoryId);
                  const recurring = isRecurringSchedule(item.schedule) ? item.schedule : undefined;
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
                      <View style={styles.memberMiddle}>
                        <Text style={styles.memberName} numberOfLines={1}>
                          {item.name}
                        </Text>
                        {/* In the catch-all "Other" bucket, each item shows
                            its own cadence — the headline can't. */}
                        {g.kind === "other" && recurring && (
                          <Text style={styles.memberCadence} numberOfLines={1}>
                            {capitalize(localizedRecurrence(recurring.recurrence))}
                          </Text>
                        )}
                      </View>
                      <Text style={styles.memberValue}>
                        {recurring ? formatMoney(recurring.amount) : ""}
                      </Text>
                      <SymbolView name="chevron.right" size={13} tintColor={colors.mutedText} />
                    </Pressable>
                  );
                })}
              </Animated.View>
            )}
          </Animated.View>
        );
      })}

      {/* Pay in X earns its own card. */}
      {planSummaries.length > 0 && (
        <Animated.View style={styles.cadenceRow} layout={foldLayout}>
          <Pressable
            style={styles.cadenceBody}
            onPress={() => setExpanded(expanded === "bnpl" ? null : "bnpl")}
          >
            <View style={styles.cadenceHeader}>
              <Text style={styles.cadenceLabel}>
                {t("insights.splitPayments")}{" "}
                <Text style={styles.cadenceCount}>×{planSummaries.length}</Text>
              </Text>
              <View style={styles.cadenceRight}>
                <Text style={styles.bnplOwed}>
                  {t("insights.stillOwed", { amount: totals(bnplRemaining) })}
                </Text>
                <SymbolView
                  name={expanded === "bnpl" ? "chevron.up" : "chevron.down"}
                  size={11}
                  tintColor={colors.mutedText}
                />
              </View>
            </View>
            {/* The plan total rides beside the bar, not under it — no extra
                line for a few words. */}
            <View style={styles.bnplTrackRow}>
              <View style={[styles.shareTrack, styles.bnplTrack]}>
                <View style={[styles.shareFill, { flex: bnplPaidShare }]} />
                <View style={{ flex: 1 - bnplPaidShare }} />
              </View>
              <Text style={styles.statHint}>
                {t("insights.ofTotal", { total: totals(bnplTotal) })}
              </Text>
            </View>
          </Pressable>
          {expanded === "bnpl" && (
            <Animated.View entering={foldIn} exiting={foldOut}>
              {planItems.map((item) => {
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
                    <SymbolView name="chevron.right" size={13} tintColor={colors.mutedText} />
                  </Pressable>
                );
              })}
            </Animated.View>
          )}
        </Animated.View>
      )}
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
    cadenceRow: {
      backgroundColor: colors.material,
      borderWidth: 1,
      borderColor: colors.hairline,
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
    memberMiddle: { flex: 1, gap: 1 },
    memberName: { ...typography.body, color: colors.text },
    memberCadence: { ...typography.caption, color: colors.mutedText },
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
    bnplTrackRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
    },
    bnplTrack: {
      flex: 1,
    },
    shareTrack: {
      flexDirection: "row",
      height: 4,
      borderRadius: 2,
      backgroundColor: "transparent",
      overflow: "hidden",
    },
    shareFill: {
      backgroundColor: colors.accent,
      borderRadius: 2,
    },
    statHint: {
      ...typography.caption,
      color: colors.mutedText,
    },
  });
}
