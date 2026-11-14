// The spreadsheet face of the user's list: one row per item, written for a
// person opening it in Excel or Numbers, and complete enough to come back
// in. Coming back goes through the import format and its parser, so a CSV
// is reviewed like any other import; it carries no payment history, which
// is why it is never a restore (the backup file is).

import { cancelDeadline, isCancelPlanned } from "../models/cancel-plan";
import { occurrencesPerYear } from "../calculations/forecast";
import type { ImportDocument, ImportItem } from "../import/types";
import type { Account } from "../models/account";
import { summarizeInstallmentPlan } from "../models/installment-plan";
import {
  effectiveRecurringAmount,
  isInstallmentSchedule,
  isRecurringSchedule,
  type PaymentItem,
} from "../models/payment-item";
import { isPaymentItemEnded } from "../models/payment-item-status";
import { CURRENCIES } from "../constants/currencies";
import { money, toMajor, type Money } from "../primitives/money";
import type { TimeUnit } from "../primitives/recurrence";
import { reminderRules } from "../primitives/reminder";
import { shiftOffWeekend } from "../primitives/schedule-dates";
import type { CalendarDate } from "../primitives/temporal";

/** The columns, in file order: what a reader looks for first leads. */
export const CSV_COLUMNS = [
  "name",
  "type",
  "amount",
  "currency",
  "every",
  "unit",
  "nextPayment",
  "account",
  "category",
  "payment",
  "status",
  "monthly",
  "yearly",
  "firstPayment",
  "lastPayment",
  "total",
  "installments",
  "paidInstallments",
  "leftToPay",
  "provider",
  "newPrice",
  "changesOn",
  "cancelBy",
  "reminderDays",
  "weekend",
  "weekdayRule",
  "website",
  "notes",
] as const;

export type CsvColumn = (typeof CSV_COLUMNS)[number];

/** Every word the file shows, supplied by the platform in the user's
 *  language. Reading accepts any of the label sets it is given. */
export interface CsvLabels {
  columns: Record<CsvColumn, string>;
  type: { subscription: string; split: string };
  payment: { automatic: string; manual: string };
  status: { active: string; paused: string; ended: string; toCancel: string };
  unit: Record<TimeUnit, string>;
  weekend: { before: string; after: string };
}

export interface CsvExportOptions {
  asOf: CalendarDate;
  labels: CsvLabels;
  /** Decimal comma and semicolon separator: what Excel expects wherever
   *  numbers are written "17,90". Otherwise decimal point and comma. */
  decimalComma: boolean;
  accounts: readonly Account[];
  /** The category's display name (built-ins are localized by the platform). */
  categoryName: (categoryId: string) => string | undefined;
}

const BOM = "\uFEFF";

/** A cell a spreadsheet would run as a formula is written as text. */
const FORMULA_START = /^[=+\-@\t\r]/;

function cell(value: string, separator: string): string {
  const safe = FORMULA_START.test(value) ? `'${value}` : value;
  return safe.includes('"') || safe.includes(separator) || /[\r\n]/.test(safe)
    ? `"${safe.replace(/"/g, '""')}"`
    : safe;
}

function amountText(value: Money, decimalComma: boolean): string {
  const text = toMajor(value).toFixed(CURRENCIES[value.currency].decimalDigits);
  return decimalComma ? text.replace(".", ",") : text;
}

