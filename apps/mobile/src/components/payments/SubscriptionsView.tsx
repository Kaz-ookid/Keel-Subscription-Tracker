import {
  DEFAULT_CATEGORIES,
  formatTotalsIn,
  isInstallmentSchedule,
  isPaymentItemComplete,
  isRecurringSchedule,
  summarizeCommitments,
  summarizeInstallmentPlan,
  today,
  type PaymentItem,
  type SuggestedCommitment,
} from "@keel/core";
import { useRouter } from "expo-router";
import { SymbolView } from "expo-symbols";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from "react-native";

import { useAppState } from "../../state/app-state";
import { radius, spacing, typography, useTheme, type ThemeColors } from "../../theme";
import { BrandBadge } from "../BrandBadge";
import { HeroCard } from "../HeroCard";
import { SubscriptionRow } from "../SubscriptionRow";

/** The day of the month an item bills on — its fixed "place" in the list. */
function billingDay(item: PaymentItem): number {
  if (isRecurringSchedule(item.schedule)) return Number(item.schedule.nextChargeDate.slice(8, 10));
  if (isInstallmentSchedule(item.schedule)) {
    const s = summarizeInstallmentPlan(item.schedule);
    return Number((s.nextDue?.dueDate ?? s.finalDueDate).slice(8, 10));
  }
  return 32;
}

