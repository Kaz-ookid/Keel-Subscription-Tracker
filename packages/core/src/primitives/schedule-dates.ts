// Minimal calendar-date stepping: advancing a date by a RecurrenceRule. This
// bridges `temporal` (CalendarDate) and `recurrence` (RecurrenceRule). It is
// deliberately just *stepping* — finding the next due date — not forecasting or
// budget-smoothing, which stay deferred to the §7 calculation milestone.

import type { RecurrenceRule } from "./recurrence";
import { calendarDate, type CalendarDate } from "./temporal";

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/**
 * Add one recurrence interval to a calendar date. Day/week stepping is exact;
 * month/year stepping clamps the day to the target month's length so
 * "Jan 31 + 1 month" → "Feb 28" (or "Feb 29" in a leap year) rather than
 * overflowing into March.
 */
export function addRecurrence(date: CalendarDate, rule: RecurrenceRule): CalendarDate {
  const [y, m, d] = date.split("-").map(Number);

  if (rule.unit === "day" || rule.unit === "week") {
    const days = rule.interval * (rule.unit === "week" ? 7 : 1);
    const stepped = new Date(Date.UTC(y, m - 1, d + days));
    return calendarDate(
      `${stepped.getUTCFullYear()}-${pad(stepped.getUTCMonth() + 1)}-${pad(stepped.getUTCDate())}`,
    );
  }

  const monthsToAdd = rule.interval * (rule.unit === "year" ? 12 : 1);
  const totalMonths = m - 1 + monthsToAdd;
  const targetYear = y + Math.floor(totalMonths / 12);
  const targetMonth = totalMonths % 12; // 0-based
  // Day 0 of the *next* month gives the last day of the target month.
  const daysInTargetMonth = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
  const clampedDay = Math.min(d, daysInTargetMonth);
  return calendarDate(`${targetYear}-${pad(targetMonth + 1)}-${pad(clampedDay)}`);
}

/**
 * The first occurrence strictly after `asOf`, starting from `firstChargeDate`
 * and stepping by `rule`. If `firstChargeDate` is already after `asOf`, it is
 * returned unchanged (the first charge hasn't happened yet).
 */
export function nextDueDate(
  firstChargeDate: CalendarDate,
  rule: RecurrenceRule,
  asOf: CalendarDate,
): CalendarDate {
  let due = firstChargeDate;
  // CalendarDate is YYYY-MM-DD, so string comparison is chronological.
  while (due <= asOf) {
    due = addRecurrence(due, rule);
  }
  return due;
}

/**
 * The first `count` occurrence dates of a schedule: `first`, then stepping by
 * `rule`. The grid every due/end date of a schedule must sit on.
 */
export function listOccurrenceDates(
  first: CalendarDate,
  rule: RecurrenceRule,
  count: number,
): CalendarDate[] {
  const dates: CalendarDate[] = [];
  let due = first;
  for (let i = 0; i < count; i++) {
    dates.push(due);
    due = addRecurrence(due, rule);
  }
  return dates;
}

/** The last day of `date`'s month — e.g. 2026-02-10 → 2026-02-28. */
export function endOfMonth(date: CalendarDate): CalendarDate {
  const [y, m] = date.split("-").map(Number);
  // Day 0 of the next month is the last day of this one.
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return calendarDate(`${y}-${pad(m)}-${pad(lastDay)}`);
}

/**
 * Snap `date` onto the schedule's occurrence grid: the latest occurrence that
 * is ≤ `date`. A `date` before `first` clamps to `first` (an end date before
 * the first billing means a single payment, not "never ends").
 */
export function alignToOccurrence(
  first: CalendarDate,
  rule: RecurrenceRule,
  date: CalendarDate,
): CalendarDate {
  if (date <= first) return first;
  let current = first;
  for (;;) {
    const next = addRecurrence(current, rule);
    if (next > date) return current;
    current = next;
  }
}
