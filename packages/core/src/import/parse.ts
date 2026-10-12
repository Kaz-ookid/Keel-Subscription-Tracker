// The tolerant parser: raw pasted text → ready-to-review ImportDrafts.
// Philosophy (§6.1): recover wherever a safe default exists and WARN — the
// review screen is the net, and fixing a flagged field there must stay faster
// than typing the item from scratch. Only an item missing its essentials
// (a name, a usable amount) is skipped, and skips are counted, never silent.

import { BNPL_PROVIDERS, type BnplProviderId } from "../constants/bnpl-providers";
import { CURRENCIES, type CurrencyCode } from "../constants/currencies";
import { findSuggestedBrand } from "../constants/suggestions";
import type { Account } from "../models/account";
import type { Category } from "../models/category";
import type { IntroOffer } from "../models/payment-item";
import type { NewInstallmentInput, NewRecurringInput } from "../models/payment-item-factory";
import { fromMajor } from "../primitives/money";
import type { MonthlyAnchor, RecurrenceRule, TimeUnit } from "../primitives/recurrence";
import { RECURRENCE_PRESETS } from "../primitives/recurrence";
import { calendarDate, isCalendarDate, type CalendarDate } from "../primitives/temporal";
import { extractImportDocument } from "./extract";
import { IMPORT_FIELD_NAMES } from "./types";
import type {
  ImportDraft,
  ImportFieldName,
  ImportParseResult,
  ImportWarning,
  ImportWarningCode,
  RecurringImportDraft,
} from "./types";

export interface ImportContext {
  /** Used when an item states no usable currency. */
  defaultCurrency: CurrencyCode;
  /** Anchors the "invalid first date" fallback. */
  today: CalendarDate;
  /** Existing accounts, matched by name (case-insensitive). */
  accounts: readonly Account[];
  /** Known categories (built-in + user-created), validated by id. */
  categories: readonly Category[];
  /** Names of items already tracked — matches get a `duplicate` warning so a
   *  twice-pasted import can't silently double everything. */
  takenNames?: readonly string[];
}

// A name that reads like a description, not a name: starts with an article,
// embeds an amount+currency, contains a placeholder word ("purchase",
// "payment"), or is sentence-long. Since format v2 this heuristic is the
// ONLY source of the "name needs checking" flag (the model no longer
// self-reports); a v1 reply's own declaration is still merged in.
const NAME_AMOUNT = /\d+(?:[.,]\d+)?\s*(?:€|\$|£|chf|eur|usd|gbp|hkd|cad|aud|jpy)\b/i;
const NAME_ARTICLE = /^(?:a|an|un|une)\s/i;
const NAME_PLACEHOLDER = /\b(?:payment|purchase|paiement|achat|unknown|inconnu)\b/i;

function isSuspectName(name: string): boolean {
  // Length FIRST: it is a verdict on its own, and it caps what the regexes
  // ever see (NAME_AMOUNT backtracks quadratically on long digit runs — a
  // malicious clipboard froze the JS thread; 2026-09-14 security audit).
  return (
    name.length > 30 ||
    NAME_AMOUNT.test(name) ||
    NAME_ARTICLE.test(name) ||
    NAME_PLACEHOLDER.test(name)
  );
}

const TIME_UNITS: readonly TimeUnit[] = ["day", "week", "month", "year"];

const asRecord = (value: unknown): Record<string, unknown> | null =>
  typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

const asTrimmedString = (value: unknown): string | undefined =>
  typeof value === "string" && value.trim() !== "" ? value.trim() : undefined;

const asFiniteNumber = (value: unknown): number | undefined =>
  typeof value === "number" && Number.isFinite(value) ? value : undefined;

/** A usable brand color: strict "#RRGGBB", never near-black or near-white
 *  (those are the AI hedging, and they make invisible washes in the UI). */
