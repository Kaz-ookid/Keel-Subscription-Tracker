// All state, derived values and submit logic behind the Add/Edit form. The
// sections and sheets receive the returned `AddForm` object — they render it,
// never compute it. M3's Annual plan type lands here as one more branch.

import {
  addRecurrence,
  alignToOccurrence,
  anchorFromDate,
  formatCalendarDate,
  formatMoney,
  fromMajor,
  isInstallmentSchedule,
  isRecurringSchedule,
  listOccurrenceDates,
  nextOnGrid,
  splitMoney,
  toMajor,
  type BnplProviderId,
  type CalendarDate,
  type CurrencyCode,
  type NewInstallmentInput,
  type NewRecurringInput,
  type SettlementMode,
  type SuggestedCommitment,
  type TimeUnit,
} from "@keel/core";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Alert } from "react-native";

import { COLOR_SWATCHES } from "../../constants";
import { localizedAnchor } from "../../i18n/recurrence";
import { fromCalendarDate, toCalendarDate } from "../../lib/dates";
import { useReminderDrafts } from "./useReminderDrafts";
import { noteCustomService } from "../../lib/custom-bank";
import { dominantColor, subscribeBrandTints } from "../../lib/dominant-color";
import { matchSuggestions } from "../../lib/suggestions";
import { useAppActions, useAppData } from "../../state/app-state";
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
  | "reminderRepeat"
  | "category"
  | "account"
  | "color"
  | "provider"
  | "weekend"
  | null;

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
  const { items, categories, accounts, displayCurrency } = useAppData();
  const {
    addSubscription,
    addInstallmentPlan,
    updateSubscription,
    updateInstallmentPlan,
    removePendingSuggestion,
  } = useAppActions();

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
  // Route params win over an in-screen pick; neither applies when editing
  // or reviewing a draft. A bare `name` (the bank's "Create ‹typed name›"
  // row) prefills too — no suggestion id needed. Saving clears any matching
  // pending entry.
  const suggestion: SuggestionPrefill | undefined =
    editItem || draft ? undefined : suggestionIdParam || suggested.name ? suggested : prefill;
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
  // The reminder sub-form lives in its own hook.
  const reminders = useReminderDrafts(seedItem, t);
  const {
    reminderRows,
    reminderIndex,
    setReminderIndex,
    setReminderEnabled,
    patchReminderDraft,
    setReminderLead,
    addReminderDraft,
    removeReminderDraft,
    seedTrialReminder,
  } = reminders;
  // Weekend shift: "none" | "before" | "after" (none is not persisted).
  const [weekendShift, setWeekendShift] = useState<"none" | "before" | "after">(
    () => seedItem?.weekendShift ?? "none",
  );
  // Turning a trial on lights up a heads-up reminder by default — the whole
  // point is not to be surprised by the conversion.
  const setIsTrial = (next: boolean) => {
    setIsTrialState(next);
    if (next) seedTrialReminder();
    // A trial that ends TODAY is never what anyone means: an untouched
    // conversion date defaults a month out (a date the user already picked,
    // or an edited item's real date, stays put).
    if (next && toCalendarDate(convertsDate) === toCalendarDate(new Date())) {
      setConvertsDate(
        fromCalendarDate(addRecurrence(toCalendarDate(new Date()), { unit: "month", interval: 1 })),
      );
    }
  };

  const [categoryId, setCategoryId] = useState<string | undefined>(
    () => seedItem?.categoryId ?? suggestion?.categoryId,
  );
  const [accountId, setAccountId] = useState<string | undefined>(() => seedItem?.accountId);
  // The logo's color LEADS (§9c inversion, post round 2); the stored color
  // is its durable backup — the EXACT brand color, never snapped to a fixed
  // swatch (nearest-match picked dark blue for a green logo). The grid shows
  // it as one extra ADAPTIVE swatch: set by the latest logo (or a bank hex),
  // it outlives removing the logo, and the fixed swatches stay as they are.
  // All writes happen in init, event handlers or the tint subscription —
  // never during render, which fought the identity sheet's controlled input.
  const isSwatch = (hex: string) => (COLOR_SWATCHES as readonly string[]).includes(hex);
  const [color, setColor] = useState<string | undefined>(() => {
    const seeded = seedItem?.color ?? suggestion?.color;
    return (seedItem?.domain ? dominantColor(seedItem.domain) : undefined) ?? seeded;
  });
  const [adaptiveColor, setAdaptiveColor] = useState<string | undefined>(() => {
    const seeded = seedItem?.color ?? suggestion?.color;
    const tinted = seedItem?.domain ? dominantColor(seedItem.domain) : undefined;
    return tinted ?? (seeded && !isSwatch(seeded) ? seeded : undefined);
  });
  const takeTint = (tinted: string) => {
    setColor(tinted);
    setAdaptiveColor(tinted);
  };
  // The brand website behind the logo — seeded from a suggestion or the edited
  // item, and editable: pick a brand by name (applySuggestion) or type a domain
  // for a custom logo. Setting one whose tint is already known adopts it in
  // the same breath.
  const [domain, setDomainState] = useState<string | undefined>(
    () => seedItem?.domain ?? suggestion?.domain,
  );
  const setDomain = (next: string | undefined) => {
    setDomainState(next);
    const tinted = next ? dominantColor(next) : undefined;
    if (tinted) takeTint(tinted);
  };
  // A tint extracted WHILE the form is open (the preview badge just rendered
  // a fresh logo): adopt it as it lands. setState inside an external-store
  // subscription callback is the sanctioned shape for this.
  useEffect(
    () =>
      subscribeBrandTints(() => {
        const tinted = domain ? dominantColor(domain) : undefined;
        if (tinted) takeTint(tinted);
      }),
    [domain],
  );
  // The item's own badge mark (SF Symbol or emoji); undefined = the
  // category's icon, which is what the badge falls back to everywhere.
  const [icon, setIcon] = useState<string | undefined>(() => seedItem?.icon);
  const [notes, setNotes] = useState(() => seedItem?.notes ?? "");
  const [sheet, setSheet] = useState<OpenSheet>(null);

  /** A reminder row tapped a sheet open: remember WHICH rule it edits. */
  const openReminderSheet = (index: number, which: OpenSheet) => {
    setReminderIndex(index);
    setSheet(which);
  };

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
    remindersSig: reminders.signature,
    settlementMode,
    categoryId,
    accountId,
    color,
    domain,
    icon,
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
    reminders.signature !== initial.remindersSig ||
    settlementMode !== initial.settlementMode ||
    categoryId !== initial.categoryId ||
    accountId !== initial.accountId ||
    color !== initial.color ||
    domain !== initial.domain ||
    icon !== initial.icon;

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
      dates.push(nextOnGrid(firstDateCal, recurrence, dates[dates.length - 1]));
    }
    return dates;
  })();
  const selectedCategory = categories.find((c) => c.id === categoryId);
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
  // An import draft can name an account that does not exist yet: it is
  // created when the review confirms, so the form shows it as pending
  // instead of asking the user to choose one. Picking a real account
  // replaces it.
  const pendingAccountName = !accountId ? draft?.accountName : undefined;
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
    for (let i = 1; i < installmentCount; i++)
      finish = nextOnGrid(firstDateCal, recurrence, finish);
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
  // and when editing; skips brands already tracked by name. Memoised: this scans
  // the whole brand bank, and the form re-renders on every keystroke of any field.
  const nameSuggestions = useMemo(() => {
    if (isEditing || isDraft || domain) return [];
    const takenNames = new Set(items.map((i) => i.name.trim().toLowerCase()));
    return matchSuggestions(name).filter((s) => !takenNames.has(s.name.toLowerCase()));
  }, [isEditing, isDraft, domain, name, items]);

  /** Apply a brand-bank entry to the live form — name, look, category, cadence.
   *  The same effect as picking it from the upfront chooser. The bank color
   *  lands as the adaptive backup (setDomain then upgrades to the logo's
   *  tint when one is known). */
  const applySuggestion = (s: SuggestedCommitment) => {
    setName(t(`bank.${s.id}`, { defaultValue: s.name }));
    if (s.categoryId) setCategoryId(s.categoryId);
    setColor(s.color);
    if (s.color && !isSwatch(s.color)) setAdaptiveColor(s.color);
    setDomain(s.domain);
    if (s.unit === "month" || s.unit === "year") setUnit(s.unit);
  };

  const submit = () => {
    if (!canSubmit) return;
    // The full rule list, with the legacy single slot mirrored to the first
    // rule so blobs read by older builds still show one reminder.
    const reminderList = reminders.rules;
    const reminderFields = {
      reminder: reminderList[0],
      reminders: reminderList.length > 0 ? reminderList : undefined,
    };
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
        icon,
        ...reminderFields,
        weekendShift: weekendShift === "none" ? undefined : weekendShift,
        notes: notes.trim() || undefined,
      };
      if (editItem) updateInstallmentPlan(editItem.id, input);
      else if (draft) updateDraft(draft.id, { kind: "split", input });
      else {
        addInstallmentPlan(input);
        // A created service joins the brand bank for next time.
        noteCustomService({
          name: input.name,
          categoryId,
          color,
          domain,
          unit: unit === "year" ? "year" : "month",
        });
      }
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
        icon,
        ...reminderFields,
        weekendShift: weekendShift === "none" ? undefined : weekendShift,
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
      else {
        addSubscription(input);
        // A created service joins the brand bank for next time.
        noteCustomService({
          name: input.name,
          categoryId,
          color,
          domain,
          unit: unit === "year" ? "year" : "month",
        });
      }
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
    weekendShift,
    setWeekendShift,
    // Reminders
    reminderRows,
    reminderIndex,
    openReminderSheet,
    setReminderEnabled,
    patchReminderDraft,
    setReminderLead,
    addReminderDraft,
    removeReminderDraft,
    categoryId,
    setCategoryId,
    accountId,
    color,
    setColor,
    adaptiveColor,
    domain,
    setDomain,
    icon,
    setIcon,
    nameSuggestions,
    // Derived
    amountValue,
    canSubmit,
    firstDateCal,
    endDateCal,
    endDateOptions,
    selectedCategory,
    selectedAccount,
    pendingAccountName,
    effectiveCurrency,
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
