import {
  DEFAULT_CATEGORIES,
  formatTotalsIn,
  isInstallmentSchedule,
  isPaymentItemComplete,
  isRecurringSchedule,
  mergeTotals,
  monthlyEquivalent,
  summarizeCommitments,
  summarizeInstallmentPlan,
  today,
  type CurrencyCode,
  type ExchangeRates,
  type Money,
  type PaymentItem,
  type SuggestedCommitment,
} from "@keel/core";
import { Picker as RNPicker } from "@react-native-picker/picker";
import { useRouter } from "expo-router";
import { SymbolView } from "expo-symbols";
import { useMemo, useState, type ComponentType, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from "react-native";

import { hapticMarkPaid } from "../../lib/haptics";
import { useAppState } from "../../state/app-state";
import {
  dockClearance,
  radius,
  spacing,
  typography,
  useTheme,
  type ThemeColors,
} from "../../theme";
import { BrandBadge } from "../BrandBadge";
import { HeroCard } from "../HeroCard";
import { SubscriptionRow } from "../SubscriptionRow";
import { Button } from "../ui/Button";
import { EmptyState } from "../ui/EmptyState";
import { WheelSheet } from "../WheelSheet";

// Same JSX-friendly cast as the Settings wheels.
const Picker = RNPicker as unknown as ComponentType<{
  selectedValue: string;
  onValueChange: (value: string) => void;
  children: ReactNode;
}> & { Item: typeof RNPicker.Item };

/** How the catalog is ordered; "day" is the stable default. */
type SortKey = "day" | "price" | "name";
const SORT_LABEL_KEY: Record<SortKey, string> = {
  day: "allList.sortDay",
  price: "allList.sortPrice",
  name: "allList.sortName",
};

/** The day of the month an item bills on — its fixed "place" in the list. */
function billingDay(item: PaymentItem): number {
  if (isRecurringSchedule(item.schedule)) return Number(item.schedule.nextChargeDate.slice(8, 10));
  if (isInstallmentSchedule(item.schedule)) {
    const s = summarizeInstallmentPlan(item.schedule);
    return Number((s.nextDue?.dueDate ?? s.finalDueDate).slice(8, 10));
  }
  return 32;
}

/** Per-month bite in display-currency terms, for the price ordering: the
 *  monthly equivalent of a subscription, the per-installment amount of a
 *  Pay-in-X plan. */
function monthlyValue(
  item: PaymentItem,
  displayCurrency: CurrencyCode,
  rates: ExchangeRates | null,
): number {
  const numeric = (value: Money): number => {
    if (value.currency === displayCurrency) return value.amount;
    if (rates) {
      const merged = mergeTotals([value], displayCurrency, rates);
      if (merged) return merged.total.amount;
    }
    return value.amount;
  };
  if (isRecurringSchedule(item.schedule)) {
    return numeric(monthlyEquivalent(item.schedule.amount, item.schedule.recurrence));
  }
  if (isInstallmentSchedule(item.schedule)) {
    const s = summarizeInstallmentPlan(item.schedule);
    if (s.nextDue) return numeric(s.nextDue.amount);
  }
  return 0;
}

/** The catalog: every item (including ended/paused ones a timeline can't show). */
export function SubscriptionsView() {
  const router = useRouter();
  const { colors } = useTheme();
  const { t } = useTranslation();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const {
    items,
    pending,
    displayCurrency,
    rates,
    loading,
    removeSubscription,
    removePendingSuggestion,
    markPaid,
    markInstallmentPaid,
  } = useAppState();
  // Open by default — the whole point of the list is to be acted on.
  const [pendingOpen, setPendingOpen] = useState(true);
  // Catalog ordering: stable billing-day by default; the control above the
  // list names the current order and opens the picker.
  const [sort, setSort] = useState<SortKey>("day");
  const [sortSheet, setSortSheet] = useState(false);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  if (items.length === 0 && pending.length === 0) {
    return (
      <View style={styles.center}>
        <EmptyState
          icon="list.bullet.rectangle"
          title={t("allList.emptyTitle")}
          hint={t("allList.emptyHint")}
          cta={{
            label: t("common.getStarted"),
            onPress: () => router.push({ pathname: "/onboarding", params: { mode: "start" } }),
          }}
        />
      </View>
    );
  }

  const fillIn = (s: SuggestedCommitment) =>
    router.push({
      pathname: "/add/form",
      params: {
        suggestionId: s.id,
        name: s.name,
        ...(s.categoryId ? { categoryId: s.categoryId } : {}),
        ...(s.color ? { color: s.color } : {}),
        ...(s.domain ? { domain: s.domain } : {}),
        unit: s.unit,
      },
    });

  const asOf = today();
  const commitments = summarizeCommitments(items, asOf);

  // Finished items always sink to the bottom; within the live ones the
  // chosen order applies. The default is the day of the month each item
  // bills on (the 5th before the 15th) — predictable and non-reshuffling,
  // where "next charge" would reorder the list all the time.
  const sorted = [...items].sort((a, b) => {
    const doneA = isPaymentItemComplete(a, asOf) ? 1 : 0;
    const doneB = isPaymentItemComplete(b, asOf) ? 1 : 0;
    if (doneA !== doneB) return doneA - doneB;
    if (sort === "price") {
      return (
        monthlyValue(b, displayCurrency, rates) - monthlyValue(a, displayCurrency, rates) ||
        a.name.localeCompare(b.name)
      );
    }
    if (sort === "name") return a.name.localeCompare(b.name);
    return billingDay(a) - billingDay(b) || a.name.localeCompare(b.name);
  });

  return (
    <FlatList
      style={styles.list}
      data={sorted}
      keyExtractor={(item) => item.id}
      contentContainerStyle={styles.listContent}
      ListHeaderComponent={
        <View style={styles.headerStack}>
          {(commitments.monthly.length > 0 || commitments.bnplOutstanding.length > 0) && (
            <HeroCard
              label={t("allList.committedMonthly")}
              amount={
                commitments.monthly.length > 0
                  ? formatTotalsIn(commitments.monthly, displayCurrency, rates)
                  : t("allList.nothingYet")
              }
              sub={
                commitments.bnplOutstanding.length > 0
                  ? t("allList.bnplOwed", {
                      amount: formatTotalsIn(commitments.bnplOutstanding, displayCurrency, rates),
                    })
                  : undefined
              }
            />
          )}
          {/* What the onboarding deck collected: each row opens the Add form
              pre-filled, the ✗ dismisses without adding. Rendered even when
              empty, so the to-do list stays discoverable and fillable. */}
          <View>
            <Pressable style={styles.pendingHeader} onPress={() => setPendingOpen((o) => !o)}>
              <View style={styles.pendingLine} />
              <Text style={styles.pendingTitle}>
                {pending.length > 0
                  ? t("allList.toComplete", { count: pending.length })
                  : t("allList.toCompleteEmpty")}
              </Text>
              <SymbolView
                name={pendingOpen ? "chevron.up" : "chevron.down"}
                size={11}
                tintColor={colors.mutedText}
              />
              <View style={styles.pendingLine} />
            </Pressable>
            {pendingOpen && (
              <View style={styles.pendingList}>
                {/* Back into the bank; todo shopping is resumable. */}
                <Pressable
                  style={[styles.browseRow, pending.length === 0 && styles.browseRowOnly]}
                  onPress={() =>
                    router.push({ pathname: "/onboarding", params: { mode: "browse" } })
                  }
                >
                  <SymbolView name="plus.circle" size={18} tintColor={colors.accent} />
                  <View style={styles.browseTexts}>
                    <Text style={styles.browseText}>
                      {pending.length > 0
                        ? t("allList.browseMore")
                        : t("allList.emptyPendingTitle")}
                    </Text>
                    {pending.length === 0 && (
                      <Text style={styles.browseHint}>{t("allList.emptyPendingHint")}</Text>
                    )}
                  </View>
                  <SymbolView name="chevron.right" size={13} tintColor={colors.mutedText} />
                </Pressable>
                {pending.map((s) => {
                  const category = DEFAULT_CATEGORIES.find((c) => c.id === s.categoryId);
                  return (
                    <View key={s.id} style={styles.pendingRow}>
                      <BrandBadge
                        domain={s.domain}
                        icon={category?.icon}
                        fallback={s.name.charAt(0).toUpperCase()}
                        color={s.color ?? colors.accent}
                        size={36}
                      />
                      <Text style={styles.pendingName} numberOfLines={1}>
                        {t(`bank.${s.id}`, { defaultValue: s.name })}
                      </Text>
                      <Button size="sm" label={t("common.add")} onPress={() => fillIn(s)} />
                      <Pressable
                        accessibilityLabel={t("allList.dismissA11y", { name: s.name })}
                        hitSlop={8}
                        onPress={() => removePendingSuggestion(s.id)}
                      >
                        <SymbolView name="xmark" size={13} tintColor={colors.mutedText} />
                      </Pressable>
                    </View>
                  );
                })}
              </View>
            )}
          </View>

          {/* Names the current order; tapping opens the picker. */}
          <Pressable
            style={styles.sortRow}
            onPress={() => setSortSheet(true)}
            accessibilityLabel={t("allList.sortA11y")}
            hitSlop={8}
          >
            <SymbolView name="arrow.up.arrow.down" size={11} tintColor={colors.mutedText} />
            <Text style={styles.sortText}>{t(SORT_LABEL_KEY[sort])}</Text>
          </Pressable>
        </View>
      }
      renderItem={({ item }) => (
        <SubscriptionRow
          item={item}
          onPress={() => router.push({ pathname: "/item", params: { id: item.id } })}
          onMarkPaid={() => {
            hapticMarkPaid();
            if (isInstallmentSchedule(item.schedule)) markInstallmentPaid(item.id);
            else markPaid(item.id);
          }}
          onDelete={() => removeSubscription(item.id)}
        />
      )}
      ListFooterComponent={
        <WheelSheet
          visible={sortSheet}
          title={t("allList.sortTitle")}
          onClose={() => setSortSheet(false)}
        >
          <Picker selectedValue={sort} onValueChange={(v) => setSort(v as SortKey)}>
            <Picker.Item label={t("allList.sortDay")} value="day" color={colors.text} />
            <Picker.Item label={t("allList.sortPrice")} value="price" color={colors.text} />
            <Picker.Item label={t("allList.sortName")} value="name" color={colors.text} />
          </Picker>
        </WheelSheet>
      }
    />
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    list: {
      flex: 1,
      backgroundColor: "transparent",
    },
    listContent: {
      padding: spacing.md,
      paddingBottom: dockClearance,
      gap: spacing.sm,
    },
    center: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: "transparent",
    },
    headerStack: {
      gap: spacing.sm,
    },
    pendingHeader: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
      paddingVertical: spacing.xs,
    },
    pendingLine: {
      flex: 1,
      height: StyleSheet.hairlineWidth,
      backgroundColor: colors.border,
    },
    pendingTitle: {
      ...typography.caption,
      fontWeight: "600",
      color: colors.mutedText,
    },
    pendingList: {
      backgroundColor: colors.surface,
      borderRadius: radius.md,
      paddingHorizontal: spacing.md,
    },
    pendingRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
      paddingVertical: spacing.sm,
    },
    browseRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
      paddingVertical: spacing.sm,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    browseRowOnly: {
      borderBottomWidth: 0,
    },
    browseTexts: {
      flex: 1,
      gap: 1,
    },
    browseText: {
      ...typography.caption,
      fontWeight: "600",
      color: colors.text,
    },
    browseHint: {
      ...typography.caption,
      color: colors.mutedText,
    },
    pendingName: {
      ...typography.body,
      color: colors.text,
      flex: 1,
    },
    sortRow: {
      alignSelf: "flex-end",
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.xs,
      paddingVertical: spacing.xs,
    },
    sortText: {
      ...typography.caption,
      fontWeight: "600",
      color: colors.mutedText,
    },
  });
}
