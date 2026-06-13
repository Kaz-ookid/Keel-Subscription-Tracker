// Read-only detail view of a payment item. Tapping a card lands here — a
// frozen, clean rendering of everything the cards don't show — and editing is
// an explicit step (the Edit header action opens the form), so checking a
// detail can never accidentally change one.

import {
  canMarkPaid,
  COVERED_INSTALLMENT_STATUSES,
  formatCalendarDate,
  formatMoney,
  formatMoneyList,
  isInstallmentSchedule,
  isPaymentItemComplete,
  isRecurringSchedule,
  summarizeInstallmentPlan,
  sumByCurrency,
  today,
} from "@keel/core";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { SymbolView } from "expo-symbols";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { BrandBadge } from "../src/components/BrandBadge";
import { localizedRecurrence } from "../src/i18n/recurrence";
import { useAppState } from "../src/state/app-state";
import { radius, spacing, tones, typography, useTheme, type ThemeColors } from "../src/theme";

function InfoRow({ label, value, styles }: { label: string; value: string; styles: Styles }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue} numberOfLines={2}>
        {value}
      </Text>
    </View>
  );
}

export default function ItemScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { colors } = useTheme();
  const { t } = useTranslation();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const {
    items,
    occurrences,
    accounts,
    categories,
    markPaid,
    skipPayment,
    undoPaid,
    markInstallmentPaid,
    undoInstallmentPaid,
    pauseSubscription,
    resumeSubscription,
    removeSubscription,
  } = useAppState();

  const item = items.find((i) => i.id === id);
  if (!item) {
    return (
      <View style={styles.center}>
        <Text style={styles.emptyHint}>{t("item.missing")}</Text>
      </View>
    );
  }

  const asOf = today();
  const complete = isPaymentItemComplete(item, asOf);
  const account = accounts.find((a) => a.id === item.accountId);
  const category = categories.find((c) => c.id === item.categoryId);
  const recurring = isRecurringSchedule(item.schedule) ? item.schedule : undefined;
  const installment = isInstallmentSchedule(item.schedule) ? item.schedule : undefined;
  const plan = installment ? summarizeInstallmentPlan(installment) : undefined;

  // A live intro offer (not yet converted): a FREE trial vs a paid price
  // change — drives the banner + facts wording.
  const trial = recurring?.introOffer;
  const inTrial = trial !== undefined && trial.convertsOn >= asOf;
  const isFreeTrial = trial !== undefined && recurring!.amount.amount === 0;
  const trialBanner =
    trial && inTrial
      ? isFreeTrial
        ? t("item.trialBannerFree", {
            date: formatCalendarDate(trial.convertsOn),
            regular: formatMoney(trial.regularAmount),
          })
        : t("item.priceChangeBanner", {
            current: formatMoney(recurring!.amount),
            date: formatCalendarDate(trial.convertsOn),
            regular: formatMoney(trial.regularAmount),
          })
      : undefined;

  const settlementLabel = item.settlementMode === "manual" ? t("row.manual") : t("row.automatic");
  const subtitle = recurring
    ? `${localizedRecurrence(recurring.recurrence)} · ${settlementLabel}`
    : `${t("item.payIn", { count: plan?.totalCount })} · ${settlementLabel}`;

  const paused = item.status === "paused";
  // One shared rule for both payment types: current month only.
  const markable = canMarkPaid(item, asOf);
  // Already ticked for the current cycle — say so instead of hiding the button.
  const paidThisCycle =
    !markable &&
    !complete &&
    !paused &&
    (installment
      ? (plan?.paidCount ?? 0) > 0
      : item.settlementMode === "manual" &&
        recurring !== undefined &&
        recurring.nextChargeDate > recurring.firstChargeDate);
  const nextAfterCycle = installment ? plan?.nextDue?.dueDate : recurring?.nextChargeDate;
  // The item's own ledger, newest first — the undoable trail.
  const history = occurrences
    .filter((o) => o.paymentItemId === item.id)
    .sort((a, b) => (a.dueDate < b.dueDate ? 1 : -1));
  // Lifetime cost: what this commitment has actually taken so far.
  const paidToDate = sumByCurrency(
    installment && plan
      ? [plan.paidAmount]
      : history.filter((o) => o.status === "charged").map((o) => o.amount),
  ).filter((m) => m.amount > 0);

  const confirmDelete = () =>
    Alert.alert(t("row.deleteTitle"), t("row.deleteAskPermanent", { name: item.name }), [
      { text: t("common.cancel"), style: "cancel" },
      {
        text: t("common.delete"),
        style: "destructive",
        onPress: () => {
          removeSubscription(item.id);
          router.back();
        },
      },
    ]);

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Stack.Screen
        options={{
          title: t("titles.details"),
          headerRight: () => (
            <Pressable
              onPress={() => router.push({ pathname: "/add", params: { id: item.id } })}
              hitSlop={12}
            >
              <Text style={styles.headerAction}>{t("common.edit")}</Text>
            </Pressable>
          ),
        }}
      />

      {/* Identity */}
      <View style={styles.identity}>
        <BrandBadge
          domain={item.domain}
          icon={category?.icon}
          fallback={item.name.charAt(0).toUpperCase()}
          color={item.color ?? colors.accent}
          size={64}
        />
        <Text style={styles.name}>{item.name}</Text>
        <Text style={styles.subtitle}>{subtitle}</Text>
        {complete && (
          <Text style={[styles.subtitle, { color: tones.success }]}>
            {recurring ? t("row.ended") : t("item.fullyPaid")}
          </Text>
        )}
        {paused && (
          <Text style={[styles.subtitle, { color: tones.warning }]}>{t("row.paused")}</Text>
        )}
        {trialBanner && <Text style={[styles.subtitle, styles.trialBanner]}>{trialBanner}</Text>}
      </View>

      {/* Facts */}
      <View style={styles.card}>
        {recurring && (
          <>
            <InfoRow
              label={t("item.amount")}
              value={formatMoney(recurring.amount)}
              styles={styles}
            />
            {trial && inTrial && (
              <>
                <InfoRow
                  label={isFreeTrial ? t("item.regularPrice") : t("item.newPrice")}
                  value={formatMoney(trial.regularAmount)}
                  styles={styles}
                />
                <InfoRow
                  label={isFreeTrial ? t("item.convertsOn") : t("item.changesOn")}
                  value={formatCalendarDate(trial.convertsOn)}
                  styles={styles}
                />
              </>
            )}
            <InfoRow
              label={t("item.cycle")}
              value={localizedRecurrence(recurring.recurrence)}
              styles={styles}
            />
            <InfoRow
              label={t("add.firstBilling")}
              value={formatCalendarDate(recurring.firstChargeDate)}
              styles={styles}
            />
            {!complete && (
              <InfoRow
                label={t("item.nextBilling")}
                value={formatCalendarDate(recurring.nextChargeDate)}
                styles={styles}
              />
            )}
            <InfoRow
              label={t("add.lastBilling")}
              value={recurring.endDate ? formatCalendarDate(recurring.endDate) : t("common.never")}
              styles={styles}
            />
          </>
        )}
        {plan && installment && (
          <>
            <InfoRow label={t("add.total")} value={formatMoney(plan.totalAmount)} styles={styles} />
            <InfoRow
              label={t("item.progress")}
              value={t("item.progressValue", {
                paid: plan.paidCount,
                total: plan.totalCount,
                left: formatMoney(plan.remainingAmount),
              })}
              styles={styles}
            />
            <InfoRow
              label={t("item.cycle")}
              value={localizedRecurrence(installment.recurrence)}
              styles={styles}
            />
            {installment.provider && (
              <InfoRow label={t("add.provider")} value={installment.provider} styles={styles} />
            )}
          </>
        )}
        {paidToDate.length > 0 && (
          <InfoRow
            label={t("item.paidToDate")}
            value={formatMoneyList(paidToDate)}
            styles={styles}
          />
        )}
        <InfoRow
          label={t("add.account")}
          value={account?.name ?? t("common.none")}
          styles={styles}
        />
        <InfoRow
          label={t("add.category")}
          value={
            category
              ? t(`categories.${category.id}`, { defaultValue: category.name })
              : t("common.none")
          }
          styles={styles}
        />
        <InfoRow
          label={t("add.reminder")}
          value={
            item.reminder
              ? t("add.reminderDayBefore", { count: item.reminder.daysBefore })
              : t("common.never")
          }
          styles={styles}
        />
        {item.notes ? (
          <InfoRow label={t("add.description")} value={item.notes} styles={styles} />
        ) : null}
      </View>

      {/* The explicit list is the point of Pay-in-X — show every payment. */}
      {installment && plan && (
        <View style={styles.card}>
          <View style={styles.cardTitleRow}>
            <Text style={styles.cardTitle}>{t("item.payments")}</Text>
            {plan.paidCount > 0 && (
              <Pressable
                onPress={() => undoInstallmentPaid(item.id)}
                style={styles.undoButton}
                hitSlop={6}
              >
                <Text style={styles.undoText}>{t("common.undoLast")}</Text>
              </Pressable>
            )}
          </View>
          {installment.installments.map((inst) => {
            const covered = COVERED_INSTALLMENT_STATUSES.includes(inst.status);
            const late = !covered && inst.dueDate < asOf;
            return (
              <View key={inst.id} style={styles.infoRow}>
                <Text style={styles.infoLabel}>
                  #{inst.index} · {formatCalendarDate(inst.dueDate)}
                </Text>
                <View style={styles.installmentRight}>
                  <Text style={styles.infoValue}>{formatMoney(inst.amount)}</Text>
                  <SymbolView
                    name={
                      covered ? "checkmark.circle.fill" : late ? "exclamationmark.circle" : "clock"
                    }
                    size={16}
                    tintColor={covered ? tones.success : late ? tones.warning : colors.mutedText}
                  />
                </View>
              </View>
            );
          })}
        </View>
      )}

      {/* The recurring counterpart of the installments list: what was paid or
          skipped, newest first — and the place to undo a mistaken tick. */}
      {recurring && history.length > 0 && (
        <View style={styles.card}>
          <View style={styles.cardTitleRow}>
            <Text style={styles.cardTitle}>{t("item.history")}</Text>
            {item.settlementMode === "manual" && (
              <Pressable onPress={() => undoPaid(item.id)} style={styles.undoButton} hitSlop={6}>
                <Text style={styles.undoText}>{t("common.undoLast")}</Text>
              </Pressable>
            )}
          </View>
          {history.map((o) => (
            <View key={o.id} style={styles.infoRow}>
              <Text style={styles.infoLabel}>{formatCalendarDate(o.dueDate)}</Text>
              <View style={styles.installmentRight}>
                <Text
                  style={[
                    styles.infoValue,
                    o.status === "skipped" && {
                      color: colors.mutedText,
                      textDecorationLine: "line-through",
                    },
                  ]}
                >
                  {formatMoney(o.amount)}
                </Text>
                <SymbolView
                  name={o.status === "skipped" ? "arrow.right.to.line" : "checkmark.circle.fill"}
                  size={16}
                  tintColor={o.status === "skipped" ? colors.mutedText : tones.success}
                />
              </View>
            </View>
          ))}
        </View>
      )}

      {/* Price changes over time (edge case #1) — only when there were any. */}
      {recurring && recurring.priceHistory.length > 1 && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>{t("item.priceHistory")}</Text>
          {recurring.priceHistory.map((entry, i) => (
            <InfoRow
              key={`${entry.effectiveFrom}-${i}`}
              label={t("item.since", { date: formatCalendarDate(entry.effectiveFrom) })}
              value={formatMoney(entry.amount)}
              styles={styles}
            />
          ))}
        </View>
      )}

      {markable && (
        <Pressable
          style={styles.primaryBtn}
          onPress={() => (installment ? markInstallmentPaid(item.id) : markPaid(item.id))}
        >
          <Text style={styles.primaryBtnText}>{t("common.markPaid")}</Text>
        </Pressable>
      )}
      {/* Flexible commitments ("monthly investing") can sit a cycle out —
          skipped, not paid: the month stays honest in the analytics. */}
      {markable && recurring && (
        <Pressable style={styles.secondaryBtn} onPress={() => skipPayment(item.id)}>
          <Text style={styles.secondaryBtnText}>
            {t("item.skipCycle", { date: formatCalendarDate(recurring.nextChargeDate) })}
          </Text>
        </Pressable>
      )}
      {paidThisCycle && (
        <View style={styles.disabledBtn}>
          <Text style={styles.disabledBtnText}>
            {t("item.paidForCycle")}
            {nextAfterCycle
              ? t("item.nextAfter", { date: formatCalendarDate(nextAfterCycle) })
              : ""}
          </Text>
        </View>
      )}

      {!complete && (
        <Pressable
          style={styles.secondaryBtn}
          onPress={() => (paused ? resumeSubscription(item.id) : pauseSubscription(item.id))}
        >
          <Text style={styles.secondaryBtnText}>{paused ? t("item.resume") : t("item.pause")}</Text>
        </Pressable>
      )}

      <Pressable style={styles.deleteRow} onPress={confirmDelete}>
        <Text style={styles.deleteText}>{t("common.delete")}</Text>
      </Pressable>
    </ScrollView>
  );
}

