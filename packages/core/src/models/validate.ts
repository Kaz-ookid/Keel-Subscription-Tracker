// Structural validation for entities arriving from OUTSIDE the running app:
// restored backup files, hand-edited JSON, blobs written by other app
// versions, one day iCloud copies. The parsers stay lenient about the
// envelope; these guards make sure each ENTRY is a shape the calculations
// and screens can safely consume, so one corrupt record costs one record,
// never a crash. Contract: an entry either passes whole (every field that
// exists is well-typed, enum values are known) or it is rejected.
//
// Deliberately structural, not semantic: a date is "a calendar date", not
// "a date that makes sense for this schedule". Currencies are shape-checked
// (three capital letters), not membership-checked, so a backup from a build
// that knows more currencies than this one still restores.

import type { SuggestedCommitment } from "../constants/suggestions";
import type { Money } from "../primitives/money";
import type { MonthlyAnchor, RecurrenceRule } from "../primitives/recurrence";
import type { ReminderRule } from "../primitives/reminder";
import type { Account } from "./account";
import type { Category } from "./category";
import type { Installment } from "./installment";
import type {
  InstallmentSchedule,
  IntroOffer,
  OneTimeAnnualSchedule,
  PaymentItem,
  PriceHistoryEntry,
  RecurringSchedule,
  Schedule,
} from "./payment-item";
import type { PaymentOccurrence } from "./payment-occurrence";

type Raw = Record<string, unknown>;

