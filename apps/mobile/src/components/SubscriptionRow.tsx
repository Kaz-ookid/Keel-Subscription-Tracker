import {
  describeRecurrence,
  formatCalendarDate,
  formatMoney,
  isRecurringSchedule,
  type PaymentItem,
} from "@keel/core";
import { useMemo } from "react";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";

import { radius, spacing, tones, typography, useTheme, type ThemeColors } from "../theme";

interface Props {
  item: PaymentItem;
  onMarkPaid: () => void;
  onDelete: () => void;
}

export function SubscriptionRow({ item, onMarkPaid, onDelete }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  // Badge colour is the subscription's own colour, else the brand accent.
  const accent = item.color ?? colors.accent;
  const isManual = item.settlementMode === "manual";
  const schedule = isRecurringSchedule(item.schedule) ? item.schedule : undefined;

  const confirmDelete = () =>
    Alert.alert("Delete subscription", `Remove “${item.name}”?`, [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: onDelete },
    ]);

  return (
    <Pressable onLongPress={confirmDelete} style={styles.row}>
      <View style={[styles.badge, { backgroundColor: accent }]}>
        <Text style={styles.badgeText}>{item.name.charAt(0).toUpperCase()}</Text>
      </View>

      <View style={styles.middle}>
        <Text style={styles.name} numberOfLines={1}>
          {item.name}
        </Text>
        {schedule && (
          <Text style={styles.sub} numberOfLines={1}>
            {describeRecurrence(schedule.recurrence)} · next{" "}
            {formatCalendarDate(schedule.nextChargeDate)}
          </Text>
        )}
        <Text style={[styles.tag, { color: isManual ? tones.warning : tones.info }]}>
          {isManual ? "Manual" : "Automatic"}
        </Text>
      </View>

      <View style={styles.right}>
        {schedule && <Text style={styles.amount}>{formatMoney(schedule.amount)}</Text>}
        {isManual && (
          <Pressable onPress={onMarkPaid} style={styles.payButton}>
            <Text style={styles.payText}>Mark paid</Text>
          </Pressable>
        )}
      </View>
    </Pressable>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    row: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: colors.surface,
      borderRadius: radius.md,
      padding: spacing.md,
      gap: spacing.md,
    },
    badge: {
      width: 44,
      height: 44,
      borderRadius: 22,
      alignItems: "center",
      justifyContent: "center",
    },
    badgeText: {
      color: colors.white,
      fontSize: 20,
      fontWeight: "700",
    },
    middle: {
      flex: 1,
      gap: 2,
    },
    name: {
      ...typography.label,
      color: colors.text,
    },
    sub: {
      ...typography.caption,
      color: colors.mutedText,
    },
    tag: {
      ...typography.caption,
      fontWeight: "600",
    },
    right: {
      alignItems: "flex-end",
      gap: spacing.sm,
    },
    amount: {
      ...typography.label,
      color: colors.text,
    },
    payButton: {
      paddingVertical: spacing.xs,
      paddingHorizontal: spacing.sm,
      borderRadius: radius.sm,
      backgroundColor: colors.navy,
    },
    payText: {
      ...typography.caption,
      color: colors.white,
      fontWeight: "600",
    },
  });
}
