// Read-only detail view of a payment item. Tapping a card lands here — a
// frozen, clean rendering of everything the cards don't show — and editing is
// an explicit step (the Edit header action opens the form), so checking a
// detail can never accidentally change one. Top to bottom: who it is, the
// amount with the actions on its next payment, the actions on the
// subscription itself (pause, cancel), then history and facts to read.

import DateTimePicker from "@react-native-community/datetimepicker";
import {
  canCancel,
  cancelDeadline,
  canMarkPaid,
  COVERED_INSTALLMENT_STATUSES,
  formatCalendarDate,
  formatMoney,
  formatMoneyList,
  isCurrentCyclePaid,
  isInstallmentSchedule,
  isPaymentItemComplete,
  isRecurringSchedule,
  lastChargeOptions,
  reminderRules,
  shiftOffWeekend,
  summarizeInstallmentPlan,
  sumByCurrency,
  today,
} from "@keel/core";
import { LinearGradient } from "expo-linear-gradient";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { SymbolView } from "expo-symbols";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import Animated from "react-native-reanimated";

import { BrandBadge } from "../src/components/BrandBadge";
import { SettingsRow } from "../src/components/settings/SettingsRow";
import { WheelSheet } from "../src/components/WheelSheet";
import { Button } from "../src/components/ui/Button";
import { Card } from "../src/components/ui/Card";
import { brandBleed } from "../src/lib/brand";
import { useBrandTints } from "../src/lib/dominant-color";
import { formatHour, fromCalendarDate, toCalendarDate } from "../src/lib/dates";
import { localizedRecurrence } from "../src/i18n/recurrence";
import { hapticMarkPaid } from "../src/lib/haptics";
import { foldIn, foldLayout, foldOut } from "../src/lib/motion";
import { showNativeActionSheet } from "../src/lib/native-sheet";
import { useRatingPrompt } from "../src/lib/rating";
import { useAppActions, useAppData } from "../src/state/app-state";
import {
  spacing,
  type ThemeColors,
  typography,
  useStyles,
  useTheme,
  withAlpha,
} from "../src/theme";

import { useLockGuard } from "../src/lib/lock-gate";

// iOS light-tier hexes, like every icon-chip list (see ui/IconChip).
const CHIP = { pause: "#5E5CE6", resume: "#34C759", cancel: "#FF9500" } as const;

function InfoRow({
  label,
  value,
  styles,
  first,
  onPress,
}: {
  label: string;
  value: string;
  styles: Styles;
  /** Makes the row a button (the value takes the accent colour). */
  onPress?: () => void;
  /** The card's first row carries no divider (dividers sit on TOP, so lists
   *  never end on a stray line). */
  first?: boolean;
}) {
  return (
    <Pressable
      style={[styles.infoRow, first && styles.infoRowFirst]}
      onPress={onPress}
      disabled={!onPress}
    >
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={[styles.infoValue, onPress && styles.infoValueAction]} numberOfLines={2}>
        {value}
      </Text>
    </Pressable>
  );
}