/** The catalog: every item (including ended/paused ones a timeline can't show). */
export function SubscriptionsView() {
  const router = useRouter();
  const { colors } = useTheme();
  const { t } = useTranslation();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const {
    items,
    pending,
    displayCurrency,
    rates,
    loading,
    removeSubscription,
    removePendingSuggestion,
    markPaid,
    markInstallmentPaid,
  } = useAppState();
  // Open by default — the whole point of the list is to be acted on.
  const [pendingOpen, setPendingOpen] = useState(true);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  if (items.length === 0 && pending.length === 0) {
    return (
      <View style={styles.center}>
        <Text style={styles.emptyTitle}>{t("allList.emptyTitle")}</Text>
        <Text style={styles.emptyHint}>{t("allList.emptyHint")}</Text>
        <Pressable
          style={styles.getStarted}
          onPress={() => router.push({ pathname: "/onboarding", params: { mode: "start" } })}
        >
          <Text style={styles.getStartedText}>{t("common.getStarted")}</Text>
        </Pressable>
      </View>
    );
  }

  const fillIn = (s: SuggestedCommitment) =>
    router.push({
      pathname: "/add",
      params: {
        suggestionId: s.id,
        name: s.name,
        ...(s.categoryId ? { categoryId: s.categoryId } : {}),
        ...(s.color ? { color: s.color } : {}),
        ...(s.domain ? { domain: s.domain } : {}),
        unit: s.unit,
      },
    });

  const asOf = today();
  const commitments = summarizeCommitments(items, asOf);

  // A predictable, non-changing order: by the day of the month each item
  // bills on (the 5th before the 15th), finished items sinking to the bottom.
  // Sorting by "next charge" instead would reshuffle the list all the time.
  const sorted = [...items].sort((a, b) => {
    const doneA = isPaymentItemComplete(a, asOf) ? 1 : 0;
    const doneB = isPaymentItemComplete(b, asOf) ? 1 : 0;
    if (doneA !== doneB) return doneA - doneB;
    return billingDay(a) - billingDay(b) || a.name.localeCompare(b.name);
  });

  return (
    <FlatList
      style={styles.list}
      data={sorted}
      keyExtractor={(item) => item.id}
      contentContainerStyle={styles.listContent}
      ListHeaderComponent={
        <View style={styles.headerStack}>
          {(commitments.monthly.length > 0 || commitments.bnplOutstanding.length > 0) && (
            <HeroCard
              label={t("allList.committedMonthly")}
              amount={
                commitments.monthly.length > 0
                  ? formatTotalsIn(commitments.monthly, displayCurrency, rates)
                  : t("allList.nothingYet")
              }
              sub={
                commitments.bnplOutstanding.length > 0
                  ? t("allList.bnplOwed", {
                      amount: formatTotalsIn(commitments.bnplOutstanding, displayCurrency, rates),
                    })
                  : undefined
              }
            />
          )}
          {/* What the onboarding deck collected: each row opens the Add form
              pre-filled, the ✗ dismisses without adding. Rendered even when
              empty, so the to-do list stays discoverable and fillable. */}
          <View>
            <Pressable style={styles.pendingHeader} onPress={() => setPendingOpen((o) => !o)}>
              <View style={styles.pendingLine} />
              <Text style={styles.pendingTitle}>
                {pending.length > 0
                  ? t("allList.toComplete", { count: pending.length })
                  : t("allList.toCompleteEmpty")}
              </Text>
              <SymbolView
                name={pendingOpen ? "chevron.up" : "chevron.down"}
                size={11}
                tintColor={colors.mutedText}
              />
              <View style={styles.pendingLine} />
            </Pressable>
            {pendingOpen && (
              <View style={styles.pendingList}>
                {/* Back into the bank; todo shopping is resumable. */}
                <Pressable
                  style={[styles.browseRow, pending.length === 0 && styles.browseRowOnly]}
                  onPress={() =>
                    router.push({ pathname: "/onboarding", params: { mode: "browse" } })
                  }
                >
                  <SymbolView name="plus.circle" size={18} tintColor={colors.accent} />
                  <View style={styles.browseTexts}>
                    <Text style={styles.browseText}>
                      {pending.length > 0
                        ? t("allList.browseMore")
                        : t("allList.emptyPendingTitle")}
                    </Text>
                    {pending.length === 0 && (
                      <Text style={styles.browseHint}>{t("allList.emptyPendingHint")}</Text>
                    )}
                  </View>
                  <SymbolView name="chevron.right" size={13} tintColor={colors.mutedText} />
                </Pressable>
                {pending.map((s) => {
                  const category = DEFAULT_CATEGORIES.find((c) => c.id === s.categoryId);
                  return (
                    <View key={s.id} style={styles.pendingRow}>
                      <BrandBadge
                        domain={s.domain}
                        icon={category?.icon}
                        fallback={s.name.charAt(0).toUpperCase()}
                        color={s.color ?? colors.accent}
                        size={36}
                      />
                      <Text style={styles.pendingName} numberOfLines={1}>
                        {t(`bank.${s.id}`, { defaultValue: s.name })}
                      </Text>
                      <Pressable style={styles.addPill} onPress={() => fillIn(s)}>
                        <Text style={styles.addPillText}>{t("common.add")}</Text>
                      </Pressable>
                      <Pressable
                        accessibilityLabel={t("allList.dismissA11y", { name: s.name })}
                        hitSlop={8}
                        onPress={() => removePendingSuggestion(s.id)}
                      >
                        <SymbolView name="xmark" size={13} tintColor={colors.mutedText} />
                      </Pressable>
                    </View>
                  );
                })}
              </View>
            )}
          </View>
        </View>
      }
      renderItem={({ item }) => (
        <SubscriptionRow
          item={item}
          onPress={() => router.push({ pathname: "/item", params: { id: item.id } })}
          onMarkPaid={() =>
            isInstallmentSchedule(item.schedule) ? markInstallmentPaid(item.id) : markPaid(item.id)
          }
          onDelete={() => removeSubscription(item.id)}
        />
      )}
    />
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    list: {
      flex: 1,
      backgroundColor: colors.background,
    },
    listContent: {
      padding: spacing.md,
      gap: spacing.sm,
    },
    center: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      gap: spacing.sm,
      backgroundColor: colors.background,
    },
    emptyTitle: {
      ...typography.subtitle,
      color: colors.text,
      fontWeight: "600",
    },
    emptyHint: {
      ...typography.body,
      color: colors.mutedText,
    },
    getStarted: {
      marginTop: spacing.sm,
      backgroundColor: colors.action,
      borderRadius: radius.md,
      paddingVertical: spacing.sm + 2,
      paddingHorizontal: spacing.xl,
    },
    getStartedText: {
      ...typography.label,
      color: colors.actionText,
    },
    headerStack: {
      gap: spacing.sm,
    },
    pendingHeader: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
      paddingVertical: spacing.xs,
    },
    pendingLine: {
      flex: 1,
      height: StyleSheet.hairlineWidth,
      backgroundColor: colors.border,
    },
    pendingTitle: {
      ...typography.caption,
      fontWeight: "600",
      color: colors.mutedText,
    },
    pendingList: {
      backgroundColor: colors.surface,
      borderRadius: radius.md,
      paddingHorizontal: spacing.md,
    },
    pendingRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
      paddingVertical: spacing.sm,
    },
    browseRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
      paddingVertical: spacing.sm,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    browseRowOnly: {
      borderBottomWidth: 0,
    },
    browseTexts: {
      flex: 1,
      gap: 1,
    },
    browseText: {
      ...typography.caption,
      fontWeight: "600",
      color: colors.text,
    },
    browseHint: {
      ...typography.caption,
      color: colors.mutedText,
    },
    pendingName: {
      ...typography.body,
      color: colors.text,
      flex: 1,
    },
    addPill: {
      backgroundColor: colors.action,
      borderRadius: radius.sm,
      paddingVertical: spacing.xs,
      paddingHorizontal: spacing.sm,
    },
    addPillText: {
      ...typography.caption,
      fontWeight: "600",
      color: colors.actionText,
    },
  });
}
