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
  type SuggestedCommitment,
  type TimeUnit,
} from "@keel/core";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Alert } from "react-native";

import { localizedAnchor } from "../../i18n/recurrence";
import { loadNotificationSettings } from "../../lib/notifications";
import { matchSuggestions } from "../../lib/suggestions";
import { useAppState } from "../../state/app-state";
import { useImportSession } from "../../state/import-session";

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
  | "reminderHour"
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

function reminderFromKey(key: string, hourKey: string): ReminderRule | undefined {
  if (key === "never") return undefined;
  return {
    daysBefore: Number(key),
    ...(hourKey === "default" ? {} : { hour: Number(hourKey) }),
  };
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
    draftId,
    ...suggested
  } = useLocalSearchParams<{
    id?: string;
    // Set when arriving from the To-complete list: pre-fill, then clear the
    // pending entry on a successful save.
    suggestionId?: string;
    // Set when arriving from the AI-import review screen: pre-fill from the
    // session draft and save back to it instead of creating an item.
    draftId?: string;
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
  // When a `draftId` is passed we're fixing an AI-import proposal: seed from
  // the session draft and, on save, write back to it (nothing is created
  // until the review screen's confirm).
  const { getDraft, updateDraft } = useImportSession();
  const draft = draftId ? getDraft(draftId) : undefined;
  const draftRec = draft?.kind === "subscription" ? draft.input : undefined;
  const draftInst = draft?.kind === "split" ? draft.input : undefined;
  const isDraft = !!draft;
  // Route params (To-complete flow) win over an in-screen pick; neither
  // applies when editing or reviewing a draft. Saving clears any matching
  // pending entry.
  const suggestion: SuggestionPrefill | undefined =
    editItem || draft ? undefined : suggestionIdParam ? suggested : prefill;
  const suggestionId = editItem || draft ? undefined : (suggestionIdParam ?? prefill?.id);
  const editRec =
    editItem && isRecurringSchedule(editItem.schedule) ? editItem.schedule : undefined;
  const editInst =
    editItem && isInstallmentSchedule(editItem.schedule) ? editItem.schedule : undefined;
  // Unified seeds: an edited item's schedule and an import draft's input carry
  // the same field names, so every initializer below reads one `seed*`.
  const seedRec = editRec ?? draftRec;
  const seedInst = editInst ?? draftInst;
  const seedItem = editItem ?? draft?.input;
  const editAmount = seedRec?.amount ?? seedInst?.totalAmount;
  const editFirstDate = seedRec?.firstChargeDate ?? seedInst?.firstInstallmentDate;

  const [planType, setPlanType] = useState<PlanType>(() =>
    seedInst ? "installment" : "subscription",
  );
  // Generic bank entries ("Gym membership") arrive in the user's language;
  // brand names pass through the defaultValue untouched.
  const suggestedName =
    suggestion?.name && suggestionId
      ? t(`bank.${suggestionId}`, { defaultValue: suggestion.name })
      : suggestion?.name;
  const [name, setName] = useState(() => seedItem?.name ?? suggestedName ?? "");
  const [amountText, setAmountText] = useState(() =>
    editAmount ? String(toMajor(editAmount)) : "",
  );
  // A fresh form speaks the user's display currency until told otherwise.
  const [currency, setCurrency] = useState<CurrencyCode>(
    () => editAmount?.currency ?? displayCurrency,
  );
  const [intervalText, setIntervalText] = useState(() =>
    String(seedRec?.recurrence.interval ?? seedInst?.recurrence.interval ?? 1),
  );
  const [unit, setUnit] = useState<TimeUnit>(() => {
    if (seedRec) return seedRec.recurrence.unit;
    if (seedInst) return seedInst.recurrence.unit;
    return suggestion?.unit === "year" ? "year" : "month";
  });
  const [installmentsText, setInstallmentsText] = useState(() =>
    seedInst ? String(seedInst.numberOfInstallments) : "3",
  );
  const [amountMode, setAmountMode] = useState<AmountMode>("total");
  // Niche: monthly cycles can repeat "every 1st Thursday" instead of "the 4th".
  const [anchorMode, setAnchorMode] = useState(
    () => (seedRec?.recurrence.anchor ?? seedInst?.recurrence.anchor) != null,
  );
  const [provider, setProvider] = useState<BnplProviderId>(() => seedInst?.provider ?? "other");
  const [firstDate, setFirstDate] = useState(() =>
    editFirstDate ? fromCalendarDate(editFirstDate) : new Date(),
  );
  const [endDate, setEndDate] = useState<CalendarDate | null>(() => seedRec?.endDate ?? null);
  // Trial / intro offer: the amount field becomes the trial price (0 = free)
  // until `convertsDate`, then `trialRegularText` takes over.
  const [isTrial, setIsTrialState] = useState(() => seedRec?.introOffer != null);
  const [trialRegularText, setTrialRegularText] = useState(() =>
    seedRec?.introOffer ? String(toMajor(seedRec.introOffer.regularAmount)) : "",
  );
  const [convertsDate, setConvertsDate] = useState(() =>
    seedRec?.introOffer ? fromCalendarDate(seedRec.introOffer.convertsOn) : new Date(),
  );
  const [settlementMode, setSettlementMode] = useState<SettlementMode>(
    () => seedItem?.settlementMode ?? "automatic",
  );
  const [reminderKey, setReminderKey] = useState(() =>
    seedItem?.reminder ? String(seedItem.reminder.daysBefore) : "never",
  );
  // "default" follows the app-wide fire hour; a number is this item's own.
  // The UI shows the RESOLVED hour either way (no "default" entry to decode),
  // so the app-wide hour is loaded to fill the label and preselect the wheel.
  const [reminderHourKey, setReminderHourKey] = useState(() =>
    seedItem?.reminder?.hour !== undefined ? String(seedItem.reminder.hour) : "default",
  );
  const [defaultFireHour, setDefaultFireHour] = useState(9);
  useEffect(() => {
    void loadNotificationSettings().then((s) => setDefaultFireHour(s.fireHour));
  }, []);

  // Turning a trial on lights up a heads-up reminder by default — the whole
  // point is not to be surprised by the conversion.
  const setIsTrial = (next: boolean) => {
    setIsTrialState(next);
    if (next && reminderKey === "never") setReminderKey("2");
  };

  // The reminder switch: ON picks up the default lead from the notification
  // settings (the advanced row below it stays adjustable), OFF is "never".
  const setReminderEnabled = (next: boolean) => {
    if (!next) {
      setReminderKey("never");
      setReminderHourKey("default");
      return;
    }
    void loadNotificationSettings().then((s) => setReminderKey(s.defaultLeadKey));
  };
  const [categoryId, setCategoryId] = useState<string | undefined>(
    () => seedItem?.categoryId ?? suggestion?.categoryId,
  );
  const [accountId, setAccountId] = useState<string | undefined>(() => seedItem?.accountId);
  const [color, setColor] = useState<string | undefined>(
    () => seedItem?.color ?? suggestion?.color,
  );
  // The brand website behind the logo — seeded from a suggestion or the edited
  // item, and editable: pick a brand by name (applySuggestion) or type a domain
  // for a custom logo.
  const [domain, setDomain] = useState<string | undefined>(
    () => seedItem?.domain ?? suggestion?.domain,
  );
  const [notes, setNotes] = useState(() => seedItem?.notes ?? "");
  const [sheet, setSheet] = useState<OpenSheet>(null);

  // Unsaved-changes guard: the first render's values ARE the baseline (lazy
  // initializers already folded in edit/draft/suggestion seeds). Leaving with
  // edits asks first; a successful save flips `guardBypass` so its own
  // navigation passes through.
  const [initial] = useState(() => ({
    planType,
    name,
    amountText,
    currency,
    notes,
    intervalText,
    unit,
    installmentsText,
    anchorMode,
    provider,
    firstTime: firstDate.getTime(),
    endDate,
    isTrial,
    trialRegularText,
    convertsTime: convertsDate.getTime(),
    reminderKey,
    reminderHourKey,
    settlementMode,
    categoryId,
    accountId,
    color,
    domain,
  }));
  const guardBypass = useRef(false);
  const isDirty =
    planType !== initial.planType ||
    name !== initial.name ||
    amountText !== initial.amountText ||
    currency !== initial.currency ||
    notes !== initial.notes ||
    intervalText !== initial.intervalText ||
    unit !== initial.unit ||
    installmentsText !== initial.installmentsText ||
    anchorMode !== initial.anchorMode ||
    provider !== initial.provider ||
    firstDate.getTime() !== initial.firstTime ||
    endDate !== initial.endDate ||
    isTrial !== initial.isTrial ||
    trialRegularText !== initial.trialRegularText ||
    convertsDate.getTime() !== initial.convertsTime ||
    reminderKey !== initial.reminderKey ||
    reminderHourKey !== initial.reminderHourKey ||
    settlementMode !== initial.settlementMode ||
    categoryId !== initial.categoryId ||
    accountId !== initial.accountId ||
    color !== initial.color ||
    domain !== initial.domain;

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
  const reminderHourValue =
    reminderHourKey === "default" ? String(defaultFireHour) : reminderHourKey;
  const reminderHourLabel = `${reminderHourValue.padStart(2, "0")}:00`;

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

  // Inline brand-bank suggestions for the name field: as the user types a fresh
  // name, offer matching known providers (the upfront chooser, but in place).
  // Hidden once an identity is set (a brand picked, or a custom domain typed)
  // and when editing; skips brands already tracked by name.
  const takenNames = new Set(items.map((i) => i.name.trim().toLowerCase()));
  const nameSuggestions =
    isEditing || isDraft || domain
      ? []
      : matchSuggestions(name).filter((s) => !takenNames.has(s.name.toLowerCase()));

  /** Apply a brand-bank entry to the live form — name, look, category, cadence.
   *  The same effect as picking it from the upfront chooser. */
  const applySuggestion = (s: SuggestedCommitment) => {
    setName(t(`bank.${s.id}`, { defaultValue: s.name }));
    if (s.categoryId) setCategoryId(s.categoryId);
    setColor(s.color);
    setDomain(s.domain);
    if (s.unit === "month" || s.unit === "year") setUnit(s.unit);
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
        reminder: reminderFromKey(reminderKey, reminderHourKey),
        notes: notes.trim() || undefined,
      };
      if (editItem) updateInstallmentPlan(editItem.id, input);
      else if (draft) updateDraft(draft.id, { kind: "split", input });
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
        reminder: reminderFromKey(reminderKey, reminderHourKey),
        notes: notes.trim() || undefined,
        introOffer,
      };
      if (editItem) {
        // An amount edit means one of two very different things: the provider
        // really changed the price (worth recording — the Price-changes
        // insight reads it), or the old number was a typo (recording it would
        // invent a raise that never happened). Only the user knows which.
        const currentAmount =
          editItem.schedule.kind === "RECURRING" ? editItem.schedule.amount : undefined;
        const amountEdited =
          currentAmount &&
          (currentAmount.amount !== input.amount.amount ||
            currentAmount.currency !== input.amount.currency) &&
          !introOffer;
        if (amountEdited) {
          Alert.alert(t("add.priceEditTitle"), t("add.priceEditBody"), [
            { text: t("common.cancel"), style: "cancel" },
            {
              text: t("add.priceEditFix"),
              onPress: () => {
                updateSubscription(editItem.id, input, "correction");
                if (suggestionId) removePendingSuggestion(suggestionId);
                guardBypass.current = true;
                router.dismiss();
              },
            },
            {
              text: t("add.priceEditChange"),
              onPress: () => {
                updateSubscription(editItem.id, input, "change");
                if (suggestionId) removePendingSuggestion(suggestionId);
                guardBypass.current = true;
                router.dismiss();
              },
            },
          ]);
          return;
        }
        updateSubscription(editItem.id, input);
      } else if (draft) updateDraft(draft.id, { kind: "subscription", input });
      else addSubscription(input);
    }
    // The suggestion is now a real commitment — its To-complete row retires
    // (a no-op when it was never pending, e.g. picked in the Add flow).
    if (suggestionId) removePendingSuggestion(suggestionId);
    // A draft save pops back to the review list (same stack); every other
    // save is done with the whole sheet.
    guardBypass.current = true;
    if (isDraft) router.back();
    else router.dismiss();
  };

  return {
    // Mode
    planType,
    setPlanType,
    isEditing,
    isDraft,
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
    setReminderEnabled,
    reminderHourKey,
    setReminderHourKey,
    categoryId,
    setCategoryId,
    accountId,
    color,
    setColor,
    domain,
    setDomain,
    nameSuggestions,
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
    reminderHourLabel,
    reminderHourValue,
    installmentPreview,
    // Unsaved-changes guard
    isDirty,
    guardBypass,
    // Sheets + actions
    sheet,
    setSheet,
    selectAccount,
    applySuggestion,
    submit,
  };
}