export default function ItemScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { colors, scheme } = useTheme();
  const { t } = useTranslation();
  const styles = useStyles(createStyles);
  const [cancelByOpen, setCancelByOpen] = useState(false);
  // Closed by default: the trail is for looking back, not for every visit.
  // Held per item: this one screen instance serves every item in turn.
  const [historyOpenFor, setHistoryOpenFor] = useState<string | null>(null);
  const historyOpen = id !== undefined && historyOpenFor === id;
  // Repaint when a logo's extracted tint lands (dev builds).
  useBrandTints();
  const { items, occurrences, accounts, categories } = useAppData();
  const {
    markPaid,
    skipPayment,
    undoPaid,
    markInstallmentPaid,
    undoInstallmentPaid,
    pauseSubscription,
    resumeSubscription,
    removeSubscription,
    planCancel,
    keepSubscription,
    confirmCancel,
  } = useAppActions();
  // Editing, deleting, skipping and pausing are WRITES (locked blocks
  // them); mark paid and undo stay free so the data keeps its honesty.
  const guard = useLockGuard();
  const askRating = useRatingPrompt();

  const item = items.find((i) => i.id === id);
  if (!item) {
    return (
      <View style={styles.center}>
        <Text style={styles.emptyHint}>{t("item.missing")}</Text>
      </View>
    );
  }

  const asOf = today();
  const complete = isPaymentItemComplete(item);
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
  // Already ticked for the current cycle: say so where the buttons were.
  // Read from the ledger (the core's rule): the dates alone also move when
  // a pause ends, and that pays nothing.
  const paidThisCycle = !markable && isCurrentCyclePaid(item, occurrences);
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
  // The closed history row: how many payments, and what they add up to.
  const historySummary = [
    t("byAccount.payments", { count: history.filter((o) => o.status === "charged").length }),
    ...(paidToDate.length > 0 ? [formatMoneyList(paidToDate)] : []),
  ].join(" · ");

  // Cancelling: a plan ("remind me") and its confirmation ("I've cancelled
  // it"). Keel never cancels anything itself; the sheets say so.
  const cancellable = canCancel(item);
  const cancelPlan = cancellable ? item.cancelPlan : undefined;
  const cancelBy = cancelPlan ? cancelDeadline(item) : undefined;
  const cancelPassed = cancelBy !== undefined && cancelBy < asOf;

  // One explicit tap per outcome, no wheel to dismiss by accident.
  const askLastPayment = () => {
    const dates = lastChargeOptions(item);
    showNativeActionSheet(
      {
        title: t("cancel.lastPaymentTitle"),
        message: t("cancel.lastPaymentNote"),
        options: [
          t("cancel.nothingMore"),
          ...dates.map((date) => t("cancel.lastPaymentOn", { date: formatCalendarDate(date) })),
          t("common.close"),
        ],
        cancelButtonIndex: dates.length + 1,
      },
      (index) => {
        if (index === 0) confirmCancel(item.id);
        else if (index <= dates.length) confirmCancel(item.id, dates[index - 1]);
      },
    );
  };

  const askCancel = () =>
    showNativeActionSheet(
      {
        title: item.name,
        message: t("cancel.sheetNote"),
        options: [t("cancel.remindMe"), t("cancel.done"), t("common.close")],
        cancelButtonIndex: 2,
      },
      (index) => {
        if (index === 0) planCancel(item.id);
        else if (index === 1) askLastPayment();
      },
    );

  const askCancelBy = () => {
    if (!recurring) return;
    showNativeActionSheet(
      {
        title: t("cancel.cancelBy"),
        options: [
          t("cancel.beforeNextCharge", { date: formatCalendarDate(recurring.nextChargeDate) }),
          t("cancel.chooseDate"),
          t("common.close"),
        ],
        cancelButtonIndex: 2,
      },
      (index) => {
        if (index === 0) planCancel(item.id);
        else if (index === 1) setCancelByOpen(true);
      },
    );
  };

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
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      contentInsetAdjustmentBehavior="automatic"
    >
      <Stack.Screen
        options={{
          title: "",
        }}
      />
      {/* A word, not a symbol: Apple's own exception for Edit. */}
      <Stack.Toolbar placement="right">
        <Stack.Toolbar.Button
          onPress={guard(() => router.push({ pathname: "/add/form", params: { id: item.id } }))}
        >
          {t("common.edit")}
        </Stack.Toolbar.Button>
      </Stack.Toolbar>

      {/* Identity, under the brand's own glow (§9c): the item's color
          lights the top of its screen like Subo's Netflix red. */}
      <View style={styles.identity}>
        <LinearGradient
          // Fades in AND out: a hard top edge read as a seam when clipped.
          colors={["transparent", withAlpha(brandBleed(item, colors.accent), 0.26), "transparent"]}
          locations={[0, 0.35, 1]}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={styles.identityGlow}
          pointerEvents="none"
        />
        <BrandBadge
          domain={item.domain}
          icon={item.icon ?? category?.icon}
          fallback={item.name.charAt(0).toUpperCase()}
          color={brandBleed(item, colors.accent)}
          size={64}
        />
        <Text style={styles.name}>{item.name}</Text>
        <Text style={styles.subtitle}>{subtitle}</Text>
        {complete && (
          <Text style={[styles.subtitle, { color: colors.tones.success }]}>
            {recurring ? t("row.ended") : t("item.fullyPaid")}
          </Text>
        )}
        {paused && (
          <Text style={[styles.subtitle, { color: colors.tones.warning }]}>{t("row.paused")}</Text>
        )}
        {trialBanner && <Text style={[styles.subtitle, styles.trialBanner]}>{trialBanner}</Text>}
        {cancelPlan && cancelBy && (
          <Text style={[styles.subtitle, { color: colors.tones.warning }]}>
            {cancelPassed
              ? t("cancel.statusPassed")
              : t("cancel.status", { date: formatCalendarDate(cancelBy) })}
          </Text>
        )}
      </View>

      {/* HERO: the few numbers that matter, shown instead of listed. The
          long facts table moved to the Details card at the bottom
          (2026-09-08 retex: "a long table of informations"). */}
      {recurring && (
        <Card>
          <View style={styles.heroTop}>
            <Text style={styles.heroAmount}>{formatMoney(recurring.amount)}</Text>
            <Text style={styles.heroCaption}>{localizedRecurrence(recurring.recurrence)}</Text>
          </View>
          {trial && inTrial && (
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>
                {isFreeTrial ? t("item.regularPrice") : t("item.newPrice")}
              </Text>
              <Text style={styles.infoValue}>
                {formatMoney(trial.regularAmount)} · {formatCalendarDate(trial.convertsOn)}
              </Text>
            </View>
          )}
          {!complete && !paused && (
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>{t("item.nextBilling")}</Text>
              <Text style={styles.heroNext}>
                {formatCalendarDate(shiftOffWeekend(recurring.nextChargeDate, item.weekendShift))}
              </Text>
            </View>
          )}
          {/* The next payment's actions sit under its date. Skipping is for
              flexible commitments ("monthly investing"): the cycle is logged
              as skipped, not paid, so the analytics stay honest. */}
          {markable && (
            <View style={styles.actionRow}>
              <Button
                style={styles.actionMain}
                label={t("common.markPaid")}
                onPress={() => {
                  hapticMarkPaid();
                  markPaid(item.id);
                  askRating();
                }}
              />
              <Button
                style={styles.actionSide}
                variant="secondary"
                label={t("item.skip")}
                accessibilityLabel={t("item.skipCycle", {
                  date: formatCalendarDate(recurring.nextChargeDate),
                })}
                onPress={guard(() => skipPayment(item.id))}
              />
            </View>
          )}
          {/* Already ticked: say so where the buttons were, with the way
              back from a mistaken tap right beside it. */}
          {paidThisCycle && (
            <View style={styles.infoRow}>
              <View style={styles.paidLine}>
                <SymbolView
                  name="checkmark.circle.fill"
                  size={16}
                  tintColor={colors.tones.success}
                />
                <Text style={[styles.infoLabel, styles.paidText]} numberOfLines={2}>
                  {t("item.paidForCycle")}
                </Text>
              </View>
              <Button
                size="sm"
                label={t("common.undo")}
                accessibilityLabel={t("common.undoLast")}
                onPress={() => {
                  hapticMarkPaid();
                  undoPaid(item.id);
                }}
              />
            </View>
          )}
        </Card>
      )}
      {plan && installment && (
        <Card>
          <View style={styles.heroTop}>
            <Text style={styles.heroLabel}>{t("add.total")}</Text>
            <Text style={styles.heroAmount}>{formatMoney(plan.totalAmount)}</Text>
            {/* The trackbar: paid share of the total, by amount. */}
            <View style={styles.progressTrack}>
              <View
                style={[
                  styles.progressFill,
                  {
                    width: `${Math.min(100, Math.round((plan.paidAmount.amount / Math.max(1, plan.totalAmount.amount)) * 100))}%`,
                  },
                ]}
              />
            </View>
            <Text style={styles.heroCaption}>
              {t("item.progressValue", {
                paid: plan.paidCount,
                total: plan.totalCount,
                left: formatMoney(plan.remainingAmount),
              })}
            </Text>
          </View>
          {plan.nextDue && (
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>{t("item.nextInstallment")}</Text>
              <Text style={styles.heroNext}>
                {formatCalendarDate(plan.nextDue.dueDate)} · {formatMoney(plan.nextDue.amount)}
              </Text>
            </View>
          )}
        </Card>
      )}

      {/* The payments, straight after the hero and HANDS-ON: installments
          settle in order, so the first open row takes the tap that marks it
          paid and the most recent tick takes the tap that undoes it. No
          global Mark-paid button for splits (2026-09-08 retex). */}
      {installment && plan && (
        <Card>
          <View style={styles.cardTitleRow}>
            <Text style={styles.cardTitle}>{t("item.payments")}</Text>
          </View>
          {installment.installments.map((inst, idx) => {
            const covered = COVERED_INSTALLMENT_STATUSES.includes(inst.status);
            const late = !covered && inst.dueDate < asOf;
            const isNextOpen =
              idx ===
              installment.installments.findIndex(
                (i) => !COVERED_INSTALLMENT_STATUSES.includes(i.status),
              );
            const lastCovered = installment.installments.reduce(
              (acc, i, j) => (COVERED_INSTALLMENT_STATUSES.includes(i.status) ? j : acc),
              -1,
            );
            const tappable = isNextOpen || idx === lastCovered;
            const onTap = () => {
              hapticMarkPaid();
              if (isNextOpen) {
                markInstallmentPaid(item.id);
                askRating();
              } else undoInstallmentPaid(item.id);
            };
            return (
              <Pressable
                key={inst.id}
                style={styles.infoRow}
                disabled={!tappable}
                onPress={onTap}
                accessibilityLabel={
                  isNextOpen
                    ? t("common.markPaid")
                    : idx === lastCovered
                      ? t("common.undoLast")
                      : undefined
                }
              >
                <Text style={styles.infoLabel}>
                  #{inst.index} · {formatCalendarDate(inst.dueDate)}
                </Text>
                <View style={styles.installmentRight}>
                  <Text style={styles.infoValue}>{formatMoney(inst.amount)}</Text>
                  <SymbolView
                    name={
                      covered
                        ? "checkmark.circle.fill"
                        : isNextOpen
                          ? "circle"
                          : late
                            ? "exclamationmark.circle"
                            : "clock"
                    }
                    size={isNextOpen || covered ? 20 : 16}
                    tintColor={
                      covered
                        ? colors.tones.success
                        : isNextOpen
                          ? late
                            ? colors.tones.warning
                            : colors.accent
                          : late
                            ? colors.tones.warning
                            : colors.mutedText
                    }
                  />
                </View>
              </Pressable>
            );
          })}
          <Text style={styles.tapHint}>{t("item.tapHint")}</Text>
        </Card>
      )}

      {/* What changes the subscription itself, right under its amount. Splits
          have none of this: pausing an installment plan means nothing (the
          money is owed either way). */}
      {cancelPlan && cancelBy && (
        <Card>
          <InfoRow
            first
            label={t("cancel.cancelBy")}
            value={formatCalendarDate(cancelBy)}
            styles={styles}
            onPress={guard(askCancelBy)}
          />
          <View style={styles.actionRow}>
            <Button
              style={styles.actionHalf}
              label={t("cancel.done")}
              onPress={guard(askLastPayment)}
            />
            <Button
              style={styles.actionHalf}
              variant="secondary"
              label={t("cancel.keep")}
              onPress={guard(() => keepSubscription(item.id))}
            />
          </View>
        </Card>
      )}
      {!complete && recurring && (
        <Card>
          {/* Rows with a sentence each, not bare buttons: "Pause" and
              "Cancel" alone told a new user nothing, and "Cancel" scared
              (retex 2026-11-15). */}
          <SettingsRow
            icon={paused ? "play.fill" : "pause.fill"}
            chipColor={paused ? CHIP.resume : CHIP.pause}
            label={paused ? t("item.resume") : t("item.pause")}
            hint={paused ? t("item.resumeHint") : t("item.pauseHint")}
            onPress={guard(() =>
              paused ? resumeSubscription(item.id) : pauseSubscription(item.id),
            )}
          />
          {cancellable && !cancelPlan && (
            <SettingsRow
              divider
              icon="xmark"
              chipColor={CHIP.cancel}
              label={t("cancel.start")}
              hint={t("cancel.startHint")}
              onPress={guard(askCancel)}
            />
          )}
        </Card>
      )}

      {/* The recurring counterpart of the installments list: what was paid or
          skipped, newest first, and the place to undo a mistaken tick. One
          closed row until asked for: the count and the total are the answer
          most visits want. */}
      {recurring && history.length > 0 && (
        <Animated.View layout={foldLayout}>
          <Card>
            <Pressable
              style={styles.cardTitleRow}
              onPress={() => setHistoryOpenFor(historyOpen ? null : item.id)}
              accessibilityRole="button"
              accessibilityState={{ expanded: historyOpen }}
            >
              <Text style={styles.cardTitle}>{t("item.history")}</Text>
              <View style={styles.historyRight}>
                <Text style={styles.historySummary} numberOfLines={1}>
                  {historySummary}
                </Text>
                <SymbolView
                  name={historyOpen ? "chevron.up" : "chevron.down"}
                  size={11}
                  tintColor={colors.mutedText}
                />
              </View>
            </Pressable>
            {historyOpen && (
              <Animated.View entering={foldIn} exiting={foldOut}>
                {/* Undoing an older tick; this cycle's is on the amount card. */}
                {item.settlementMode === "manual" && !paidThisCycle && (
                  <View style={[styles.infoRow, styles.undoRow]}>
                    <Button
                      size="sm"
                      label={t("common.undoLast")}
                      onPress={() => {
                        hapticMarkPaid();
                        undoPaid(item.id);
                      }}
                    />
                  </View>
                )}
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
                        name={
                          o.status === "skipped" ? "arrow.right.to.line" : "checkmark.circle.fill"
                        }
                        size={16}
                        tintColor={o.status === "skipped" ? colors.mutedText : colors.tones.success}
                      />
                    </View>
                  </View>
                ))}
              </Animated.View>
            )}
          </Card>
        </Animated.View>
      )}

      {/* Everything under the history slides with its fold. */}
      <Animated.View layout={foldLayout} style={styles.below}>
        {/* Price changes over time (edge case #1) — only when there were any. */}
        {recurring && recurring.priceHistory.length > 1 && (
          <Card>
            <Text style={styles.cardTitle}>{t("item.priceHistory")}</Text>
            {recurring.priceHistory.map((entry, i) => (
              <InfoRow
                key={`${entry.effectiveFrom}-${i}`}
                label={t("item.since", { date: formatCalendarDate(entry.effectiveFrom) })}
                value={formatMoney(entry.amount)}
                styles={styles}
              />
            ))}
          </Card>
        )}

        {/* The rest of the facts, out of the way at the bottom. */}
        <Card>
          <View style={styles.cardTitleRow}>
            <Text style={styles.cardTitle}>{t("item.details")}</Text>
          </View>
          {recurring && (
            <>
              <InfoRow
                label={t("add.firstBilling")}
                value={formatCalendarDate(recurring.firstChargeDate)}
                styles={styles}
              />
              <InfoRow
                label={t("add.lastBilling")}
                value={
                  recurring.endDate ? formatCalendarDate(recurring.endDate) : t("common.never")
                }
                styles={styles}
              />
            </>
          )}
          {installment && (
            <>
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
          {/* A subscription's total is on its History row. */}
          {installment && paidToDate.length > 0 && (
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
              reminderRules(item).length > 0
                ? reminderRules(item)
                    .map(
                      (rule) =>
                        t("add.reminderDayBefore", { count: rule.daysBefore }) +
                        (rule.repeat !== undefined
                          ? ` (${t(rule.repeat === "daily" ? "add.repeatDaily" : "add.repeatWeekly").toLowerCase()})`
                          : "") +
                        (rule.hour !== undefined ? ` · ${formatHour(rule.hour)}` : ""),
                    )
                    .join(", ")
                : t("common.never")
            }
            styles={styles}
          />
          {item.notes ? (
            <InfoRow label={t("add.description")} value={item.notes} styles={styles} />
          ) : null}
        </Card>

        <Button variant="destructive" label={t("common.delete")} onPress={guard(confirmDelete)} />
      </Animated.View>

      {/* The cancel-by date, for a notice period: any day from today. */}
      <WheelSheet
        visible={cancelByOpen}
        title={t("cancel.cancelBy")}
        onClose={() => setCancelByOpen(false)}
      >
        <DateTimePicker
          value={fromCalendarDate(cancelBy && cancelBy >= asOf ? cancelBy : asOf)}
          minimumDate={fromCalendarDate(asOf)}
          mode="date"
          display="spinner"
          themeVariant={scheme}
          textColor={colors.text}
          style={styles.dateWheel}
          onChange={(_, picked) => {
            if (picked) planCancel(item.id, toCalendarDate(picked));
          }}
        />
      </WheelSheet>
    </ScrollView>
  );
}

type Styles = ReturnType<typeof createStyles>;

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: "transparent" },
    content: { padding: spacing.md, paddingBottom: spacing.xl, gap: spacing.md },
    center: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: "transparent",
    },
    emptyHint: { ...typography.body, color: colors.mutedText },
    // Accent like every header action (accounts, form) — white was invisible
    // over the light Ambient with the transparent header.
    identity: {
      alignItems: "center",
      gap: spacing.xs,
      paddingVertical: spacing.sm,
    },
    // Wider and taller than the identity block: a soft halo, not a box.
    identityGlow: {
      position: "absolute",
      top: -30,
      left: -60,
      right: -60,
      height: 230,
    },
    name: { ...typography.h1, color: colors.text },
    subtitle: { ...typography.caption, color: colors.mutedText },
    trialBanner: { color: colors.accent, fontWeight: "600" },
    cardTitle: {
      ...typography.label,
      color: colors.text,
    },
    cardTitleRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      // Symmetric padding so the Undo button sits centered between the card
      // edge and the first history row, not glued to the divider below.
      paddingVertical: spacing.sm,
    },
    // Dividers sit on TOP so a list never ends on a stray line; the card's
    // first row opts out via InfoRow's `first`.
    infoRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: spacing.md,
      paddingVertical: spacing.sm + 2,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
    },
    infoRowFirst: { borderTopWidth: 0 },
    infoLabel: { ...typography.body, color: colors.mutedText },
    infoValue: { ...typography.body, color: colors.text, flexShrink: 1, textAlign: "right" },
    infoValueAction: { color: colors.accent },
    // Buttons side by side inside a card, under the row they act on.
    // Equal halves, except Mark paid, which leads.
    actionRow: {
      flexDirection: "row",
      gap: spacing.sm,
      paddingTop: spacing.xs,
      paddingBottom: spacing.sm,
    },
    actionMain: { flex: 2 },
    actionSide: { flex: 1 },
    actionHalf: { flex: 1 },
    paidLine: { flex: 1, flexDirection: "row", alignItems: "center", gap: spacing.sm },
    paidText: { color: colors.tones.success, flexShrink: 1 },
    historyRight: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "flex-end",
      gap: spacing.sm,
      paddingLeft: spacing.md,
    },
    historySummary: { ...typography.caption, color: colors.mutedText, flexShrink: 1 },
    undoRow: { justifyContent: "flex-end" },
    below: { gap: spacing.md },
    // The native date wheel's own height (as in the add form).
    dateWheel: { height: 216 },
    installmentRight: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
    },
    // The hero block: one big number and its context, centered, instead of
    // the first rows of a facts table.
    heroTop: {
      alignItems: "center",
      gap: spacing.xs,
      paddingVertical: spacing.sm,
    },
    heroLabel: { ...typography.caption, color: colors.mutedText },
    heroAmount: { fontSize: 34, fontWeight: "700", color: colors.text },
    heroCaption: { ...typography.caption, color: colors.mutedText },
    heroNext: { ...typography.body, fontWeight: "600", color: colors.text },
    // The trackbar: paid share of the total.
    progressTrack: {
      alignSelf: "stretch",
      height: 6,
      borderRadius: 3,
      backgroundColor: withAlpha(colors.accent, 0.16),
      marginVertical: spacing.xs,
      overflow: "hidden",
    },
    progressFill: {
      height: "100%",
      borderRadius: 3,
      backgroundColor: colors.accent,
    },
    tapHint: {
      ...typography.caption,
      color: colors.mutedText,
      paddingTop: spacing.xs,
      paddingBottom: spacing.sm,
    },
  });
}
