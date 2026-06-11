import { formatMoney, type ProjectedCharge } from "@keel/core";
import { useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { useAppState } from "../state/app-state";
import { radius, spacing, tones, typography, useTheme, type ThemeColors } from "../theme";
import { IconBadge } from "./IconBadge";

interface Props {
  charge: ProjectedCharge;
  /** The charge's due date has passed — tint the amount as needing attention. */
  overdue: boolean;
  /** Offer the inline "Mark paid" action (manual/installment, due, earliest). */
  showMarkPaid: boolean;
  onPress: () => void;
  onMarkPaid: () => void;
}

/** One charge in the Upcoming timeline — same card language as the list. */
export function UpcomingRow({ charge, overdue, showMarkPaid, onPress, onMarkPaid }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { categories, accounts } = useAppState();

  const category = categories.find((c) => c.id === charge.categoryId);
  const account = accounts.find((a) => a.id === charge.accountId);
  const accent = charge.color ?? colors.accent;

  // Context line: BNPL progress first, then where the money comes from.
  const parts: string[] = [];
  if (charge.installmentIndex && charge.installmentCount) {
    parts.push(`${charge.installmentIndex} of ${charge.installmentCount}`);
  }
  parts.push(account?.name ?? (charge.settlementMode === "manual" ? "Manual" : "Automatic"));

  return (
    <Pressable onPress={onPress} style={styles.row}>
      <IconBadge
        icon={category?.icon}
        fallback={charge.name.charAt(0).toUpperCase()}
        color={accent}
        size={36}
      />

      <View style={styles.middle}>
        <Text style={styles.name} numberOfLines={1}>
          {charge.name}
        </Text>
        <Text style={styles.sub} numberOfLines={1}>
          {parts.join(" · ")}
        </Text>
      </View>

      <View style={styles.right}>
        <Text style={[styles.amount, overdue && { color: tones.warning }]}>
          {formatMoney(charge.amount)}
        </Text>
        {showMarkPaid && (
          <Pressable onPress={onMarkPaid} style={styles.payButton} hitSlop={6}>
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
      paddingVertical: spacing.sm + 2,
      paddingHorizontal: spacing.md,
      gap: spacing.md,
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
    right: {
      alignItems: "flex-end",
      gap: spacing.xs,
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
