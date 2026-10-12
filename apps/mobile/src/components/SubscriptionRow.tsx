import {
  canMarkPaid,
  formatCalendarDate,
  shiftOffWeekend,
  formatMoney,
  isInstallmentSchedule,
  isPaymentItemComplete,
  isRecurringSchedule,
  summarizeInstallmentPlan,
  today,
  type PaymentItem,
} from "@keel/core";
import { LinearGradient } from "expo-linear-gradient";
import { memo } from "react";
import { useTranslation } from "react-i18next";
import { Alert, StyleSheet, Text, View } from "react-native";

import { localizedRecurrence } from "../i18n/recurrence";
import { brandBleed } from "../lib/brand";
import { useBrandTints } from "../lib/dominant-color";
import { useAppData } from "../state/app-state";
import {
  emphasis,
  radius,
  spacing,
  type ThemeColors,
  typography,
  useStyles,
  useTheme,
  withAlpha,
} from "../theme";
import { SwipeRow } from "./ui/SwipeRow";
import { BrandBadge } from "./BrandBadge";

import { useLockGuard } from "../lib/lock-gate";
interface Props {
  item: PaymentItem;
  onPress: () => void;
  onDelete: () => void;
}

export const SubscriptionRow = memo(function SubscriptionRow({ item, onPress, onDelete }: Props) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const styles = useStyles(createStyles);
  const { categories, accounts } = useAppData();
  const category = categories.find((c) => c.id === item.categoryId);
  const account = accounts.find((a) => a.id === item.accountId);

  // Resolved brand color: the item's own, else the bank's, never mono.
  // Repaint when a logo's extracted tint lands (dev builds).
  useBrandTints();
  const accent = brandBleed(item, colors.accent);

  const complete = isPaymentItemComplete(item);

  // Derive the row's display per schedule kind.
  const recurring = isRecurringSchedule(item.schedule) ? item.schedule : undefined;
  const installment = isInstallmentSchedule(item.schedule) ? item.schedule : undefined;
  const isManual = recurring ? item.settlementMode === "manual" : false;

  let subLine: string | undefined;
  let amount: string | undefined;
  let tag = "";
  let tagColor = colors.mutedText;

  // One shared rule for both payment types: current month only.
  const canMark = canMarkPaid(item, today());

  if (recurring) {
    // A finished sub has no next billing — say when it ended instead.
    const when =
      complete && recurring.endDate
        ? t("row.endedOn", { date: formatCalendarDate(recurring.endDate) })
        : t("row.next", {
            date: formatCalendarDate(shiftOffWeekend(recurring.nextChargeDate, item.weekendShift)),
          });
    subLine = `${localizedRecurrence(recurring.recurrence)} · ${when}`;
    amount = formatMoney(recurring.amount);
    tag = isManual ? t("row.manual") : t("row.automatic");
    tagColor = isManual ? colors.tones.warning : colors.tones.info;
    // Ticked off for this month: say so instead of offering the button.
    if (isManual && !canMark && !complete && recurring.nextChargeDate > recurring.firstChargeDate) {
      tag = t("row.paidThisCycle");
      tagColor = colors.tones.success;
    }
    // A live intro offer: a free trial leads with the price it'll BECOME; a
    // paid price change keeps the current price and just flags the upcoming
    // jump.
    const trial = recurring.introOffer;
    if (trial && trial.convertsOn >= today() && !complete) {
      if (recurring.amount.amount === 0) {
        amount = formatMoney(trial.regularAmount);
        tag = t("row.trial", { date: formatCalendarDate(trial.convertsOn) });
      } else {
        // The NEW amount rides in the tag, so editing the future price shows
        // its effect immediately (the big number stays today's price).
        tag = t("row.priceChange", {
          amount: formatMoney(trial.regularAmount),
          date: formatCalendarDate(trial.convertsOn),
        });
      }
      tagColor = colors.accent;
    }
  } else if (installment) {
    const s = summarizeInstallmentPlan(installment);
    const next = s.nextDue;
    subLine =
      t("row.planSub", { count: s.totalCount, paid: s.paidCount, total: s.totalCount }) +
      (next
        ? ` · ${t("row.next", { date: formatCalendarDate(shiftOffWeekend(next.dueDate, item.weekendShift)) })}`
        : "");
    amount = formatMoney(next ? next.amount : s.totalAmount);
    if (!canMark && s.paidCount > 0 && !s.isComplete) {
      tag = t("row.paidThisCycle");
      tagColor = colors.tones.success;
    } else {
      tag = t("row.payInX");
      tagColor = colors.accent;
    }
  }

  // Paused: kept around, clearly parked, no action.
  if (item.status === "paused") {
    tag = t("row.paused");
    tagColor = colors.mutedText;
  }

  // A finished item: greyed, labelled, no action.
  if (complete) {
    tag = recurring ? t("row.ended") : t("row.doneTag");
    tagColor = colors.mutedText;
  }

  // Swipe left reveals the one destructive action (the mail idiom; long-press
  // retired — one clear gesture). The confirm alert stays. Deleting is a
  // WRITE: locked swipes land on the locked sheet instead.
  const guard = useLockGuard();
  const confirmDelete = () => {
    Alert.alert(t("row.deleteTitle"), t("row.deleteAsk", { name: item.name }), [
      { text: t("common.cancel"), style: "cancel" },
      { text: t("common.delete"), style: "destructive", onPress: onDelete },
    ]);
  };

  return (
    <SwipeRow rowId={item.id} onPress={onPress} onAction={guard(confirmDelete)}>
      <View style={[styles.row, (complete || item.status === "paused") && styles.rowComplete]}>
        {/* The brand's color bleeds softly from the badge side (§9c). */}
        <LinearGradient
          colors={[withAlpha(accent, 0.16), "transparent"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 0.65, y: 0 }}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />
        <BrandBadge
          domain={item.domain}
          icon={item.icon ?? category?.icon}
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

        <View style={styles.right}>{amount && <Text style={styles.amount}>{amount}</Text>}</View>
      </View>
    </SwipeRow>
  );
});

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    row: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: colors.material,
      borderWidth: 1,
      borderColor: colors.hairline,
      borderRadius: radius.lg,
      padding: spacing.md,
      gap: spacing.md,
      overflow: "hidden",
    },
    rowComplete: {
      opacity: emphasis.dim,
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
  });
}