/** The list as CSV text (UTF-8 with a BOM so Excel reads the accents). */
export function itemsToCsv(items: readonly PaymentItem[], options: CsvExportOptions): string {
  const { asOf, labels, decimalComma } = options;
  const separator = decimalComma ? ";" : ",";
  const amount = (value: Money | undefined) => (value ? amountText(value, decimalComma) : "");
  const accountName = (id?: string) => options.accounts.find((a) => a.id === id)?.name ?? "";

  const rows = items.flatMap((item): { sort: string; cells: Record<CsvColumn, string> }[] => {
    const cells = Object.fromEntries(CSV_COLUMNS.map((c) => [c, ""])) as Record<CsvColumn, string>;
    cells.name = item.name;
    cells.account = accountName(item.accountId);
    cells.category = (item.categoryId && options.categoryName(item.categoryId)) || "";
    cells.payment = labels.payment[item.settlementMode];
    const reminder = reminderRules(item)[0];
    cells.reminderDays = reminder ? String(reminder.daysBefore) : "";
    cells.weekend = item.weekendShift ? labels.weekend[item.weekendShift] : "";
    cells.website = item.domain ?? "";
    cells.notes = item.notes ?? "";
    const ended = isPaymentItemEnded(item, asOf);
    cells.status =
      item.status === "paused"
        ? labels.status.paused
        : ended
          ? labels.status.ended
          : isCancelPlanned(item)
            ? labels.status.toCancel
            : labels.status.active;
    const running = item.status === "active" && !ended;

    if (isRecurringSchedule(item.schedule)) {
      const schedule = item.schedule;
      const rule = schedule.recurrence;
      const current = effectiveRecurringAmount(schedule, asOf);
      cells.type = labels.type.subscription;
      cells.amount = amount(current);
      cells.currency = current.currency;
      cells.every = String(rule.interval);
      cells.unit = labels.unit[rule.unit];
      cells.firstPayment = schedule.firstChargeDate;
      cells.lastPayment = schedule.endDate ?? "";
      if (rule.anchor) {
        cells.weekdayRule = `${rule.anchor.week === "last" ? 5 : rule.anchor.week}-${rule.anchor.weekday}`;
      }
      if (schedule.introOffer && schedule.introOffer.convertsOn > asOf) {
        cells.newPrice = amount(schedule.introOffer.regularAmount);
        cells.changesOn = schedule.introOffer.convertsOn;
      }
      if (running) {
        const perYear = current.amount * occurrencesPerYear(rule);
        cells.nextPayment = shiftOffWeekend(schedule.nextChargeDate, item.weekendShift);
        cells.monthly = amount(money(Math.round(perYear / 12), current.currency));
        cells.yearly = amount(money(Math.round(perYear), current.currency));
        if (isCancelPlanned(item)) cells.cancelBy = cancelDeadline(item) ?? "";
      }
    } else if (isInstallmentSchedule(item.schedule)) {
      const schedule = item.schedule;
      const plan = summarizeInstallmentPlan(schedule);
      cells.type = labels.type.split;
      cells.amount = amount(schedule.installments[0]?.amount);
      cells.currency = schedule.totalAmount.currency;
      cells.every = String(schedule.recurrence.interval);
      cells.unit = labels.unit[schedule.recurrence.unit];
      cells.firstPayment = schedule.firstInstallmentDate;
      cells.lastPayment = plan.finalDueDate;
      cells.total = amount(plan.totalAmount);
      cells.installments = String(plan.totalCount);
      cells.paidInstallments = String(plan.paidCount);
      cells.leftToPay = amount(plan.remainingAmount);
      cells.provider = schedule.provider ?? "";
      if (item.status === "active") cells.nextPayment = plan.nextDue?.dueDate ?? "";
    } else {
      return [];
    }
    // Next payment first; everything without one follows, by name.
    return [{ sort: `${cells.nextPayment || "9999"} ${item.name.toLowerCase()}`, cells }];
  });

  rows.sort((a, b) => (a.sort < b.sort ? -1 : a.sort > b.sort ? 1 : 0));
  const line = (values: string[]) => values.map((v) => cell(v, separator)).join(separator);
  return (
    BOM +
    [
      line(CSV_COLUMNS.map((c) => labels.columns[c])),
      ...rows.map((row) => line(CSV_COLUMNS.map((c) => row.cells[c]))),
    ].join("\r\n") +
    "\r\n"
  );
}

// ---------------------------------------------------------------- reading

