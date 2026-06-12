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
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from "react-native";

import { useAppState } from "../../state/app-state";
import { radius, spacing, typography, useTheme, type ThemeColors } from "../../theme";
import { HeroCard } from "../HeroCard";
import { IconBadge } from "../IconBadge";
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
        <Text style={styles.emptyTitle}>No subscriptions yet</Text>
        <Text style={styles.emptyHint}>Tap ＋ to add your first one.</Text>
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
          )}
          {/* What the onboarding deck collected: each row opens the Add form
              pre-filled, the ✗ dismisses without adding. */}
          {pending.length > 0 && (
            <View>
              <Pressable style={styles.pendingHeader} onPress={() => setPendingOpen((o) => !o)}>
                <View style={styles.pendingLine} />
                <Text style={styles.pendingTitle}>To complete · {pending.length}</Text>
                <SymbolView
                  name={pendingOpen ? "chevron.up" : "chevron.down"}
                  size={11}
                  tintColor={colors.mutedText}
                />
                <View style={styles.pendingLine} />
              </Pressable>
              {pendingOpen && (
                <View style={styles.pendingList}>
                  {pending.map((s) => {
                    const category = DEFAULT_CATEGORIES.find((c) => c.id === s.categoryId);
                    return (
                      <View key={s.id} style={styles.pendingRow}>
                        <IconBadge
                          icon={category?.icon}
                          fallback={s.name.charAt(0).toUpperCase()}
                          color={colors.accent}
                          size={36}
                        />
                        <Text style={styles.pendingName} numberOfLines={1}>
                          {s.name}
                        </Text>
                        <Pressable style={styles.addPill} onPress={() => fillIn(s)}>
                          <Text style={styles.addPillText}>Add</Text>
                        </Pressable>
                        <Pressable
                          accessibilityLabel={`Dismiss ${s.name}`}
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
          )}
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
    pendingName: {
      ...typography.body,
      color: colors.text,
      flex: 1,
    },
    addPill: {
      backgroundColor: colors.accent,
      borderRadius: radius.sm,
      paddingVertical: spacing.xs,
      paddingHorizontal: spacing.sm,
    },
    addPillText: {
      ...typography.caption,
      fontWeight: "600",
      color: colors.white,
    },
  });
}
