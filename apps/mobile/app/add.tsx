import DateTimePicker from "@react-native-community/datetimepicker";
import { Picker as RNPicker } from "@react-native-picker/picker";
import {
  addRecurrence,
  alignToOccurrence,
  BNPL_PROVIDERS,
  calendarDate,
  CURRENCIES,
  formatCalendarDate,
  formatMoney,
  fromMajor,
  isInstallmentSchedule,
  isRecurringSchedule,
  listOccurrenceDates,
  splitMoney,
  toMajor,
  type BnplProviderId,
  type CalendarDate,
  type CurrencyCode,
  type NewInstallmentInput,
  type NewRecurringInput,
  type ReminderRule,
  type SettlementMode,
  type TimeUnit,
} from "@keel/core";
import { SymbolView, type SymbolViewProps } from "expo-symbols";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useMemo, useState, type ComponentType, type ReactNode } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

import { AccountPickerSheet } from "../src/components/AccountSheet";
import { CategorySheet } from "../src/components/CategorySheet";
import { COLOR_SWATCHES } from "../src/constants";
import { FieldButton } from "../src/components/FieldButton";
import { Segmented, type SegmentedOption } from "../src/components/Segmented";
import { Sheet } from "../src/components/Sheet";
import { WheelSheet } from "../src/components/WheelSheet";
import { useSubscriptions } from "../src/state/subscriptions";
import { radius, spacing, tones, typography, useTheme, type ThemeColors } from "../src/theme";

// @react-native-picker/picker@2.11 doesn't declare `children` under React 19's
// JSX types; alias to a children-accepting component (runtime is unaffected).
const Picker = RNPicker as unknown as ComponentType<{
  selectedValue: string;
  onValueChange: (value: string) => void;
  children: ReactNode;
}> & { Item: typeof RNPicker.Item };

const CURRENCY_CODES = Object.keys(CURRENCIES) as CurrencyCode[];
const PROVIDER_IDS = Object.keys(BNPL_PROVIDERS) as BnplProviderId[];

type PlanType = "subscription" | "installment";

const PLAN_TYPES: { value: PlanType; label: string }[] = [
  { value: "subscription", label: "Subscription" },
  { value: "installment", label: "Pay in X" },
];

// In Pay-in-X mode the entered amount is either the full price (divided across
// the payments) or the already-computed per-payment amount (× the count).
type AmountMode = "total" | "perPayment";

const AMOUNT_MODE_OPTIONS: SegmentedOption<AmountMode>[] = [
  { value: "total", label: "Total" },
  { value: "perPayment", label: "Per payment" },
];

const UNIT_OPTIONS: SegmentedOption<TimeUnit>[] = [
  { value: "day", label: "Day" },
  { value: "week", label: "Week" },
  { value: "month", label: "Month" },
  { value: "year", label: "Year" },
];

const SETTLEMENT_OPTIONS: SegmentedOption<SettlementMode>[] = [
  { value: "automatic", label: "Automatic" },
  { value: "manual", label: "Manual" },
];

const REMINDER_OPTIONS = [
  { value: "never", label: "Never" },
  { value: "0", label: "On the day" },
  { value: "1", label: "1 day before" },
  { value: "2", label: "2 days before" },
  { value: "7", label: "1 week before" },
];

function reminderFromKey(key: string): ReminderRule | undefined {
  return key === "never" ? undefined : { daysBefore: Number(key) };
}

type OpenSheet =
  | "currency"
  | "date"
  | "endDate"
  | "reminder"
  | "category"
  | "account"
  | "color"
  | "provider"
  | null;

