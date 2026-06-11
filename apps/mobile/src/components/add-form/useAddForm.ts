// All state, derived values and submit logic behind the Add/Edit form. The
// sections and sheets receive the returned `AddForm` object — they render it,
// never compute it. M3's Annual plan type lands here as one more branch.

import {
  addRecurrence,
  alignToOccurrence,
  calendarDate,
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
import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";

import { useAppState } from "../../state/app-state";

export type PlanType = "subscription" | "installment";

// In Pay-in-X mode the entered amount is either the full price (divided across
// the payments) or the already-computed per-payment amount (× the count).
export type AmountMode = "total" | "perPayment";

export type OpenSheet =
  | "currency"
  | "date"
  | "endDate"
  | "reminder"
  | "category"
  | "account"
  | "color"
  | "provider"
  | null;

export const REMINDER_OPTIONS = [
  { value: "never", label: "Never" },
  { value: "0", label: "On the day" },
  { value: "1", label: "1 day before" },
  { value: "2", label: "2 days before" },
  { value: "7", label: "1 week before" },
];

function reminderFromKey(key: string): ReminderRule | undefined {
  return key === "never" ? undefined : { daysBefore: Number(key) };
}

/** The picker returns a Date at LOCAL midnight — format with local parts.
 *  (`toISOString` converts to UTC first, which shifted "16 June" to the 15th
 *  for anyone east of Greenwich.) */
function toCalendarDate(d: Date): CalendarDate {
  const pad = (n: number) => String(n).padStart(2, "0");
  return calendarDate(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`);
}

/** Parse a stored calendar date to LOCAL midnight for the native picker
 *  (`new Date("YYYY-MM-DD")` parses as UTC, the same shift the other way). */
function fromCalendarDate(date: CalendarDate): Date {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export type AddForm = ReturnType<typeof useAddForm>;

export function useAddForm() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const {
    items,
    addSubscription,
    addInstallmentPlan,
    updateSubscription,
    updateInstallmentPlan,
    categories,
    accounts,
  } = useAppState();

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
    editFirstDate ? fromCalendarDate(editFirstDate) : new Date(),
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

  const firstDateCal = toCalendarDate(firstDate);
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

  // Selecting an account also syncs the manual currency so unselecting stays coherent.
  const selectAccount = (selected: string | undefined) => {
    setAccountId(selected);
    const account = accounts.find((a) => a.id === selected);
    if (account) setCurrency(account.currency);
  };

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

  return {
    // Mode
    planType,
    setPlanType,
    isEditing,
    isInstallment,
    isAutomatic,
    // Fields
    name,
    setName,
    notes,
    setNotes,
    amountText,
    setAmountText,
    currency,
    setCurrency,
    intervalText,
    setIntervalText,
    unit,
    setUnit,
    installmentsText,
    setInstallmentsText,
    amountMode,
    setAmountMode,
    provider,
    setProvider,
    firstDate,
    setFirstDate,
    setEndDate,
    settlementMode,
    setSettlementMode,
    reminderKey,
    setReminderKey,
    categoryId,
    setCategoryId,
    accountId,
    color,
    setColor,
    // Derived
    amountValue,
    canSubmit,
    firstDateCal,
    endDateCal,
    endDateOptions,
    selectedCategory,
    selectedAccount,
    effectiveCurrency,
    reminderLabel,
    installmentPreview,
    // Sheets + actions
    sheet,
    setSheet,
    selectAccount,
    submit,
  };
}
