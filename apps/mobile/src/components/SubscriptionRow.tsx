import {
  canMarkPaid,
  formatCalendarDate,
  formatMoney,
  isInstallmentSchedule,
  isPaymentItemComplete,
  isRecurringSchedule,
  summarizeInstallmentPlan,
  today,
  type PaymentItem,
} from "@keel/core";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";

import { localizedRecurrence } from "../i18n/recurrence";
import { useAppState } from "../state/app-state";
import { radius, spacing, tones, typography, useTheme, type ThemeColors } from "../theme";
import { BrandBadge } from "./BrandBadge";

interface Props {
  item: PaymentItem;
  onPress: () => void;
  onMarkPaid: () => void;
  onDelete: () => void;
}

export function SubscriptionRow({ item, onPress, onMarkPaid, onDelete }: Props) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { categories, accounts } = useAppState();
  const category = categories.find((c) => c.id === item.categoryId);
  const account = accounts.find((a) => a.id === item.accountId);

  // Badge colour is the subscription's own colour, else the brand accent.
  const accent = item.color ?? colors.accent;

  const complete = isPaymentItemComplete(item, today());

  // Derive the row's display per schedule kind.
  const recurring = isRecurringSchedule(item.schedule) ? item.schedule : undefined;
  const installment = isInstallmentSchedule(item.schedule) ? item.schedule : undefined;
  const isManual = recurring ? item.settlementMode === "manual" : false;

  let subLine: string | undefined;
  let amount: string | undefined;
  let tag = "";
  let tagColor = colors.mutedText;
  let showMarkPaid = false;

  // One shared rule for both payment types: current month only.
  const canMark = canMarkPaid(item, today());

  if (recurring) {
    // A finished sub has no next billing — say when it ended instead.
    const when =
      complete && recurring.endDate
        ? t("row.endedOn", { date: formatCalendarDate(recurring.endDate) })
        : t("row.next", { date: formatCalendarDate(recurring.nextChargeDate) });
    subLine = `${localizedRecurrence(recurring.recurrence)} · ${when}`;
    amount = formatMoney(recurring.amount);
    tag = isManual ? t("row.manual") : t("row.automatic");
    tagColor = isManual ? tones.warning : tones.info;
    showMarkPaid = canMark;
    // Ticked off for this month: say so instead of offering the button.
    if (isManual && !canMark && !complete && recurring.nextChargeDate > recurring.firstChargeDate) {
      tag = t("row.paidThisCycle");
      tagColor = tones.success;
    }
    // Mid-trial: lead with the conversion + the price it'll become, not the
    // (often zero) intro amount.
    const trial = recurring.introOffer;
    if (trial && trial.convertsOn >= today() && !complete) {
      amount = formatMoney(trial.regularAmount);
      tag = t("row.trial", { date: formatCalendarDate(trial.convertsOn) });
      tagColor = colors.accent;
    }
  } else if (installment) {
    const s = summarizeInstallmentPlan(installment);
    const next = s.nextDue;
    subLine =
      t("row.planSub", { count: s.totalCount, paid: s.paidCount, total: s.totalCount }) +
      (next ? ` · ${t("row.next", { date: formatCalendarDate(next.dueDate) })}` : "");
    amount = formatMoney(next ? next.amount : s.totalAmount);
    showMarkPaid = canMark;
    if (!canMark && s.paidCount > 0 && !s.isComplete) {
      tag = t("row.paidThisCycle");
      tagColor = tones.success;
    } else {
      tag = t("row.payInX");
      tagColor = colors.accent;
    }
  }

  // Paused: kept around, clearly parked, no action.
  if (item.status === "paused") {
    tag = t("row.paused");
    tagColor = colors.mutedText;
    showMarkPaid = false;
  }

  // A finished item: greyed, labelled, no action.
  if (complete) {
    tag = recurring ? t("row.ended") : t("row.doneTag");
    tagColor = colors.mutedText;
    showMarkPaid = false;
  }

  const confirmDelete = () =>
    Alert.alert(t("row.deleteTitle"), t("row.deleteAsk", { name: item.name }), [
      { text: t("common.cancel"), style: "cancel" },
      { text: t("common.delete"), style: "destructive", onPress: onDelete },
    ]);

  return (
    <Pressable
      onPress={onPress}
      onLongPress={confirmDelete}
      style={[styles.row, (complete || item.status === "paused") && styles.rowComplete]}
    >
      <BrandBadge
        domain={item.domain}
        icon={category?.icon}
        fallback={item.name.charAt(0).toUpperCase()}
        color={accent}
      />

      <View style={styles.middle}>
        <Text style={styles.name} numberOfLines={1}>
          {item.name}
        </Text>
        {subLine && (
          <Text style={styles.sub} numberOfLines={1}>
            {subLine}
          </Text>
        )}
        {tag ? (
          <Text style={[styles.tag, { color: tagColor }]} numberOfLines={1}>
            {tag}
            {account ? <Text style={styles.tagAccount}> · {account.name}</Text> : null}
          </Text>
        ) : null}
      </View>

      <View style={styles.right}>
        {amount && <Text style={styles.amount}>{amount}</Text>}
        {showMarkPaid && (
          <Pressable onPress={onMarkPaid} style={styles.payButton}>
            <Text style={styles.payText}>{t("common.markPaid")}</Text>
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
    // "Which account does this hit" — quieter than the settlement tag itself.
    tagAccount: {
      ...typography.caption,
      fontWeight: "400",
      color: colors.mutedText,
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
