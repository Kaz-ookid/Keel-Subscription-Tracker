// All state, derived values and submit logic behind the Add/Edit form. The
// sections and sheets receive the returned `AddForm` object — they render it,
// never compute it. M3's Annual plan type lands here as one more branch.

import {
  addRecurrence,
  alignToOccurrence,
  anchorFromDate,
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
import { useTranslation } from "react-i18next";

import { localizedAnchor } from "../../i18n/recurrence";
import { useAppState } from "../../state/app-state";

export type PlanType = "subscription" | "installment";

// In Pay-in-X mode the entered amount is either the full price (divided across
// the payments) or the already-computed per-payment amount (× the count).
export type AmountMode = "total" | "perPayment";

export type OpenSheet =
  | "currency"
  | "date"
  | "endDate"
  | "convertsDate"
  | "reminder"
  | "category"
  | "account"
  | "color"
  | "provider"
  | null;

export const REMINDER_OPTIONS: { value: string; labelKey: string; count?: number }[] = [
  { value: "never", labelKey: "add.reminderNever" },
  { value: "0", labelKey: "add.reminderOnDay" },
  { value: "1", labelKey: "add.reminderDayBefore", count: 1 },
  { value: "2", labelKey: "add.reminderDayBefore", count: 2 },
  { value: "7", labelKey: "add.reminderWeekBefore" },
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

/** A brand-bank entry's pre-fillable fields — route params (the To-complete
 *  flow) and an in-screen pick (the Add flow's chooser) share this shape. */
export interface SuggestionPrefill {
  readonly id?: string;
  readonly name?: string;
  readonly categoryId?: string;
  readonly unit?: string;
  readonly color?: string;
  readonly domain?: string;
}

export function useAddForm(prefill?: SuggestionPrefill) {
  const router = useRouter();
  const { t } = useTranslation();
  const {
    id,
    suggestionId: suggestionIdParam,
    ...suggested
  } = useLocalSearchParams<{
    id?: string;
    // Set when arriving from the To-complete list: pre-fill, then clear the
    // pending entry on a successful save.
    suggestionId?: string;
    name?: string;
    categoryId?: string;
    unit?: string;
    color?: string;
    domain?: string;
  }>();
  const {
    items,
    addSubscription,
    addInstallmentPlan,
    updateSubscription,
    updateInstallmentPlan,
    removePendingSuggestion,
    categories,
    accounts,
    displayCurrency,
  } = useAppState();

  // When an `id` is passed we're editing an existing item; pre-fill from it.
  const editItem = id ? items.find((i) => i.id === id) : undefined;
  const isEditing = !!editItem;
  // Route params (To-complete flow) win over an in-screen pick; neither
  // applies when editing. Saving clears any matching pending entry.
  const suggestion: SuggestionPrefill | undefined = editItem
    ? undefined
    : suggestionIdParam
      ? suggested
      : prefill;
  const suggestionId = editItem ? undefined : (suggestionIdParam ?? prefill?.id);
  const editRec =
    editItem && isRecurringSchedule(editItem.schedule) ? editItem.schedule : undefined;
  const editInst =
    editItem && isInstallmentSchedule(editItem.schedule) ? editItem.schedule : undefined;
  const editAmount = editRec?.amount ?? editInst?.totalAmount;
  const editFirstDate = editRec?.firstChargeDate ?? editInst?.firstInstallmentDate;

  const [planType, setPlanType] = useState<PlanType>(() =>
    editInst ? "installment" : "subscription",
  );
  // Generic bank entries ("Gym membership") arrive in the user's language;
  // brand names pass through the defaultValue untouched.
  const suggestedName =
    suggestion?.name && suggestionId
      ? t(`bank.${suggestionId}`, { defaultValue: suggestion.name })
      : suggestion?.name;
  const [name, setName] = useState(() => editItem?.name ?? suggestedName ?? "");
  const [amountText, setAmountText] = useState(() =>
    editAmount ? String(toMajor(editAmount)) : "",
  );
  // A fresh form speaks the user's display currency until told otherwise.
  const [currency, setCurrency] = useState<CurrencyCode>(
    () => editAmount?.currency ?? displayCurrency,
  );
  const [intervalText, setIntervalText] = useState(() =>
    String(editRec?.recurrence.interval ?? editInst?.recurrence.interval ?? 1),
  );
  const [unit, setUnit] = useState<TimeUnit>(() => {
    if (editRec) return editRec.recurrence.unit;
    if (editInst) return editInst.recurrence.unit;
    return suggestion?.unit === "year" ? "year" : "month";
  });
  const [installmentsText, setInstallmentsText] = useState(() =>
    editInst ? String(editInst.numberOfInstallments) : "3",
  );
  const [amountMode, setAmountMode] = useState<AmountMode>("total");
  // Niche: monthly cycles can repeat "every 1st Thursday" instead of "the 4th".
  const [anchorMode, setAnchorMode] = useState(
    () => (editRec?.recurrence.anchor ?? editInst?.recurrence.anchor) != null,
  );
  const [provider, setProvider] = useState<BnplProviderId>(() => editInst?.provider ?? "other");
  const [firstDate, setFirstDate] = useState(() =>
    editFirstDate ? fromCalendarDate(editFirstDate) : new Date(),
  );
  const [endDate, setEndDate] = useState<CalendarDate | null>(() => editRec?.endDate ?? null);
  // Trial / intro offer: the amount field becomes the trial price (0 = free)
  // until `convertsDate`, then `trialRegularText` takes over.
  const [isTrial, setIsTrialState] = useState(() => editRec?.introOffer != null);
  const [trialRegularText, setTrialRegularText] = useState(() =>
    editRec?.introOffer ? String(toMajor(editRec.introOffer.regularAmount)) : "",
  );
  const [convertsDate, setConvertsDate] = useState(() =>
    editRec?.introOffer ? fromCalendarDate(editRec.introOffer.convertsOn) : new Date(),
  );
  const [settlementMode, setSettlementMode] = useState<SettlementMode>(
    () => editItem?.settlementMode ?? "automatic",
  );
  const [reminderKey, setReminderKey] = useState(() =>
    editItem?.reminder ? String(editItem.reminder.daysBefore) : "never",
  );

  // Turning a trial on lights up a heads-up reminder by default — the whole
  // point is not to be surprised by the conversion.
  const setIsTrial = (next: boolean) => {
    setIsTrialState(next);
    if (next && reminderKey === "never") setReminderKey("2");
  };
  const [categoryId, setCategoryId] = useState<string | undefined>(
    () => editItem?.categoryId ?? suggestion?.categoryId,
  );
  const [accountId, setAccountId] = useState<string | undefined>(() => editItem?.accountId);
  const [color, setColor] = useState<string | undefined>(
    () => editItem?.color ?? suggestion?.color,
  );
  // The brand website behind the logo — carried invisibly from a suggestion
  // (or the item being edited) through to the saved item.
  const domain = editItem?.domain ?? suggestion?.domain;
  const [notes, setNotes] = useState(() => editItem?.notes ?? "");
  const [sheet, setSheet] = useState<OpenSheet>(null);

  const isInstallment = planType === "installment";
  const amountValue = parseFloat(amountText.replace(",", "."));
  const installmentCount = Math.max(1, parseInt(installmentsText, 10) || 1);
  // Trials only apply to subscriptions; the amount field is the trial price
  // (0 = free), so it's the REGULAR price that must be present to submit.
  const showTrial = isTrial && !isInstallment;
  const trialRegularValue = parseFloat(trialRegularText.replace(",", "."));
  const convertsCal = toCalendarDate(convertsDate);
  const canSubmit = name.trim().length > 0 && (showTrial ? trialRegularValue > 0 : amountValue > 0);

  const firstDateCal = toCalendarDate(firstDate);
  // Both interpretations of the picked date — the "Repeats on" toggle's labels.
  const anchor = anchorFromDate(firstDateCal);
  const dayLabel = t("add.theDay", { day: Number(firstDateCal.slice(8, 10)) });
  const anchorLabel = localizedAnchor(anchor);
  const recurrence = {
    unit,
    interval: Math.max(1, parseInt(intervalText, 10) || 1),
    ...(anchorMode && unit === "month" ? { anchor } : {}),
  };
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
  const reminderOption = REMINDER_OPTIONS.find((o) => o.value === reminderKey);
  const reminderLabel = reminderOption
    ? t(reminderOption.labelKey, { count: reminderOption.count })
    : t("common.never");

  // Live trial summary: "Free until 20 Jun · then CHF 12.90" (or the intro
  // price when it isn't free). Shown under the toggle once a regular price set.
  const trialPreview = (() => {
    if (!showTrial || !(trialRegularValue > 0)) return null;
    const regular = formatMoney(fromMajor(trialRegularValue, currency));
    const until = formatCalendarDate(convertsCal);
    const free = !(amountValue > 0);
    return free
      ? t("add.trialPreviewFree", { date: until, regular })
      : t("add.trialPreviewIntro", {
          intro: formatMoney(fromMajor(amountValue, currency)),
          date: until,
          regular,
        });
  })();

  // Any payment can name an account it's paid from — automatic ones debit it,
  // manual ones associate by default (so it shows in per-account analytics).
  const isAutomatic = settlementMode === "automatic";
  const selectedAccount = accounts.find((a) => a.id === accountId);
  // Selecting an account DEFAULTS the currency to the account's (see
  // selectAccount) but never locks it — a CHF card can pay a USD
  // subscription; the charge is stored in what the merchant bills.
  const effectiveCurrency = currency;

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
    for (let i = 1; i < installmentCount; i++) finish = addRecurrence(finish, recurrence);
    const ends = formatCalendarDate(finish);
    if (amountMode === "total") {
      const per = splitMoney(installmentTotal, installmentCount)[0];
      return t("add.previewFromTotal", {
        count: installmentCount,
        per: formatMoney(per),
        date: ends,
      });
    }
    return t("add.previewFromPer", {
      total: formatMoney(installmentTotal),
      count: installmentCount,
      date: ends,
    });
  })();

  // Selecting an account defaults the currency to the account's — the usual
  // case — while leaving the chip editable for foreign-currency charges.
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
        recurrence,
        firstInstallmentDate: firstDateCal,
        provider,
        settlementMode,
        accountId,
        categoryId,
        color,
        domain,
        reminder: reminderFromKey(reminderKey),
        notes: notes.trim() || undefined,
      };
      if (editItem) updateInstallmentPlan(editItem.id, input);
      else addInstallmentPlan(input);
    } else {
      // Trial price (0 = free) until conversion; the regular price lives in the
      // intro offer. A free trial bills nothing before conversion, so the grid
      // starts at the conversion date.
      const introPrice = fromMajor(showTrial && !(amountValue > 0) ? 0 : amountValue, currency);
      const introOffer =
        showTrial && trialRegularValue > 0
          ? { regularAmount: fromMajor(trialRegularValue, currency), convertsOn: convertsCal }
          : undefined;
      const isFreeTrial = introOffer !== undefined && introPrice.amount === 0;
      const input: NewRecurringInput = {
        name: name.trim(),
        amount: introPrice,
        recurrence,
        firstChargeDate: isFreeTrial ? convertsCal : firstDateCal,
        endDate: endDateCal,
        settlementMode,
        accountId,
        categoryId,
        color,
        domain,
        reminder: reminderFromKey(reminderKey),
        notes: notes.trim() || undefined,
        introOffer,
      };
      if (editItem) updateSubscription(editItem.id, input);
      else addSubscription(input);
    }
    // The suggestion is now a real commitment — its To-complete row retires
    // (a no-op when it was never pending, e.g. picked in the Add flow).
    if (suggestionId) removePendingSuggestion(suggestionId);
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
    anchorMode,
    setAnchorMode,
    dayLabel,
    anchorLabel,
    provider,
    setProvider,
    firstDate,
    setFirstDate,
    setEndDate,
    // Trial / intro offer
    showTrial,
    isTrial,
    setIsTrial,
    trialRegularText,
    setTrialRegularText,
    convertsDate,
    setConvertsDate,
    convertsCal,
    trialPreview,
    settlementMode,
    setSettlementMode,
    reminderKey,
    setReminderKey,
    categoryId,
    setCategoryId,
    accountId,
    color,
    setColor,
    domain,
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
