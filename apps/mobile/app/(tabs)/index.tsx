import { FlatList, ActivityIndicator, StyleSheet, Text, View } from "react-native";

import { SubscriptionRow } from "../../src/components/SubscriptionRow";
import { useSubscriptions } from "../../src/state/subscriptions";
import { colors, spacing, typography } from "../../src/theme";

export default function SubscriptionsScreen() {
  const { items, loading, removeSubscription, markPaid } = useSubscriptions();

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.navy} />
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

  return (
    <FlatList
      style={styles.list}
      data={items}
      keyExtractor={(item) => item.id}
      contentContainerStyle={styles.listContent}
      renderItem={({ item }) => (
        <SubscriptionRow
          item={item}
          onMarkPaid={() => markPaid(item.id)}
          onDelete={() => removeSubscription(item.id)}
        />
      )}
    />
  );
}

const styles = StyleSheet.create({
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
