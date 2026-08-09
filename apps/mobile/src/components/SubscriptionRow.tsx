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
import { LinearGradient } from "expo-linear-gradient";
import { SymbolView } from "expo-symbols";
import { useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";
import ReanimatedSwipeable, {
  type SwipeableMethods,
} from "react-native-gesture-handler/ReanimatedSwipeable";

import { localizedRecurrence } from "../i18n/recurrence";
import { brandBleed } from "../lib/brand";
import { useAppData } from "../state/app-state";
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
  item: PaymentItem;
  onPress: () => void;
  onMarkPaid: () => void;
  onDelete: () => void;
}

export function SubscriptionRow({ item, onPress, onMarkPaid, onDelete }: Props) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { categories, accounts } = useAppData();
  const category = categories.find((c) => c.id === item.categoryId);
  const account = accounts.find((a) => a.id === item.accountId);

  // Resolved brand color: the item's own, else the bank's, never mono.
  const accent = brandBleed(item, colors.accent);

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
    tagColor = isManual ? colors.tones.warning : colors.tones.info;
    showMarkPaid = canMark;
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
      (next ? ` · ${t("row.next", { date: formatCalendarDate(next.dueDate) })}` : "");
    amount = formatMoney(next ? next.amount : s.totalAmount);
    showMarkPaid = canMark;
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
    showMarkPaid = false;
  }

  // A finished item: greyed, labelled, no action.
  if (complete) {
    tag = recurring ? t("row.ended") : t("row.doneTag");
    tagColor = colors.mutedText;
    showMarkPaid = false;
  }

  // Swipe left (the mail idiom) or long-press: both land on the same
  // confirm. The swipeable closes first so the row isn't left hanging open
  // behind the alert.
  const swipeRef = useRef<SwipeableMethods>(null);
  const confirmDelete = () => {
    swipeRef.current?.close();
    Alert.alert(t("row.deleteTitle"), t("row.deleteAsk", { name: item.name }), [
      { text: t("common.cancel"), style: "cancel" },
      { text: t("common.delete"), style: "destructive", onPress: onDelete },
    ]);
  };

  return (
    <ReanimatedSwipeable
      ref={swipeRef}
      friction={2}
      rightThreshold={36}
      overshootRight={false}
      renderRightActions={() => (
        <Pressable
          style={styles.deleteAction}
          onPress={confirmDelete}
          accessibilityLabel={t("common.delete")}
        >
          <SymbolView name="trash.fill" size={20} tintColor="#FFFFFF" />
        </Pressable>
      )}
    >
      <Pressable
        onPress={onPress}
        onLongPress={confirmDelete}
        style={({ pressed }) => [
          styles.row,
          (complete || item.status === "paused") && styles.rowComplete,
          pressed && styles.rowPressed,
        ]}
      >
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
          {showMarkPaid && <Button size="sm" label={t("common.markPaid")} onPress={onMarkPaid} />}
        </View>
      </Pressable>
    </ReanimatedSwipeable>
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
      padding: spacing.md,
      gap: spacing.md,
      overflow: "hidden",
    },
    rowComplete: {
      opacity: emphasis.dim,
    },
    rowPressed: { transform: [{ scale: 0.98 }], opacity: 0.9 },
    // The revealed swipe action: a rounded danger block matching row height.
    deleteAction: {
      width: 72,
      marginLeft: spacing.sm,
      borderRadius: radius.lg,
      backgroundColor: colors.tones.danger,
      alignItems: "center",
      justifyContent: "center",
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