const readBrandColor = (value: unknown): string | undefined => {
  const hex = asTrimmedString(value);
  if (!hex || !/^#[0-9a-fA-F]{6}$/.test(hex)) return undefined;
  const n = parseInt(hex.slice(1), 16);
  const lum = (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
  return lum > 0.09 && lum < 0.91 ? hex : undefined;
};

/** A v1 reply's `assumed`/`uncertain` lists, kept to the field names we know. */
const asFieldList = (value: unknown): ImportFieldName[] =>
  Array.isArray(value)
    ? (IMPORT_FIELD_NAMES.filter((f) => value.includes(f)) as ImportFieldName[])
    : [];

/** "The 26th" resolved against the calendar: that day of the current month,
 *  clamped to the month's length (31 in February → the 28th/29th). */
function resolveBillingDay(day: number, today: CalendarDate): CalendarDate {
  const year = Number(today.slice(0, 4));
  const month = Number(today.slice(5, 7));
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const clamped = Math.min(Math.max(1, Math.floor(day)), daysInMonth);
  return calendarDate(`${today.slice(0, 7)}-${String(clamped).padStart(2, "0")}`);
}

/** One draft in the making: collects warnings (a STATED value recovered from
 *  junk) and assumptions (an ABSENT value defaulted in code — the v2 posture:
 *  omission is the model's confidence signal) while fields resolve. */
class ItemReader {
  readonly warnings: ImportWarning[] = [];
  /** Fields the input didn't state, filled by a code default. */
  readonly assumed = new Set<ImportFieldName>();

  constructor(private readonly ctx: ImportContext) {}

  warn(code: ImportWarningCode, detail?: string) {
    this.warnings.push(detail === undefined ? { code } : { code, detail });
  }

  currency(value: unknown): CurrencyCode {
    const raw = asTrimmedString(value)?.toUpperCase();
    if (raw && raw in CURRENCIES) return raw as CurrencyCode;
    if (raw) this.warn("currency-defaulted", raw);
    else this.assumed.add("currency");
    return this.ctx.defaultCurrency;
  }

  settlement(value: unknown): "automatic" | "manual" {
    if (value === "manual" || value === "automatic") return value;
    if (value === undefined) this.assumed.add("settlement");
    return "automatic";
  }

  /** Absent → the brand's usual cycle when the bank knows it, else monthly. */
  cadence(value: unknown, brandUnit?: "month" | "year"): RecurrenceRule {
    const record = asRecord(value);
    const unit = asTrimmedString(record?.unit) as TimeUnit | undefined;
    const interval = asFiniteNumber(record?.interval);
    if (record && unit && TIME_UNITS.includes(unit) && interval && interval >= 1) {
      return { unit, interval: Math.floor(interval) };
    }
    if (value === undefined) {
      this.assumed.add("cadence");
      return brandUnit ? { unit: brandUnit, interval: 1 } : RECURRENCE_PRESETS.MONTHLY;
    }
    this.warn("cadence-defaulted");
    return RECURRENCE_PRESETS.MONTHLY;
  }

  /** Format v1 anchors use week 1–5 (5 = last); core uses 1–4 | "last". */
  anchor(value: unknown): MonthlyAnchor | undefined {
    if (value === undefined) return undefined;
    const record = asRecord(value);
    const week = asFiniteNumber(record?.week) ?? (record?.week === "last" ? 5 : undefined);
    const weekday = asFiniteNumber(record?.weekday);
    if (
      record &&
      week !== undefined &&
      week >= 1 &&
      week <= 5 &&
      weekday !== undefined &&
      Number.isInteger(weekday) &&
      weekday >= 0 &&
      weekday <= 6
    ) {
      return {
        week: week === 5 ? "last" : (Math.floor(week) as 1 | 2 | 3 | 4),
        weekday: weekday as MonthlyAnchor["weekday"],
      };
    }
    this.warn("date-defaulted", "anchor");
    return undefined;
  }

  /** The bank-skips-weekends rule: only the two enum strings pass. */
  weekendShift(value: unknown): "before" | "after" | undefined {
    if (value === undefined) return undefined;
    if (value === "before" || value === "after") return value;
    this.warn("date-defaulted", "weekendShift");
    return undefined;
  }

  /** A stated full date wins; a stated-but-broken one recovers to today
   *  (warned); an extracted bare day resolves against the current month;
   *  nothing at all → the 1st of the current month, reported as assumed. */
  firstDate(value: unknown, billingDay: unknown): CalendarDate {
    const raw = asTrimmedString(value);
    if (raw && isCalendarDate(raw)) return raw;
    if (value !== undefined) {
      this.warn("date-defaulted", raw ?? "firstDate");
      return this.ctx.today;
    }
    const day = asFiniteNumber(billingDay);
    if (day !== undefined && day >= 1 && day <= 31) {
      return resolveBillingDay(day, this.ctx.today);
    }
    this.assumed.add("firstDate");
    return resolveBillingDay(1, this.ctx.today);
  }

  optionalDate(value: unknown, field: string): CalendarDate | undefined {
    if (value === undefined) return undefined;
    const raw = asTrimmedString(value);
    if (raw && isCalendarDate(raw)) return raw;
    this.warn("date-defaulted", field);
    return undefined;
  }

  category(value: unknown): string {
    const raw = asTrimmedString(value);
    if (raw && this.ctx.categories.some((c) => c.id === raw)) return raw;
    if (raw) this.warn("category-unknown", raw);
    else this.assumed.add("category");
    return "other";
  }

  /** Matched id, or the unmatched name for the review screen to resolve. */
  account(value: unknown, currency: CurrencyCode): { accountId?: string; accountName?: string } {
    const name = asTrimmedString(value);
    if (!name) return {};
    const match = this.ctx.accounts.find(
      (a) => !a.isArchived && a.name.toLowerCase() === name.toLowerCase(),
    );
    if (!match) {
      this.warn("account-unmatched", name);
      return { accountName: name };
    }
    if (match.currency !== currency) this.warn("currency-mismatch", match.name);
    return { accountId: match.id };
  }

  provider(value: unknown): BnplProviderId | undefined {
    if (value === undefined) return undefined;
    const raw = asTrimmedString(value);
    // Own-property check, not `in`: `"constructor" in {...}` is true via the
    // prototype chain, and a pasted document controls this string.
    if (raw && Object.prototype.hasOwnProperty.call(BNPL_PROVIDERS, raw)) {
      return raw as BnplProviderId;
    }
    this.warn("provider-unknown", raw);
    return undefined;
  }
}

function parseItem(
  value: unknown,
  id: string,
  ctx: ImportContext,
  takenNames: ReadonlySet<string>,
): ImportDraft | null {
  const item = asRecord(value);
  if (!item) return null;

  const name = asTrimmedString(item.name);
  if (!name) return null;

  // A known brand backfills the logo domain and colour the smaller models
  // omit, corrects a punted category, and vouches that the name is real (so a
  // spurious "no real name" flag can be dropped). Exact match, never a guess.
  const brand = findSuggestedBrand(name);

  // Explicit type wins; otherwise infer from which amount field is present.
  const declared = asTrimmedString(item.type);
  const isSplit =
    declared === "split_payment" || (declared === undefined && item.total !== undefined);
  if (declared !== undefined && declared !== "subscription" && declared !== "split_payment") {
    return null;
  }

  const reader = new ItemReader(ctx);
  if (takenNames.has(name.toLowerCase())) reader.warn("duplicate", name);
  const currency = reader.currency(item.currency);
  const settlementMode = reader.settlement(item.settlement);
  let categoryId = reader.category(item.category);
  // A brand knows its own category better than a model that punted to (or
  // never stated) "other" — Amazon Prime is streaming. A bank-resolved
  // category is knowledge, not an assumption, so the flag lifts.
  if (
    categoryId === "other" &&
    brand?.categoryId &&
    ctx.categories.some((c) => c.id === brand.categoryId)
  ) {
    categoryId = brand.categoryId;
    reader.assumed.delete("category");
  }
  const { accountId, accountName } = reader.account(item.account, currency);
  const domain = asTrimmedString(item.domain)?.toLowerCase() ?? brand?.domain;
  // `item.color` is v1-era output; v2 stopped asking (brand color is bank +
  // pixel-tint work now), but a stated one still passes the strict gate.
  const color =
    readBrandColor(item.color) ?? (brand?.color ? readBrandColor(brand.color) : undefined);
  const notes = asTrimmedString(item.notes);
  const reminderDays = asFiniteNumber(item.reminderDaysBefore);
  const reminder =
    reminderDays !== undefined && reminderDays >= 0
      ? { daysBefore: Math.floor(reminderDays) }
      : undefined;
  const firstDate = reader.firstDate(item.firstDate, item.billingDay);
  // Assume the user paid what was due so far, unless the input said otherwise.
  const settlePast = item.backlogUnpaid !== true;
  // The review report. Assumptions are COMPUTED (each absent field the
  // reader defaulted), merged with anything a v1 reply self-declared, in
  // stable field order — assembled at RETURN time, after the branches have
  // read their remaining fields (cadence lives there). Uncertainty is the
  // suspect-name heuristic plus a v1 reply's own flags; a known brand name
  // is real, so its spurious flag (small models over-report it) is dropped.
  const v1Assumed = asFieldList(item.assumed);
  const finishAssumed = (): ImportFieldName[] =>
    IMPORT_FIELD_NAMES.filter(
      (f) => reader.assumed.has(f) || v1Assumed.includes(f),
    ) as ImportFieldName[];
  let uncertainFields = asFieldList(item.uncertain);
  if (brand) {
    uncertainFields = uncertainFields.filter((f) => f !== "name");
  } else if (isSuspectName(name) && !uncertainFields.includes("name")) {
    uncertainFields = ["name", ...uncertainFields];
  }

  const common = {
    name,
    settlementMode,
    categoryId,
    accountId,
    domain: domain && !domain.includes(" ") ? domain : undefined,
    color,
    notes,
    reminder,
    // The list mirrors the single slot (writers keep both in step).
    reminders: reminder ? ([reminder] as const) : undefined,
  } as const;

  if (isSplit) {
    const total = asFiniteNumber(item.total);
    const installments = asFiniteNumber(item.installments);
    if (total === undefined || total <= 0) return null;
    if (installments === undefined || installments < 1) return null;
    const cadence = reader.cadence(item.cadence);
    const input: NewInstallmentInput = {
      ...common,
      totalAmount: fromMajor(total, currency),
      numberOfInstallments: Math.floor(installments),
      recurrence: cadence,
      firstInstallmentDate: firstDate,
      weekendShift: reader.weekendShift(item.weekendShift),
      provider: reader.provider(item.provider),
    };
    return {
      id,
      kind: "split",
      input,
      accountName,
      settlePast,
      assumedFields: finishAssumed(),
      uncertainFields,
      warnings: reader.warnings,
    };
  }

  // No amount at all is not a reason to drop everything else the model read
  // (a policy came back with its cadence, dates and settlement and no
  // premium): it lands at 0 with the amount flagged, for the user to type.
  // A stated negative amount is nonsense and is skipped.
  const statedAmount = asFiniteNumber(item.amount);
  if (statedAmount !== undefined && statedAmount < 0) return null;
  const amount = statedAmount ?? 0;
  if (statedAmount === undefined && !uncertainFields.includes("amount")) {
    uncertainFields = [...uncertainFields, "amount"];
  }
  const anchor = reader.anchor(item.anchor);
  const baseCadence = reader.cadence(item.cadence, brand?.unit);
  const recurrence: RecurrenceRule =
    anchor && baseCadence.unit === "month" ? { ...baseCadence, anchor } : baseCadence;

  let introOffer: IntroOffer | undefined;
  if (item.priceChange !== undefined) {
    const change = asRecord(item.priceChange);
    const newAmount = asFiniteNumber(change?.newAmount);
    const on = asTrimmedString(change?.on);
    if (newAmount !== undefined && newAmount >= 0 && on && isCalendarDate(on)) {
      introOffer = { regularAmount: fromMajor(newAmount, currency), convertsOn: on };
    } else {
      reader.warn("date-defaulted", "priceChange");
    }
  }

  const input: NewRecurringInput = {
    ...common,
    amount: fromMajor(amount, currency),
    recurrence,
    firstChargeDate: firstDate,
    endDate: reader.optionalDate(item.endDate, "endDate"),
    weekendShift: reader.weekendShift(item.weekendShift),
    introOffer,
  };
  return {
    id,
    kind: "subscription",
    input,
    accountName,
    settlePast,
    assumedFields: finishAssumed(),
    uncertainFields,
    warnings: reader.warnings,
  };
}

/** Group signature for the fold below: what makes two rows "the same
 *  commitment" (name, currency, cadence, account). */
function recurringGroupKey(draft: RecurringImportDraft): string {
  const name = draft.input.name.trim().toLowerCase();
  const cadence = `${draft.input.recurrence.unit}:${draft.input.recurrence.interval}`;
  const account = draft.input.accountId ?? draft.accountName?.toLowerCase() ?? "-";
  return `${name}|${draft.input.amount.currency}|${cadence}|${account}`;
}

/** Fold a same-commitment pair the model split across a price change into one
 *  item (the earlier price as the standing amount, the later as a
 *  priceChange). Returns null when it isn't safely a change: matching amounts
 *  (a plain duplicate, left alone) or an offer already present. */
function foldPair(a: RecurringImportDraft, b: RecurringImportDraft): RecurringImportDraft | null {
  if (a.input.introOffer || b.input.introOffer) return null;
  if (a.input.amount.amount === b.input.amount.amount) return null;
  const earlier = a.input.firstChargeDate <= b.input.firstChargeDate ? a : b;
  const later = earlier === a ? b : a;
  return {
    ...a,
    input: {
      ...earlier.input,
      introOffer: {
        regularAmount: later.input.amount,
        convertsOn: later.input.firstChargeDate,
      },
    },
  };
}

/** The small model's most common mistake: emitting a price change over time as
 *  TWO rows with the same name ("Netflix 20 then 24 from January"). Fold those
 *  back into one subscription with a priceChange, deterministically, so the
 *  result never depends on the model wording it "correctly". Conservative:
 *  only merges rows that share name/currency/cadence/account and genuinely
 *  differ in price; the review screen shows the resulting change line, so a
 *  rare wrong merge is visible and one tap to split back. */
function foldPriceChangeSplits(drafts: ImportDraft[]): ImportDraft[] {
  const out: ImportDraft[] = [];
  const indexByKey = new Map<string, number>();
  for (const draft of drafts) {
    if (draft.kind !== "subscription") {
      out.push(draft);
      continue;
    }
    const key = recurringGroupKey(draft);
    const at = indexByKey.get(key);
    if (at !== undefined) {
      const merged = foldPair(out[at] as RecurringImportDraft, draft);
      if (merged) {
        out[at] = merged;
        continue;
      }
    }
    indexByKey.set(key, out.length);
    out.push(draft);
  }
  return out;
}

/**
 * Parse a raw paste into review-ready drafts. Never throws: an unusable paste
 * comes back as `{ drafts: [], skipped: 0, error: "no-json" }`, a valid but
 * empty document as `error: "empty"`.
 */
export function parseImportDocument(raw: string, ctx: ImportContext): ImportParseResult {
  const document = asRecord(extractImportDocument(raw));
  const items = document && Array.isArray(document.items) ? document.items : null;
  if (!items) return { drafts: [], skipped: 0, error: "no-json" };
  if (items.length === 0) return { drafts: [], skipped: 0, error: "empty" };

  const takenNames = new Set((ctx.takenNames ?? []).map((n) => n.trim().toLowerCase()));
  const drafts: ImportDraft[] = [];
  // A hard ceiling on drafts: no honest import carries 500+ items, and an
  // unbounded pasted document must not allocate without limit.
  const bounded = items.slice(0, 500);
  let skipped = items.length - bounded.length;
  for (const value of bounded) {
    const draft = parseItem(value, `draft-${drafts.length + 1}`, ctx, takenNames);
    if (draft) drafts.push(draft);
    else skipped++;
  }
  return { drafts: foldPriceChangeSplits(drafts), skipped };
}
