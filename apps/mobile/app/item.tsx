// Read-only detail view of a payment item. Tapping a card lands here — a
// frozen, clean rendering of everything the cards don't show — and editing is
// an explicit step (the Edit header action opens the form), so checking a
// detail can never accidentally change one.

import {
  COVERED_INSTALLMENT_STATUSES,
  describeRecurrence,
  formatCalendarDate,
  formatMoney,
  isInstallmentSchedule,
  isPaymentItemComplete,
  isRecurringSchedule,
  summarizeInstallmentPlan,
  today,
} from "@keel/core";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { SymbolView } from "expo-symbols";
import { useMemo } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { IconBadge } from "../src/components/IconBadge";
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
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { items, accounts, categories, markPaid, markInstallmentPaid, removeSubscription } =
    useAppState();

  const item = items.find((i) => i.id === id);
  if (!item) {
    return (
      <View style={styles.center}>
        <Text style={styles.emptyHint}>This item no longer exists.</Text>
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

  const subtitle = recurring
    ? `${describeRecurrence(recurring.recurrence)} · ${item.settlementMode === "manual" ? "Manual" : "Automatic"}`
    : `Pay in ${plan?.totalCount} · ${item.settlementMode === "manual" ? "Manual" : "Automatic"}`;

  const canMarkPaid = !complete && (installment !== undefined || item.settlementMode === "manual");

  const confirmDelete = () =>
    Alert.alert("Delete subscription", `Remove “${item.name}”? This cannot be undone.`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
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
          title: "Details",
          headerRight: () => (
            <Pressable
              onPress={() => router.push({ pathname: "/add", params: { id: item.id } })}
              hitSlop={12}
            >
              <Text style={styles.headerAction}>Edit</Text>
            </Pressable>
          ),
        }}
      />

      {/* Identity */}
      <View style={styles.identity}>
        <IconBadge
          icon={category?.icon}
          fallback={item.name.charAt(0).toUpperCase()}
          color={item.color ?? colors.accent}
          size={64}
        />
        <Text style={styles.name}>{item.name}</Text>
        <Text style={styles.subtitle}>{subtitle}</Text>
        {complete && (
          <Text style={[styles.subtitle, { color: tones.success }]}>
            {recurring ? "Ended" : "Fully paid"}
          </Text>
        )}
      </View>

      {/* Facts */}
      <View style={styles.card}>
        {recurring && (
          <>
            <InfoRow label="Amount" value={formatMoney(recurring.amount)} styles={styles} />
            <InfoRow
              label="Cycle"
              value={describeRecurrence(recurring.recurrence)}
              styles={styles}
            />
            <InfoRow
              label="First billing"
              value={formatCalendarDate(recurring.firstChargeDate)}
              styles={styles}
            />
            {!complete && (
              <InfoRow
                label="Next billing"
                value={formatCalendarDate(recurring.nextChargeDate)}
                styles={styles}
              />
            )}
            <InfoRow
              label="Last billing"
              value={recurring.endDate ? formatCalendarDate(recurring.endDate) : "Never"}
              styles={styles}
            />
          </>
        )}
        {plan && installment && (
          <>
            <InfoRow label="Total" value={formatMoney(plan.totalAmount)} styles={styles} />
            <InfoRow
              label="Progress"
              value={`${plan.paidCount} of ${plan.totalCount} paid · ${formatMoney(plan.remainingAmount)} left`}
              styles={styles}
            />
            <InfoRow
              label="Cycle"
              value={describeRecurrence(installment.recurrence)}
              styles={styles}
            />
            {installment.provider && (
              <InfoRow label="Provider" value={installment.provider} styles={styles} />
            )}
          </>
        )}
        <InfoRow label="Account" value={account?.name ?? "None"} styles={styles} />
        <InfoRow label="Category" value={category?.name ?? "None"} styles={styles} />
        <InfoRow
          label="Reminder"
          value={item.reminder ? `${item.reminder.daysBefore} day(s) before` : "Never"}
          styles={styles}
        />
        {item.notes ? <InfoRow label="Description" value={item.notes} styles={styles} /> : null}
      </View>

      {/* The explicit list is the point of Pay-in-X — show every payment. */}
      {installment && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Payments</Text>
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

      {/* Price changes over time (edge case #1) — only when there were any. */}
      {recurring && recurring.priceHistory.length > 1 && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Price history</Text>
          {recurring.priceHistory.map((entry, i) => (
            <InfoRow
              key={`${entry.effectiveFrom}-${i}`}
              label={`since ${formatCalendarDate(entry.effectiveFrom)}`}
              value={formatMoney(entry.amount)}
              styles={styles}
            />
          ))}
        </View>
      )}

      {canMarkPaid && (
        <Pressable
          style={styles.primaryBtn}
          onPress={() => (installment ? markInstallmentPaid(item.id) : markPaid(item.id))}
        >
          <Text style={styles.primaryBtnText}>Mark paid</Text>
        </Pressable>
      )}

      <Pressable style={styles.deleteRow} onPress={confirmDelete}>
        <Text style={styles.deleteText}>Delete</Text>
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
    card: {
      backgroundColor: colors.surface,
      borderRadius: radius.md,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.xs,
    },
    cardTitle: {
      ...typography.label,
      color: colors.text,
      paddingTop: spacing.sm,
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
    deleteRow: { alignItems: "center", paddingVertical: spacing.sm },
    deleteText: { ...typography.label, color: tones.danger },
  });
}