type Styles = ReturnType<typeof createStyles>;

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.background },
    content: { padding: spacing.md, paddingBottom: spacing.xl, gap: spacing.md },
    center: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.background,
    },
    emptyHint: { ...typography.body, color: colors.mutedText },
    headerAction: { ...typography.label, color: colors.white, paddingHorizontal: spacing.sm },
    identity: {
      alignItems: "center",
      gap: spacing.xs,
      paddingVertical: spacing.sm,
    },
    name: { ...typography.title, fontSize: 24, color: colors.text },
    subtitle: { ...typography.caption, color: colors.mutedText },
    trialBanner: { color: colors.accent, fontWeight: "600" },
    card: {
      backgroundColor: colors.surface,
      borderRadius: radius.md,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.xs,
    },
    cardTitle: {
      ...typography.label,
      color: colors.text,
    },
    cardTitleRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingTop: spacing.sm,
    },
    // A real button — pale accent TEXT alone read as disabled grey.
    undoButton: {
      paddingVertical: spacing.xs,
      paddingHorizontal: spacing.sm,
      borderRadius: radius.sm,
      backgroundColor: colors.accent,
    },
    undoText: {
      ...typography.caption,
      color: colors.navy,
      fontWeight: "700",
    },
    infoRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: spacing.md,
      paddingVertical: spacing.sm + 2,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    infoLabel: { ...typography.body, color: colors.mutedText },
    infoValue: { ...typography.body, color: colors.text, flexShrink: 1, textAlign: "right" },
    installmentRight: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
    },
    primaryBtn: {
      backgroundColor: colors.navy,
      borderRadius: radius.md,
      paddingVertical: spacing.md,
      alignItems: "center",
    },
    primaryBtnText: { ...typography.label, color: colors.white },
    disabledBtn: {
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.md,
      paddingVertical: spacing.md,
      alignItems: "center",
    },
    disabledBtnText: { ...typography.label, color: colors.mutedText },
    secondaryBtn: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.md,
      paddingVertical: spacing.md,
      alignItems: "center",
    },
    secondaryBtnText: { ...typography.label, color: colors.text },
    deleteRow: { alignItems: "center", paddingVertical: spacing.sm },
    deleteText: { ...typography.label, color: tones.danger },
  });
}
