import {
  calendarDate,
  formatMoney,
  isInstallmentSchedule,
  summarizeCommitments,
  type Money,
} from "@keel/core";
import { useRouter } from "expo-router";
import { useMemo } from "react";
import { ActivityIndicator, FlatList, StyleSheet, Text, View } from "react-native";

import { SubscriptionRow } from "../../src/components/SubscriptionRow";
import { useSubscriptions } from "../../src/state/subscriptions";
import { radius, spacing, typography, useTheme, type ThemeColors } from "../../src/theme";

const formatTotals = (totals: Money[]) => totals.map(formatMoney).join(" + ");

export default function SubscriptionsScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { items, loading, removeSubscription, markPaid, markInstallmentPaid } = useSubscriptions();

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

  const today = calendarDate(new Date().toISOString().slice(0, 10));
  const commitments = summarizeCommitments(items, today);

  return (
    <FlatList
      style={styles.list}
      data={items}
      keyExtractor={(item) => item.id}
      contentContainerStyle={styles.listContent}
      ListHeaderComponent={
        commitments.monthly.length > 0 || commitments.bnplOutstanding.length > 0 ? (
          <View style={styles.summary}>
            <Text style={styles.summaryLabel}>Committed monthly</Text>
            <Text style={styles.summaryAmount}>
              {commitments.monthly.length > 0 ? formatTotals(commitments.monthly) : "Nothing yet"}
            </Text>
            {commitments.bnplOutstanding.length > 0 && (
              <Text style={styles.summarySub}>
                Pay-in-X still owed: {formatTotals(commitments.bnplOutstanding)}
              </Text>
            )}
          </View>
        ) : null
      }
      renderItem={({ item }) => (
        <SubscriptionRow
          item={item}
          onPress={() => router.push({ pathname: "/add", params: { id: item.id } })}
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
    // The headline number, in the same hero language as the Upcoming tab.
    summary: {
      backgroundColor: colors.navy,
      borderRadius: radius.lg,
      padding: spacing.lg,
      gap: spacing.xs,
      marginBottom: spacing.sm,
    },
    summaryLabel: {
      ...typography.caption,
      color: colors.white,
      opacity: 0.75,
      textTransform: "uppercase",
      letterSpacing: 0.6,
    },
    summaryAmount: {
      ...typography.title,
      color: colors.white,
    },
    summarySub: {
      ...typography.caption,
      color: colors.white,
      opacity: 0.75,
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
