import { formatMoneyList, isInstallmentSchedule, summarizeCommitments, today } from "@keel/core";
import { useRouter } from "expo-router";
import { useMemo } from "react";
import { ActivityIndicator, FlatList, StyleSheet, Text, View } from "react-native";

import { useAppState } from "../../state/app-state";
import { spacing, typography, useTheme, type ThemeColors } from "../../theme";
import { HeroCard } from "../HeroCard";
import { SubscriptionRow } from "../SubscriptionRow";

/** The catalog: every item (including ended/paused ones a timeline can't show). */
export function SubscriptionsView() {
  const router = useRouter();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { items, loading, removeSubscription, markPaid, markInstallmentPaid } = useAppState();

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

  const commitments = summarizeCommitments(items, today());

  return (
    <FlatList
      style={styles.list}
      data={items}
      keyExtractor={(item) => item.id}
      contentContainerStyle={styles.listContent}
      ListHeaderComponent={
        commitments.monthly.length > 0 || commitments.bnplOutstanding.length > 0 ? (
          <HeroCard
            label="Committed monthly"
            amount={
              commitments.monthly.length > 0 ? formatMoneyList(commitments.monthly) : "Nothing yet"
            }
            sub={
              commitments.bnplOutstanding.length > 0
                ? `Pay-in-X still owed: ${formatMoneyList(commitments.bnplOutstanding)}`
                : undefined
            }
          />
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
