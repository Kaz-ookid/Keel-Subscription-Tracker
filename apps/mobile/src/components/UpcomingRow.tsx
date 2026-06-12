import { formatCalendarDate, formatMoney, type ProjectedCharge } from "@keel/core";
import { SymbolView } from "expo-symbols";
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
  /** Already settled this month — rendered quiet, kept for completeness. */
  paid?: boolean;
  /** Deliberately sat out — quiet, struck through. */
  skipped?: boolean;
  /** When present (on the most recent settlement), a small Undo appears. */
  onUndo?: () => void;
  /** Outside a day section (e.g. the paid fold) the row states its own date. */
  dated?: boolean;
  onPress: () => void;
  onMarkPaid: () => void;
}

/** One charge in the Upcoming timeline — same card language as the list. */
export function UpcomingRow({
  charge,
  overdue,
  showMarkPaid,
  paid,
  skipped,
  onUndo,
  dated,
  onPress,
  onMarkPaid,
}: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { categories, accounts } = useAppState();

  const category = categories.find((c) => c.id === charge.categoryId);
  const account = accounts.find((a) => a.id === charge.accountId);
  const accent = charge.color ?? colors.accent;
  const settled = paid || skipped;

  // Context line: BNPL progress first, then where the money comes from.
  const parts: string[] = [];
  if (dated) parts.push(formatCalendarDate(charge.dueDate));
  if (charge.installmentIndex && charge.installmentCount) {
    parts.push(`${charge.installmentIndex} of ${charge.installmentCount}`);
  }
  parts.push(account?.name ?? (charge.settlementMode === "manual" ? "Manual" : "Automatic"));
  if (skipped) parts.push("skipped");

  return (
    <Pressable onPress={onPress} style={styles.row}>
      {/* Dim the content, not the whole row — Undo must keep full strength. */}
      <View style={settled && styles.dimmed}>
        <IconBadge
          icon={category?.icon}
          fallback={charge.name.charAt(0).toUpperCase()}
          color={accent}
          size={36}
        />
      </View>

      <View style={[styles.middle, settled && styles.dimmed]}>
        <Text style={styles.name} numberOfLines={1}>
          {charge.name}
        </Text>
        <Text style={styles.sub} numberOfLines={1}>
          {/* The Overdue section groups many dates — each row says its own. */}
          {overdue ? (
            <Text style={{ color: tones.warning }}>
              due {formatCalendarDate(charge.dueDate)} ·{" "}
            </Text>
          ) : null}
          {parts.join(" · ")}
        </Text>
      </View>

      <View style={styles.right}>
        <View style={[styles.amountRow, settled && styles.dimmed]}>
          {paid && <SymbolView name="checkmark.circle.fill" size={14} tintColor={tones.success} />}
          <Text
            style={[
              styles.amount,
              overdue && !settled && { color: tones.warning },
              settled && { color: colors.mutedText },
              skipped && { textDecorationLine: "line-through" },
            ]}
          >
            {formatMoney(charge.amount)}
          </Text>
        </View>
        {showMarkPaid && (
          <Pressable onPress={onMarkPaid} style={styles.payButton} hitSlop={6}>
            <Text style={styles.payText}>Mark paid</Text>
          </Pressable>
        )}
        {settled && onUndo && (
          <Pressable onPress={onUndo} hitSlop={8}>
            <Text style={styles.undoText}>Undo</Text>
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
    // Settled content stays for completeness but doesn't catch the eye.
    dimmed: {
      opacity: 0.5,
    },
    amountRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.xs,
    },
    undoText: {
      ...typography.caption,
      color: colors.accent,
      fontWeight: "600",
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
