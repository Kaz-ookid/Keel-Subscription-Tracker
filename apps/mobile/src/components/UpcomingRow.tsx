import { formatCalendarDate, formatMoney, type ProjectedCharge } from "@keel/core";
import { LinearGradient } from "expo-linear-gradient";
import { SymbolView } from "expo-symbols";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { brandBleed } from "../lib/brand";
import { useAppState } from "../state/app-state";
import {
  emphasis,
  radius,
  spacing,
  typography,
  useTheme,
  withAlpha,
  type ThemeColors,
} from "../theme";
import { Button } from "./ui/Button";
import { BrandBadge } from "./BrandBadge";

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
  const { t } = useTranslation();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { categories, accounts } = useAppState();

  const category = categories.find((c) => c.id === charge.categoryId);
  const account = accounts.find((a) => a.id === charge.accountId);
  const accent = brandBleed(charge, colors.accent);
  const settled = paid || skipped;

  // Context line: BNPL progress first, then where the money comes from.
  const parts: string[] = [];
  if (dated) parts.push(formatCalendarDate(charge.dueDate));
  if (charge.installmentIndex && charge.installmentCount) {
    parts.push(t("common.xOfY", { x: charge.installmentIndex, y: charge.installmentCount }));
  }
  parts.push(
    account?.name ?? (charge.settlementMode === "manual" ? t("row.manual") : t("row.automatic")),
  );
  if (skipped) parts.push(t("row.skipped"));

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
    >
      {/* The brand's color bleeds softly from the badge side (§9c). */}
      <LinearGradient
        colors={[withAlpha(accent, settled ? 0.06 : 0.16), "transparent"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 0.65, y: 0 }}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />
      {/* Dim the content, not the whole row — Undo must keep full strength. */}
      <View style={settled && styles.dimmed}>
        <BrandBadge
          domain={charge.domain}
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
            <Text style={{ color: colors.tones.warning }}>
              {t("row.due", { date: formatCalendarDate(charge.dueDate) })} ·{" "}
            </Text>
          ) : null}
          {parts.join(" · ")}
        </Text>
      </View>

      <View style={styles.right}>
        <View style={[styles.amountRow, settled && styles.dimmed]}>
          {paid && (
            <SymbolView name="checkmark.circle.fill" size={14} tintColor={colors.tones.success} />
          )}
          <Text
            style={[
              styles.amount,
              overdue && !settled && { color: colors.tones.warning },
              settled && { color: colors.mutedText },
              skipped && { textDecorationLine: "line-through" },
            ]}
          >
            {formatMoney(charge.amount)}
          </Text>
        </View>
        {showMarkPaid && <Button size="sm" label={t("common.markPaid")} onPress={onMarkPaid} />}
        {settled && onUndo && <Button size="sm" label={t("common.undo")} onPress={onUndo} />}
      </View>
    </Pressable>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    row: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: colors.material,
      borderWidth: 1,
      borderColor: colors.hairline,
      borderRadius: radius.lg,
      paddingVertical: spacing.sm + 2,
      paddingHorizontal: spacing.md,
      gap: spacing.md,
      overflow: "hidden",
    },
    // Settled content stays for completeness but doesn't catch the eye.
    dimmed: {
      opacity: emphasis.dim,
    },
    rowPressed: { transform: [{ scale: 0.98 }], opacity: 0.9 },
    amountRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.xs,
    },
    // A real button, full strength against the dimmed row — navy on accent
    // (pale accent TEXT alone read as disabled grey).
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
  });
}