/** Quoted-field CSV into rows of cells. */
function splitCsv(text: string, separator: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"' && field === "") quoted = true;
    else if (ch === separator) {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      rows.push(row);
      row = [];
    } else field += ch;
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

const norm = (value: string) => value.trim().toLowerCase();

/** "1 234,50", "1'234.50", "17.9" → a number; anything else → undefined. */
function readNumber(value: string): number | undefined {
  let text = value.replace(/[\s\u00A0'’]/g, "");
  if (text === "") return undefined;
  const comma = text.lastIndexOf(",");
  const dot = text.lastIndexOf(".");
  if (comma > dot) text = text.replace(/\./g, "").replace(",", ".");
  else text = text.replace(/,/g, "");
  const number = Number(text);
  return Number.isFinite(number) ? number : undefined;
}

/** ISO as written, or the DD.MM.YYYY / DD/MM/YYYY a spreadsheet may have
 *  turned it into on save. */
function readDate(value: string): string | undefined {
  const text = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  const match = /^(\d{1,2})[./](\d{1,2})[./](\d{4})$/.exec(text);
  return match
    ? `${match[3]}-${match[2].padStart(2, "0")}-${match[1].padStart(2, "0")}`
    : undefined;
}

/** The key whose label (in any label set) matches the cell. */
function readChoice<K extends string>(
  value: string,
  labelSets: readonly CsvLabels[],
  pick: (labels: CsvLabels) => Record<K, string>,
): K | undefined {
  const wanted = norm(value);
  if (wanted === "") return undefined;
  for (const labels of labelSets) {
    for (const [key, label] of Object.entries<string>(pick(labels))) {
      if (norm(label) === wanted) return key as K;
    }
  }
  return undefined;
}

export interface CsvImportOptions {
  /** Every language the file may be written in. */
  labelSets: readonly CsvLabels[];
  /** A category's id from the name the file shows. */
  categoryId: (name: string) => string | undefined;
}

/**
 * A Keel CSV as an import document, ready for `parseImportDocument`. Returns
 * null when the text is not one (no header row naming at least the name,
 * the type and an amount). Columns the file lacks are simply left out: the
 * parser defaults them and the review screen says so.
 */
export function csvToImportDocument(raw: string, options: CsvImportOptions): ImportDocument | null {
  const text = raw.replace(/^\uFEFF/, "");
  const firstLine = text.split(/\r?\n/, 1)[0] ?? "";
  let best: { rows: string[][]; index: Map<CsvColumn, number> } | null = null;
  for (const separator of [";", ",", "\t"]) {
    if (!firstLine.includes(separator)) continue;
    const rows = splitCsv(text, separator);
    const index = new Map<CsvColumn, number>();
    (rows[0] ?? []).forEach((header, position) => {
      const column = readChoice(header, options.labelSets, (l) => l.columns);
      if (column && !index.has(column)) index.set(column, position);
    });
    if (!best || index.size > best.index.size) best = { rows, index };
  }
  if (
    !best ||
    !best.index.has("name") ||
    !best.index.has("type") ||
    !(best.index.has("amount") || best.index.has("total"))
  ) {
    return null;
  }

  const { rows, index } = best;
  const items: ImportItem[] = [];
  for (const row of rows.slice(1)) {
    const get = (column: CsvColumn) => {
      const position = index.get(column);
      const value = position === undefined ? "" : (row[position] ?? "").trim();
      // Undo the formula guard written on export.
      return /^'[=+\-@]/.test(value) ? value.slice(1) : value;
    };
    const name = get("name");
    const type = readChoice(get("type"), options.labelSets, (l) => l.type);
    if (!name || !type) continue;

    const unit = readChoice(get("unit"), options.labelSets, (l) => l.unit);
    const interval = readNumber(get("every"));
    const reminderDays = readNumber(get("reminderDays"));
    const common = {
      name,
      ...(get("currency") && { currency: get("currency").toUpperCase() }),
      settlement: readChoice(get("payment"), options.labelSets, (l) => l.payment),
      category: options.categoryId(get("category")),
      ...(unit && interval && { cadence: { unit, interval } }),
      firstDate: readDate(get("firstPayment")),
      ...(get("account") && { account: get("account") }),
      ...(get("website") && { domain: get("website") }),
      ...(get("notes") && { notes: get("notes") }),
      ...(reminderDays !== undefined && { reminderDaysBefore: reminderDays }),
    };

    if (type === "split") {
      const total = readNumber(get("total"));
      const installments = readNumber(get("installments"));
      if (total === undefined || installments === undefined) continue;
      items.push({
        ...common,
        type: "split_payment",
        total,
        installments,
        ...(get("provider") && { provider: get("provider") }),
      });
      continue;
    }

    const amount = readNumber(get("amount"));
    if (amount === undefined) continue;
    const anchor = /^([1-5])-([0-6])$/.exec(get("weekdayRule"));
    const newPrice = readNumber(get("newPrice"));
    const changesOn = readDate(get("changesOn"));
    items.push({
      ...common,
      type: "subscription",
      amount,
      endDate: readDate(get("lastPayment")),
      ...(anchor && { anchor: { week: Number(anchor[1]), weekday: Number(anchor[2]) } }),
      weekendShift: readChoice(get("weekend"), options.labelSets, (l) => l.weekend),
      ...(newPrice !== undefined &&
        changesOn && { priceChange: { newAmount: newPrice, on: changesOn } }),
    });
  }
  return { items };
}
