import {
  formatTotalsIn,
  isInstallmentSchedule,
  isPaymentItemComplete,
  isRecurringSchedule,
  summarizeCommitments,
  summarizeInstallmentPlan,
  today,
  type PaymentItem,
} from "@keel/core";
import { useRouter } from "expo-router";
import { useMemo } from "react";
import { ActivityIndicator, FlatList, StyleSheet, Text, View } from "react-native";

import { useAppState } from "../../state/app-state";
import { spacing, typography, useTheme, type ThemeColors } from "../../theme";
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
  const styles = useMemo(() => createStyles(colors), [colors]);
  const {
    items,
    displayCurrency,
    rates,
    loading,
    removeSubscription,
    markPaid,
    markInstallmentPaid,
  } = useAppState();

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  if (items.length === 0) {
    return (
      <View style={styles.center}>
        <Text style={styles.emptyTitle}>No subscriptions yet</Text>
        <Text style={styles.emptyHint}>Tap ＋ to add your first one.</Text>
      </View>
    );
  }

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
        commitments.monthly.length > 0 || commitments.bnplOutstanding.length > 0 ? (
          <HeroCard
            label="Committed monthly"
            amount={
              commitments.monthly.length > 0
                ? formatTotalsIn(commitments.monthly, displayCurrency, rates)
                : "Nothing yet"
            }
            sub={
              commitments.bnplOutstanding.length > 0
                ? `Pay-in-X still owed: ${formatTotalsIn(commitments.bnplOutstanding, displayCurrency, rates)}`
                : undefined
            }
          />
        ) : null
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
  });
}
