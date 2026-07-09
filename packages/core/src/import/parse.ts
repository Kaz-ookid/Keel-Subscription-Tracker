// The tolerant parser: raw pasted text → ready-to-review ImportDrafts.
// Philosophy (§6.1): recover wherever a safe default exists and WARN — the
// review screen is the net, and fixing a flagged field there must stay faster
// than typing the item from scratch. Only an item missing its essentials
// (a name, a usable amount) is skipped, and skips are counted, never silent.

import { BNPL_PROVIDERS, type BnplProviderId } from "../constants/bnpl-providers";
import { CURRENCIES, type CurrencyCode } from "../constants/currencies";
import type { Account } from "../models/account";
import type { Category } from "../models/category";
import type { IntroOffer } from "../models/payment-item";
import type { NewInstallmentInput, NewRecurringInput } from "../models/payment-item-factory";
import { fromMajor } from "../primitives/money";
import type { MonthlyAnchor, RecurrenceRule, TimeUnit } from "../primitives/recurrence";
import { RECURRENCE_PRESETS } from "../primitives/recurrence";
import { isCalendarDate, type CalendarDate } from "../primitives/temporal";
import { extractImportDocument } from "./extract";
import type { ImportDraft, ImportParseResult, ImportWarning, ImportWarningCode } from "./types";

export interface ImportContext {
  /** Used when an item states no usable currency. */
  defaultCurrency: CurrencyCode;
  /** Anchors the "invalid first date" fallback. */
  today: CalendarDate;
  /** Existing accounts, matched by name (case-insensitive). */
  accounts: readonly Account[];
  /** Known categories (built-in + user-created), validated by id. */
  categories: readonly Category[];
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

/** One draft in the making: collects warnings while fields resolve. */
class ItemReader {
  readonly warnings: ImportWarning[] = [];

  constructor(private readonly ctx: ImportContext) {}

  warn(code: ImportWarningCode, detail?: string) {
    this.warnings.push(detail === undefined ? { code } : { code, detail });
  }

  currency(value: unknown): CurrencyCode {
    const raw = asTrimmedString(value)?.toUpperCase();
    if (raw && raw in CURRENCIES) return raw as CurrencyCode;
    if (raw) this.warn("currency-defaulted", raw);
    return this.ctx.defaultCurrency;
  }

  cadence(value: unknown): RecurrenceRule {
    const record = asRecord(value);
    const unit = asTrimmedString(record?.unit) as TimeUnit | undefined;
    const interval = asFiniteNumber(record?.interval);
    if (record && unit && TIME_UNITS.includes(unit) && interval && interval >= 1) {
      return { unit, interval: Math.floor(interval) };
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

  firstDate(value: unknown): CalendarDate {
    const raw = asTrimmedString(value);
    if (raw && isCalendarDate(raw)) return raw;
    this.warn("date-defaulted", raw ?? "firstDate");
    return this.ctx.today;
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
    if (raw && raw in BNPL_PROVIDERS) return raw as BnplProviderId;
    this.warn("provider-unknown", raw);
    return undefined;
  }
}

function parseItem(value: unknown, id: string, ctx: ImportContext): ImportDraft | null {
  const item = asRecord(value);
  if (!item) return null;

  const name = asTrimmedString(item.name);
  if (!name) return null;

  // Explicit type wins; otherwise infer from which amount field is present.
  const declared = asTrimmedString(item.type);
  const isSplit =
    declared === "split_payment" || (declared === undefined && item.total !== undefined);
  if (declared !== undefined && declared !== "subscription" && declared !== "split_payment") {
    return null;
  }

  const reader = new ItemReader(ctx);
  const currency = reader.currency(item.currency);
  const settlementMode = item.settlement === "manual" ? "manual" : "automatic";
  const categoryId = reader.category(item.category);
  const { accountId, accountName } = reader.account(item.account, currency);
  const domain = asTrimmedString(item.domain)?.toLowerCase();
  const notes = asTrimmedString(item.notes);
  const reminderDays = asFiniteNumber(item.reminderDaysBefore);
  const reminder =
    reminderDays !== undefined && reminderDays >= 0
      ? { daysBefore: Math.floor(reminderDays) }
      : undefined;
  const firstDate = reader.firstDate(item.firstDate);
  // Assume the user paid what was due so far, unless the input said otherwise.
  const settlePast = item.backlogUnpaid !== true;

  const common = {
    name,
    settlementMode,
    categoryId,
    accountId,
    domain: domain && !domain.includes(" ") ? domain : undefined,
    notes,
    reminder,
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
      provider: reader.provider(item.provider),
    };
    return { id, kind: "split", input, accountName, settlePast, warnings: reader.warnings };
  }

  const amount = asFiniteNumber(item.amount);
  if (amount === undefined || amount < 0) return null;
  const anchor = reader.anchor(item.anchor);
  const baseCadence = reader.cadence(item.cadence);
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
    introOffer,
  };
  return { id, kind: "subscription", input, accountName, settlePast, warnings: reader.warnings };
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

  const drafts: ImportDraft[] = [];
  let skipped = 0;
  for (const value of items) {
    const draft = parseItem(value, `draft-${drafts.length + 1}`, ctx);
    if (draft) drafts.push(draft);
    else skipped++;
  }
  return { drafts, skipped };
}