function isObject(value: unknown): value is Raw {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

/** Present-or-absent helper: `undefined` is fine, anything else must pass. */
function optional(value: unknown, guard: (v: unknown) => boolean): boolean {
  return value === undefined || guard(value);
}

const CALENDAR_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function isValidCalendarDate(value: unknown): boolean {
  return typeof value === "string" && CALENDAR_DATE.test(value);
}

export function isValidMoney(value: unknown): value is Money {
  return (
    isObject(value) &&
    typeof value.amount === "number" &&
    Number.isFinite(value.amount) &&
    typeof value.currency === "string" &&
    /^[A-Z]{3}$/.test(value.currency)
  );
}

function isValidAnchor(value: unknown): value is MonthlyAnchor {
  if (!isObject(value)) return false;
  const weekOk =
    value.week === "last" || (typeof value.week === "number" && [1, 2, 3, 4].includes(value.week));
  const weekdayOk =
    typeof value.weekday === "number" &&
    Number.isInteger(value.weekday) &&
    value.weekday >= 0 &&
    value.weekday <= 6;
  return weekOk && weekdayOk;
}

export function isValidRecurrence(value: unknown): value is RecurrenceRule {
  return (
    isObject(value) &&
    (value.unit === "day" ||
      value.unit === "week" ||
      value.unit === "month" ||
      value.unit === "year") &&
    typeof value.interval === "number" &&
    Number.isInteger(value.interval) &&
    value.interval >= 1 &&
    optional(value.anchor, isValidAnchor)
  );
}

function isValidReminder(value: unknown): value is ReminderRule {
  return (
    isObject(value) &&
    typeof value.daysBefore === "number" &&
    Number.isInteger(value.daysBefore) &&
    value.daysBefore >= 0 &&
    optional(value.hour, (h) => typeof h === "number" && Number.isInteger(h) && h >= 0 && h <= 23)
  );
}

function isValidPriceHistoryEntry(value: unknown): value is PriceHistoryEntry {
  return isObject(value) && isValidMoney(value.amount) && isValidCalendarDate(value.effectiveFrom);
}

function isValidIntroOffer(value: unknown): value is IntroOffer {
  return (
    isObject(value) && isValidMoney(value.regularAmount) && isValidCalendarDate(value.convertsOn)
  );
}

const INSTALLMENT_STATUS = new Set([
  "upcoming",
  "due_soon",
  "paid",
  "late",
  "skipped",
  "settled_early",
]);

function isValidInstallment(value: unknown): value is Installment {
  return (
    isObject(value) &&
    isNonEmptyString(value.id) &&
    typeof value.installmentScheduleId === "string" &&
    typeof value.index === "number" &&
    Number.isInteger(value.index) &&
    isValidCalendarDate(value.dueDate) &&
    isValidMoney(value.amount) &&
    typeof value.status === "string" &&
    INSTALLMENT_STATUS.has(value.status) &&
    optional(value.paidDate, isValidCalendarDate) &&
    optional(value.paidFromAccountId, isNonEmptyString)
  );
}

function isValidRecurringSchedule(value: Raw): value is Raw & RecurringSchedule {
  return (
    value.kind === "RECURRING" &&
    isValidRecurrence(value.recurrence) &&
    isValidMoney(value.amount) &&
    isValidCalendarDate(value.firstChargeDate) &&
    isValidCalendarDate(value.nextChargeDate) &&
    optional(value.endDate, isValidCalendarDate) &&
    Array.isArray(value.priceHistory) &&
    value.priceHistory.every(isValidPriceHistoryEntry) &&
    optional(value.introOffer, isValidIntroOffer)
  );
}

function isValidInstallmentSchedule(value: Raw): value is Raw & InstallmentSchedule {
  return (
    value.kind === "INSTALLMENT" &&
    isValidMoney(value.totalAmount) &&
    typeof value.numberOfInstallments === "number" &&
    Number.isInteger(value.numberOfInstallments) &&
    value.numberOfInstallments >= 1 &&
    isValidRecurrence(value.recurrence) &&
    isValidCalendarDate(value.firstInstallmentDate) &&
    Array.isArray(value.installments) &&
    value.installments.every(isValidInstallment) &&
    optional(value.provider, isNonEmptyString) &&
    optional(value.originalPurchase, (v) => typeof v === "string")
  );
}

function isValidOneTimeAnnualSchedule(value: Raw): value is Raw & OneTimeAnnualSchedule {
  return (
    value.kind === "ONE_TIME_ANNUAL" &&
    isValidMoney(value.amount) &&
    isValidCalendarDate(value.dueDate) &&
    typeof value.recurrenceYearly === "boolean" &&
    typeof value.smoothIntoMonthlyBudget === "boolean"
  );
}

function isValidSchedule(value: unknown): value is Schedule {
  if (!isObject(value)) return false;
  if (value.kind === "RECURRING") return isValidRecurringSchedule(value);
  if (value.kind === "INSTALLMENT") return isValidInstallmentSchedule(value);
  if (value.kind === "ONE_TIME_ANNUAL") return isValidOneTimeAnnualSchedule(value);
  return false;
}

const ITEM_STATUS = new Set(["active", "paused", "completed", "cancelled"]);

/** The load-bearing guard: everything the forecasts, mutations and screens
 *  read off a PaymentItem, verified. The schedule/scheduleType pair must
 *  agree, or downstream narrowing lies. */
export function isValidPaymentItem(value: unknown): value is PaymentItem {
  if (!isObject(value)) return false;
  return (
    isNonEmptyString(value.id) &&
    typeof value.name === "string" &&
    (value.settlementMode === "automatic" || value.settlementMode === "manual") &&
    optional(value.accountId, isNonEmptyString) &&
    optional(value.categoryId, isNonEmptyString) &&
    optional(value.color, (v) => typeof v === "string") &&
    optional(value.domain, (v) => typeof v === "string") &&
    optional(value.reminder, isValidReminder) &&
    isValidSchedule(value.schedule) &&
    value.scheduleType === (value.schedule as Schedule).kind &&
    typeof value.status === "string" &&
    ITEM_STATUS.has(value.status) &&
    optional(value.notes, (v) => typeof v === "string") &&
    typeof value.createdAt === "string" &&
    typeof value.updatedAt === "string"
  );
}

const OCCURRENCE_STATUS = new Set(["upcoming", "charged", "failed", "refunded", "skipped"]);

export function isValidPaymentOccurrence(value: unknown): value is PaymentOccurrence {
  if (!isObject(value)) return false;
  return (
    isNonEmptyString(value.id) &&
    isNonEmptyString(value.paymentItemId) &&
    isValidCalendarDate(value.dueDate) &&
    optional(value.chargedDate, isValidCalendarDate) &&
    isValidMoney(value.amount) &&
    typeof value.status === "string" &&
    OCCURRENCE_STATUS.has(value.status) &&
    optional(value.paidDate, isValidCalendarDate) &&
    optional(value.paidFromAccountId, isNonEmptyString) &&
    typeof value.recordedAt === "string"
  );
}

const ACCOUNT_TYPE = new Set(["checking", "savings", "credit_card", "other"]);

export function isValidAccount(value: unknown): value is Account {
  if (!isObject(value)) return false;
  return (
    isNonEmptyString(value.id) &&
    typeof value.name === "string" &&
    optional(value.institution, (v) => typeof v === "string") &&
    typeof value.currency === "string" &&
    /^[A-Z]{3}$/.test(value.currency) &&
    typeof value.type === "string" &&
    ACCOUNT_TYPE.has(value.type) &&
    typeof value.color === "string" &&
    typeof value.icon === "string" &&
    optional(value.trackedBalance, isValidMoney) &&
    typeof value.isArchived === "boolean"
  );
}

export function isValidCategory(value: unknown): value is Category {
  if (!isObject(value)) return false;
  return (
    isNonEmptyString(value.id) && typeof value.name === "string" && typeof value.icon === "string"
  );
}

export function isValidSuggestedCommitment(value: unknown): value is SuggestedCommitment {
  if (!isObject(value)) return false;
  return (
    isNonEmptyString(value.id) &&
    typeof value.name === "string" &&
    (value.unit === "month" || value.unit === "year")
  );
}

/** Keep the valid entries, count the rest — the restore path's helper. */
export function filterValid<T>(
  values: unknown[],
  guard: (value: unknown) => value is T,
): { kept: T[]; dropped: number } {
  const kept = values.filter(guard);
  return { kept, dropped: values.length - kept.length };
}
