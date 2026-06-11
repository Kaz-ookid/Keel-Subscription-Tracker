import {
  calendarDate,
  describeRecurrence,
  formatCalendarDate,
  formatMoney,
  isInstallmentSchedule,
  isPaymentItemComplete,
  isRecurringSchedule,
  summarizeInstallmentPlan,
  type PaymentItem,
} from "@keel/core";
import { SymbolView, type SymbolViewProps } from "expo-symbols";
import { useMemo } from "react";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";

import { useSubscriptions } from "../state/subscriptions";
import { radius, spacing, tones, typography, useTheme, type ThemeColors } from "../theme";

interface Props {
  item: PaymentItem;
  onPress: () => void;
  onMarkPaid: () => void;
  onDelete: () => void;
}

export function SubscriptionRow({ item, onPress, onMarkPaid, onDelete }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { categories } = useSubscriptions();
  const category = categories.find((c) => c.id === item.categoryId);

  // Badge colour is the subscription's own colour, else the brand accent.
  const accent = item.color ?? colors.accent;

  const today = calendarDate(new Date().toISOString().slice(0, 10));
  const complete = isPaymentItemComplete(item, today);

  // Derive the row's display per schedule kind.
  const recurring = isRecurringSchedule(item.schedule) ? item.schedule : undefined;
  const installment = isInstallmentSchedule(item.schedule) ? item.schedule : undefined;
  const isManual = recurring ? item.settlementMode === "manual" : false;

  let subLine: string | undefined;
  let amount: string | undefined;
  let tag = "";
  let tagColor = colors.mutedText;
  let showMarkPaid = false;

  if (recurring) {
    // A finished sub has no next billing — say when it ended instead.
    const when =
      complete && recurring.endDate
        ? `ended ${formatCalendarDate(recurring.endDate)}`
        : `next ${formatCalendarDate(recurring.nextChargeDate)}`;
    subLine = `${describeRecurrence(recurring.recurrence)} · ${when}`;
    amount = formatMoney(recurring.amount);
    tag = isManual ? "Manual" : "Automatic";
    tagColor = isManual ? tones.warning : tones.info;
    showMarkPaid = isManual;
  } else if (installment) {
    const s = summarizeInstallmentPlan(installment);
    const next = s.nextDue;
    subLine = `${s.totalCount}× · ${s.paidCount} of ${s.totalCount} paid${next ? ` · next ${formatCalendarDate(next.dueDate)}` : ""}`;
    amount = formatMoney(next ? next.amount : s.totalAmount);
    tag = "Pay in X";
    tagColor = colors.accent;
    showMarkPaid = true;
  }

  // A finished item: greyed, labelled, no action.
  if (complete) {
    tag = recurring ? "Ended" : "Done";
    tagColor = colors.mutedText;
    showMarkPaid = false;
  }

  const confirmDelete = () =>
    Alert.alert("Delete subscription", `Remove “${item.name}”?`, [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: onDelete },
    ]);

  return (
    <Pressable
      onPress={onPress}
      onLongPress={confirmDelete}
      style={[styles.row, complete && styles.rowComplete]}
    >
      <View style={[styles.badge, { backgroundColor: accent }]}>
        {category?.icon ? (
          <SymbolView
            name={category.icon as SymbolViewProps["name"]}
            size={22}
            tintColor={colors.white}
          />
        ) : (
          <Text style={styles.badgeText}>{item.name.charAt(0).toUpperCase()}</Text>
        )}
      </View>

      <View style={styles.middle}>
        <Text style={styles.name} numberOfLines={1}>
          {item.name}
        </Text>
        {subLine && (
          <Text style={styles.sub} numberOfLines={1}>
            {subLine}
          </Text>
        )}
        {tag ? <Text style={[styles.tag, { color: tagColor }]}>{tag}</Text> : null}
      </View>

      <View style={styles.right}>
        {amount && <Text style={styles.amount}>{amount}</Text>}
        {showMarkPaid && (
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
    rowComplete: {
      opacity: 0.55,
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
