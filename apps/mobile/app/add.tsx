import DateTimePicker from "@react-native-community/datetimepicker";
import { Picker as RNPicker } from "@react-native-picker/picker";
import {
  calendarDate,
  CURRENCIES,
  formatCalendarDate,
  fromMajor,
  type CurrencyCode,
  type NewRecurringInput,
  type ReminderRule,
  type SettlementMode,
  type TimeUnit,
} from "@keel/core";
import { SymbolView, type SymbolViewProps } from "expo-symbols";
import { Stack, useRouter } from "expo-router";
import { useMemo, useState, type ComponentType, type ReactNode } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

import { CategorySheet } from "../src/components/CategorySheet";
import { FieldButton } from "../src/components/FieldButton";
import { Segmented, type SegmentedOption } from "../src/components/Segmented";
import { Sheet } from "../src/components/Sheet";
import { WheelSheet } from "../src/components/WheelSheet";
import { useSubscriptions } from "../src/state/subscriptions";
import { radius, spacing, typography, useTheme, type ThemeColors } from "../src/theme";

// @react-native-picker/picker@2.11 doesn't declare `children` under React 19's
// JSX types; alias to a children-accepting component (runtime is unaffected).
const Picker = RNPicker as unknown as ComponentType<{
  selectedValue: string;
  onValueChange: (value: string) => void;
  children: ReactNode;
}> & { Item: typeof RNPicker.Item };

const CURRENCY_CODES = Object.keys(CURRENCIES) as CurrencyCode[];

// A curated spectrum for the subscription colour. A fixed palette is reliable
// and crash-free (the previous full-spectrum picker crashed on selection).
const COLOR_SWATCHES = [
  "#EF4444", "#F87171", "#EC4899", "#F472B6", "#F59E0B", "#FB923C", "#FBBF24",
  "#FACC15", "#22C55E", "#4ADE80", "#16A34A", "#10B981", "#14B8A6", "#06B6D4",
  "#2DD4BF", "#3B82F6", "#60A5FA", "#2563EB", "#0EA5E9", "#8B5CF6", "#A78BFA",
  "#6366F1", "#0B1E3F", "#7FB8B0", "#6B7280", "#9CA3AF", "#111827", "#78350F",
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

type OpenSheet = "currency" | "date" | "endDate" | "reminder" | "category" | "color" | null;

export default function AddScreen() {
  const router = useRouter();
  const { colors, scheme } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { addSubscription, categories } = useSubscriptions();

  const [name, setName] = useState("");
  const [amountText, setAmountText] = useState("");
  const [currency, setCurrency] = useState<CurrencyCode>("EUR");
  const [intervalText, setIntervalText] = useState("1");
  const [unit, setUnit] = useState<TimeUnit>("month");
  const [firstDate, setFirstDate] = useState(new Date());
  const [endDate, setEndDate] = useState<Date | null>(null);
  const [settlementMode, setSettlementMode] = useState<SettlementMode>("automatic");
  const [reminderKey, setReminderKey] = useState("never");
  const [categoryId, setCategoryId] = useState<string | undefined>(undefined);
  const [color, setColor] = useState<string | undefined>(undefined);
  const [notes, setNotes] = useState("");
  const [sheet, setSheet] = useState<OpenSheet>(null);

  const amountValue = parseFloat(amountText.replace(",", "."));
  const canSubmit = name.trim().length > 0 && amountValue > 0;

  const firstDateCal = calendarDate(firstDate.toISOString().slice(0, 10));
  const endDateCal = endDate ? calendarDate(endDate.toISOString().slice(0, 10)) : undefined;
  const selectedCategory = categories.find((c) => c.id === categoryId);
  const reminderLabel = REMINDER_OPTIONS.find((o) => o.value === reminderKey)?.label ?? "Never";

  const submit = () => {
    if (!canSubmit) return;
    const input: NewRecurringInput = {
      name: name.trim(),
      amount: fromMajor(amountValue, currency),
      recurrence: { unit, interval: Math.max(1, parseInt(intervalText, 10) || 1) },
      firstChargeDate: firstDateCal,
      endDate: endDateCal,
      settlementMode,
      categoryId,
      color,
      reminder: reminderFromKey(reminderKey),
      notes: notes.trim() || undefined,
    };
    addSubscription(input);
    router.back();
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Stack.Screen
        options={{
          headerRight: () => (
            <Pressable onPress={submit} disabled={!canSubmit} hitSlop={12}>
              <Text style={[styles.headerAction, !canSubmit && styles.headerActionDisabled]}>
                Add
              </Text>
            </Pressable>
          ),
        }}
      />

      {/* Amount + currency */}
      <View style={styles.amountCard}>
        <Pressable style={styles.currencyChip} onPress={() => setSheet("currency")}>
          <Text style={styles.currencyChipText}>
            {CURRENCIES[currency].flag} {currency}
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

      <View style={styles.field}>
        <Text style={styles.label}>Name</Text>
        <TextInput
          style={styles.input}
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
        label="Ends"
        value={endDateCal ? formatCalendarDate(endDateCal) : "Never"}
        onPress={() => setSheet("endDate")}
      />

      <View style={styles.field}>
        <Text style={styles.label}>Settlement</Text>
        <Segmented options={SETTLEMENT_OPTIONS} value={settlementMode} onChange={setSettlementMode} />
      </View>

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
        <Pressable
          style={styles.clearRow}
          onPress={() => {
            setEndDate(null);
            setSheet(null);
          }}
        >
          <Text style={styles.clearText}>No end date</Text>
        </Pressable>
        <DateTimePicker
          value={endDate ?? firstDate}
          mode="date"
          display="spinner"
          themeVariant={scheme}
          textColor={colors.text}
          onChange={(_, d) => {
            if (d) setEndDate(d);
          }}
        />
      </WheelSheet>

      <WheelSheet visible={sheet === "reminder"} title="Reminder" onClose={() => setSheet(null)}>
        <Picker selectedValue={reminderKey} onValueChange={(v) => setReminderKey(String(v))}>
          {REMINDER_OPTIONS.map((o) => (
            <Picker.Item key={o.value} label={o.label} value={o.value} color={colors.text} />
          ))}
        </Picker>
      </WheelSheet>

      <CategorySheet
        visible={sheet === "category"}
        onClose={() => setSheet(null)}
        selectedId={categoryId}
        onSelect={setCategoryId}
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
    headerAction: { ...typography.label, color: colors.white, paddingHorizontal: spacing.sm },
    headerActionDisabled: { opacity: 0.4 },
    amountCard: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.md,
      backgroundColor: colors.surface,
      borderRadius: radius.md,
      padding: spacing.md,
      marginBottom: spacing.md,
    },
    currencyChip: {
      paddingVertical: spacing.xs + 2,
      paddingHorizontal: spacing.md,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.border,
    },
    currencyChipText: { ...typography.label, color: colors.text },
    amountInput: { ...typography.title, color: colors.text, flex: 1, textAlign: "right" },
    field: {
      paddingVertical: spacing.md,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
      gap: spacing.sm,
    },
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
    clearRow: { alignItems: "center", paddingVertical: spacing.sm },
    clearText: { ...typography.label, color: colors.accent },
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