export default function AddScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { colors, scheme } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const {
    items,
    addSubscription,
    addInstallmentPlan,
    updateSubscription,
    updateInstallmentPlan,
    categories,
    accounts,
  } = useSubscriptions();

  // When an `id` is passed we're editing an existing item; pre-fill from it.
  const editItem = id ? items.find((i) => i.id === id) : undefined;
  const isEditing = !!editItem;
  const editRec =
    editItem && isRecurringSchedule(editItem.schedule) ? editItem.schedule : undefined;
  const editInst =
    editItem && isInstallmentSchedule(editItem.schedule) ? editItem.schedule : undefined;
  const editAmount = editRec?.amount ?? editInst?.totalAmount;
  const editFirstDate = editRec?.firstChargeDate ?? editInst?.firstInstallmentDate;

  const [planType, setPlanType] = useState<PlanType>(() =>
    editInst ? "installment" : "subscription",
  );
  const [name, setName] = useState(() => editItem?.name ?? "");
  const [amountText, setAmountText] = useState(() =>
    editAmount ? String(toMajor(editAmount)) : "",
  );
  const [currency, setCurrency] = useState<CurrencyCode>(() => editAmount?.currency ?? "EUR");
  const [intervalText, setIntervalText] = useState(() =>
    editRec ? String(editRec.recurrence.interval) : "1",
  );
  const [unit, setUnit] = useState<TimeUnit>(
    () => editRec?.recurrence.unit ?? editInst?.recurrence.unit ?? "month",
  );
  const [installmentsText, setInstallmentsText] = useState(() =>
    editInst ? String(editInst.numberOfInstallments) : "3",
  );
  const [amountMode, setAmountMode] = useState<AmountMode>("total");
  const [provider, setProvider] = useState<BnplProviderId>(() => editInst?.provider ?? "other");
  const [firstDate, setFirstDate] = useState(() =>
    editFirstDate ? new Date(editFirstDate) : new Date(),
  );
  const [endDate, setEndDate] = useState<CalendarDate | null>(() => editRec?.endDate ?? null);
  const [settlementMode, setSettlementMode] = useState<SettlementMode>(
    () => editItem?.settlementMode ?? "automatic",
  );
  const [reminderKey, setReminderKey] = useState(() =>
    editItem?.reminder ? String(editItem.reminder.daysBefore) : "never",
  );
  const [categoryId, setCategoryId] = useState<string | undefined>(() => editItem?.categoryId);
  const [accountId, setAccountId] = useState<string | undefined>(() => editItem?.accountId);
  const [color, setColor] = useState<string | undefined>(() => editItem?.color);
  const [notes, setNotes] = useState(() => editItem?.notes ?? "");
  const [sheet, setSheet] = useState<OpenSheet>(null);

  const isInstallment = planType === "installment";
  const amountValue = parseFloat(amountText.replace(",", "."));
  const installmentCount = Math.max(1, parseInt(installmentsText, 10) || 1);
  const canSubmit = name.trim().length > 0 && amountValue > 0;

  const firstDateCal = calendarDate(firstDate.toISOString().slice(0, 10));
  const recurrence = { unit, interval: Math.max(1, parseInt(intervalText, 10) || 1) };
  // The end date is a *last billing* date: keep it snapped onto the billing
  // grid even if the cycle or first billing changes after it was picked.
  const endDateCal = endDate ? alignToOccurrence(firstDateCal, recurrence, endDate) : undefined;
  // Options for the "Ends" wheel — only real billing dates are selectable.
  const endDateOptions = (() => {
    const dates = listOccurrenceDates(firstDateCal, recurrence, 120);
    // An end date beyond the window (e.g. from an edited item) must stay selectable.
    while (endDateCal && dates[dates.length - 1] < endDateCal) {
      dates.push(addRecurrence(dates[dates.length - 1], recurrence));
    }
    return dates;
  })();
  const selectedCategory = categories.find((c) => c.id === categoryId);
  const reminderLabel = REMINDER_OPTIONS.find((o) => o.value === reminderKey)?.label ?? "Never";

  // Manual payments are deliberately not pre-linked to an account (brief §8).
  const isAutomatic = settlementMode === "automatic";
  const selectedAccount = isAutomatic ? accounts.find((a) => a.id === accountId) : undefined;
  // v1 rule: a payment charged to an account uses that account's currency —
  // while an account is selected it wins over the manually-picked currency.
  const effectiveCurrency = selectedAccount?.currency ?? currency;

  // Compute total ⇄ per-payment depending on how the user entered the amount.
  const installmentTotal =
    amountMode === "total"
      ? fromMajor(amountValue, effectiveCurrency)
      : {
          amount: fromMajor(amountValue, effectiveCurrency).amount * installmentCount,
          currency: effectiveCurrency,
        };

  // Live preview: shows whichever value was NOT entered, plus the final due date.
  const installmentPreview = (() => {
    if (!isInstallment || !(amountValue > 0)) return null;
    let finish = firstDateCal;
    for (let i = 1; i < installmentCount; i++)
      finish = addRecurrence(finish, { unit, interval: 1 });
    const ends = formatCalendarDate(finish);
    if (amountMode === "total") {
      const per = splitMoney(installmentTotal, installmentCount)[0];
      return `${installmentCount} payments · ≈ ${formatMoney(per)} each · ends ${ends}`;
    }
    return `total ${formatMoney(installmentTotal)} · ${installmentCount} payments · ends ${ends}`;
  })();

  const submit = () => {
    if (!canSubmit) return;
    if (isInstallment) {
      const input: NewInstallmentInput = {
        name: name.trim(),
        totalAmount: installmentTotal,
        numberOfInstallments: installmentCount,
        recurrence: { unit, interval: 1 },
        firstInstallmentDate: firstDateCal,
        provider,
        settlementMode,
        accountId: isAutomatic ? accountId : undefined,
        categoryId,
        color,
        reminder: reminderFromKey(reminderKey),
        notes: notes.trim() || undefined,
      };
      if (editItem) updateInstallmentPlan(editItem.id, input);
      else addInstallmentPlan(input);
    } else {
      const input: NewRecurringInput = {
        name: name.trim(),
        amount: fromMajor(amountValue, effectiveCurrency),
        recurrence,
        firstChargeDate: firstDateCal,
        endDate: endDateCal,
        settlementMode,
        accountId: isAutomatic ? accountId : undefined,
        categoryId,
        color,
        reminder: reminderFromKey(reminderKey),
        notes: notes.trim() || undefined,
      };
      if (editItem) updateSubscription(editItem.id, input);
      else addSubscription(input);
    }
    router.back();
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Stack.Screen
        options={{
          title: isEditing ? "Edit" : "New subscription",
          headerRight: () => (
            <Pressable onPress={submit} disabled={!canSubmit} hitSlop={12}>
              <Text style={[styles.headerAction, !canSubmit && styles.headerActionDisabled]}>
                {isEditing ? "Save" : "Add"}
              </Text>
            </Pressable>
          ),
        }}
      />

      {!isEditing && (
        <View style={styles.modeSwitch}>
          {PLAN_TYPES.map((m) => {
            const active = planType === m.value;
            return (
              <Pressable
                key={m.value}
                onPress={() => setPlanType(m.value)}
                style={[styles.modePill, active && styles.modePillActive]}
              >
                <Text style={[styles.modeText, active && styles.modeTextActive]}>{m.label}</Text>
              </Pressable>
            );
          })}
        </View>
      )}

      {/* Amount + currency */}
      <View style={[styles.amountCard, !(amountValue > 0) && styles.requiredMissing]}>
        <Pressable
          style={[styles.currencyChip, selectedAccount && styles.currencyChipLocked]}
          onPress={() => setSheet("currency")}
          disabled={!!selectedAccount}
        >
          <Text style={styles.currencyChipText}>
            {CURRENCIES[effectiveCurrency].flag} {effectiveCurrency}
          </Text>
        </Pressable>
        <TextInput
          style={styles.amountInput}
          value={amountText}
          onChangeText={setAmountText}
          placeholder="0.00"
          placeholderTextColor={colors.mutedText}
          keyboardType="decimal-pad"
        />
      </View>

      {isInstallment && (
        <>
          <View style={styles.rowField}>
            <Text style={styles.label}>Amount is</Text>
            <View style={styles.rowControl}>
              <Segmented
                options={AMOUNT_MODE_OPTIONS}
                value={amountMode}
                onChange={setAmountMode}
              />
            </View>
          </View>
          {installmentPreview ? <Text style={styles.preview}>{installmentPreview}</Text> : null}
        </>
      )}

      <View style={styles.field}>
        <Text style={styles.label}>Name</Text>
        <TextInput
          style={[styles.input, !name.trim() && styles.requiredMissing]}
          value={name}
          onChangeText={setName}
          placeholder="e.g. Netflix"
          placeholderTextColor={colors.mutedText}
        />
      </View>

      <View style={styles.field}>
        <Text style={styles.label}>Description</Text>
        <TextInput
          style={styles.input}
          value={notes}
          onChangeText={setNotes}
          placeholder="Optional"
          placeholderTextColor={colors.mutedText}
        />
      </View>

      {isInstallment ? (
        <>
          <View style={styles.rowField}>
            <Text style={styles.label}>Number of payments</Text>
            <TextInput
              style={[styles.input, styles.intervalInput]}
              value={installmentsText}
              onChangeText={setInstallmentsText}
              keyboardType="number-pad"
            />
          </View>

          <View style={styles.rowField}>
            <Text style={styles.label}>Frequency</Text>
            <View style={styles.rowControl}>
              <Segmented options={UNIT_OPTIONS} value={unit} onChange={setUnit} />
            </View>
          </View>

          <FieldButton
            label="First payment"
            value={formatCalendarDate(firstDateCal)}
            onPress={() => setSheet("date")}
          />

          <FieldButton
            label="Provider"
            value={BNPL_PROVIDERS[provider].label}
            onPress={() => setSheet("provider")}
          />
        </>
      ) : (
        <>
          <View style={styles.field}>
            <Text style={styles.label}>Cycle — every</Text>
            <View style={styles.cycleRow}>
              <TextInput
                style={[styles.input, styles.intervalInput]}
                value={intervalText}
                onChangeText={setIntervalText}
                keyboardType="number-pad"
              />
              <Segmented options={UNIT_OPTIONS} value={unit} onChange={setUnit} />
            </View>
          </View>

          <FieldButton
            label="First billing"
            value={formatCalendarDate(firstDateCal)}
            onPress={() => setSheet("date")}
          />

          <FieldButton
            label="Last billing"
            value={endDateCal ? formatCalendarDate(endDateCal) : "Never"}
            onPress={() => setSheet("endDate")}
          />
        </>
      )}

      <View style={styles.rowField}>
        <Text style={styles.label}>Settlement</Text>
        <View style={styles.rowControl}>
          <Segmented
            options={SETTLEMENT_OPTIONS}
            value={settlementMode}
            onChange={setSettlementMode}
          />
        </View>
      </View>

      {isAutomatic && (
        <FieldButton
          label="Account"
          value={selectedAccount?.name ?? (accountId ? "Archived account" : "Choose")}
          hint={!selectedAccount}
          accessory={
            selectedAccount ? (
              <View style={[styles.dot, { backgroundColor: selectedAccount.color }]} />
            ) : undefined
          }
          onPress={() => setSheet("account")}
        />
      )}

      <FieldButton label="Reminder" value={reminderLabel} onPress={() => setSheet("reminder")} />

      <FieldButton
        label="Category"
        value={selectedCategory?.name ?? "None"}
        accessory={
          selectedCategory?.icon ? (
            <SymbolView
              name={selectedCategory.icon as SymbolViewProps["name"]}
              size={20}
              tintColor={colors.mutedText}
            />
          ) : undefined
        }
        onPress={() => setSheet("category")}
      />

      <FieldButton
        label="Colour"
        accessory={<View style={[styles.dot, { backgroundColor: color ?? colors.border }]} />}
        onPress={() => setSheet("color")}
      />

      {/* --- Sheets --- */}
      <WheelSheet visible={sheet === "currency"} title="Currency" onClose={() => setSheet(null)}>
        <Picker selectedValue={currency} onValueChange={(v) => setCurrency(v as CurrencyCode)}>
          {CURRENCY_CODES.map((code) => (
            <Picker.Item
              key={code}
              label={`${CURRENCIES[code].flag}  ${code} — ${CURRENCIES[code].name}`}
              value={code}
              color={colors.text}
            />
          ))}
        </Picker>
      </WheelSheet>

      <WheelSheet visible={sheet === "date"} title="First billing" onClose={() => setSheet(null)}>
        <DateTimePicker
          value={firstDate}
          mode="date"
          display="spinner"
          themeVariant={scheme}
          textColor={colors.text}
          onChange={(_, d) => {
            if (d) setFirstDate(d);
          }}
        />
      </WheelSheet>

      <WheelSheet visible={sheet === "endDate"} title="Ends" onClose={() => setSheet(null)}>
        <Picker
          selectedValue={endDateCal ?? "never"}
          onValueChange={(v) => setEndDate(v === "never" ? null : calendarDate(v))}
        >
          <Picker.Item label="Never" value="never" color={colors.text} />
          {endDateOptions.map((d, i) => (
            <Picker.Item
              key={d}
              label={`${formatCalendarDate(d)} · ${i + 1} payment${i > 0 ? "s" : ""}`}
              value={d}
              color={colors.text}
            />
          ))}
        </Picker>
      </WheelSheet>

      <WheelSheet visible={sheet === "reminder"} title="Reminder" onClose={() => setSheet(null)}>
        <Picker selectedValue={reminderKey} onValueChange={(v) => setReminderKey(String(v))}>
          {REMINDER_OPTIONS.map((o) => (
            <Picker.Item key={o.value} label={o.label} value={o.value} color={colors.text} />
          ))}
        </Picker>
      </WheelSheet>

      <WheelSheet visible={sheet === "provider"} title="Provider" onClose={() => setSheet(null)}>
        <Picker selectedValue={provider} onValueChange={(v) => setProvider(v as BnplProviderId)}>
          {PROVIDER_IDS.map((id) => (
            <Picker.Item key={id} label={BNPL_PROVIDERS[id].label} value={id} color={colors.text} />
          ))}
        </Picker>
      </WheelSheet>

      <CategorySheet
        visible={sheet === "category"}
        onClose={() => setSheet(null)}
        selectedId={categoryId}
        onSelect={setCategoryId}
      />

      <AccountPickerSheet
        visible={sheet === "account"}
        onClose={() => setSheet(null)}
        selectedId={accountId}
        onSelect={(id) => {
          setAccountId(id);
          // Keep the manual currency in sync so unselecting stays coherent.
          const account = accounts.find((a) => a.id === id);
          if (account) setCurrency(account.currency);
        }}
      />

      <Sheet visible={sheet === "color"} title="Colour" onClose={() => setSheet(null)}>
        <ScrollView contentContainerStyle={styles.swatchGrid}>
          {COLOR_SWATCHES.map((c) => (
            <Pressable
              key={c}
              onPress={() => {
                setColor(c);
                setSheet(null);
              }}
              style={[
                styles.colorSwatch,
                { backgroundColor: c },
                color === c && styles.colorSwatchActive,
              ]}
            />
          ))}
        </ScrollView>
      </Sheet>
    </ScrollView>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.background },
    content: { padding: spacing.md, paddingBottom: spacing.xl },
    modeSwitch: {
      flexDirection: "row",
      backgroundColor: colors.surface,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 3,
      gap: 3,
      marginBottom: spacing.md,
    },
    modePill: {
      flex: 1,
      alignItems: "center",
      paddingVertical: spacing.sm,
      borderRadius: radius.sm,
    },
    modePillActive: { backgroundColor: colors.navy },
    modeText: { ...typography.label, color: colors.mutedText },
    modeTextActive: { color: colors.white },
    preview: {
      ...typography.caption,
      color: colors.mutedText,
      paddingTop: spacing.sm,
    },
    headerAction: { ...typography.label, color: colors.white, paddingHorizontal: spacing.sm },
    headerActionDisabled: { opacity: 0.4 },
    amountCard: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.md,
      backgroundColor: colors.surface,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: "transparent",
      padding: spacing.md,
      marginBottom: spacing.md,
    },
    // Subtle hint for an empty required field (name / amount).
    requiredMissing: {
      borderColor: tones.warning,
    },
    currencyChip: {
      paddingVertical: spacing.xs + 2,
      paddingHorizontal: spacing.md,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.border,
    },
    currencyChipText: { ...typography.label, color: colors.text },
    // Currency follows the selected account (one currency per account, v1).
    currencyChipLocked: { opacity: 0.5 },
    amountInput: { ...typography.title, color: colors.text, flex: 1, textAlign: "right" },
    field: {
      paddingVertical: spacing.md,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
      gap: spacing.sm,
    },
    rowField: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingVertical: spacing.md,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
      gap: spacing.sm,
    },
    rowControl: { flex: 1 },
    label: { ...typography.label, color: colors.text },
    input: {
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.sm,
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.md,
      ...typography.body,
      color: colors.text,
    },
    cycleRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, flexWrap: "wrap" },
    intervalInput: { width: 64, textAlign: "center" },
    dot: { width: 20, height: 20, borderRadius: 10 },
    swatchGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: spacing.md,
      padding: spacing.lg,
      justifyContent: "center",
    },
    colorSwatch: {
      width: 48,
      height: 48,
      borderRadius: 24,
      borderWidth: 3,
      borderColor: "transparent",
    },
    colorSwatchActive: {
      borderColor: colors.text,
    },
  });
}
