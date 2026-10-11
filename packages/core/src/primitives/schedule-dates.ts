// Minimal calendar-date stepping: advancing a date by a RecurrenceRule. This
// bridges `temporal` (CalendarDate) and `recurrence` (RecurrenceRule). It is
// deliberately just *stepping* — finding the next due date — not forecasting or
// budget-smoothing, which stay deferred to the §7 calculation milestone.

import type { MonthlyAnchor, RecurrenceRule } from "./recurrence";
import { calendarDate, type CalendarDate } from "./temporal";

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function weekdayOf(date: CalendarDate): number {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/** Resolve an anchor inside a given month: "1st Thursday of 2026-06". */
export function nthWeekdayOfMonth(monthOf: CalendarDate, anchor: MonthlyAnchor): CalendarDate {
  const [y, m] = monthOf.split("-").map(Number);
  if (anchor.week === "last") {
    const lastDay = new Date(Date.UTC(y, m, 0)); // day 0 of next month
    const back = (lastDay.getUTCDay() - anchor.weekday + 7) % 7;
    return calendarDate(`${y}-${pad(m)}-${pad(lastDay.getUTCDate() - back)}`);
  }
  const first = new Date(Date.UTC(y, m - 1, 1));
  const forward = (anchor.weekday - first.getUTCDay() + 7) % 7;
  return calendarDate(`${y}-${pad(m)}-${pad(1 + forward + (anchor.week - 1) * 7)}`);
}

/** Which weekday-of-its-month a date is — the inverse of `nthWeekdayOfMonth`.
 *  A 5th occurrence derives as "last" (there is no "5th Thursday" anchor). */
export function anchorFromDate(date: CalendarDate): MonthlyAnchor {
  const day = Number(date.slice(8, 10));
  const occurrence = Math.ceil(day / 7);
  return {
    week: occurrence >= 5 ? "last" : (occurrence as 1 | 2 | 3 | 4),
    weekday: weekdayOf(date) as MonthlyAnchor["weekday"],
  };
}

/**
 * Add one recurrence interval to a calendar date. Day/week stepping is exact;
 * month/year stepping clamps the day to the target month's length so
 * "Jan 31 + 1 month" → "Feb 28" (or "Feb 29" in a leap year) rather than
 * overflowing into March. `anchorDay` is the day-of-month the GRID is
 * anchored on: stepping from a clamped Feb 28 with anchor 31 lands on Mar
 * 31, not Mar 28. Without it, the step clamps from `date`'s own day (a
 * plain "one month from now", not a schedule step: see nextOnGrid).
 */
export function addRecurrence(
  date: CalendarDate,
  rule: RecurrenceRule,
  anchorDay?: number,
): CalendarDate {
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

  // Weekday-anchored monthly rules resolve "1st Thursday" in the target
  // month instead of clamping a day number.
  if (rule.unit === "month" && rule.anchor) {
    return nthWeekdayOfMonth(calendarDate(`${targetYear}-${pad(targetMonth + 1)}-01`), rule.anchor);
  }

  // Day 0 of the *next* month gives the last day of the target month.
  const daysInTargetMonth = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
  const clampedDay = Math.min(anchorDay ?? d, daysInTargetMonth);
  return calendarDate(`${targetYear}-${pad(targetMonth + 1)}-${pad(clampedDay)}`);
}

/** The day-of-month a schedule's grid is anchored on. */
function anchorDayOf(first: CalendarDate): number {
  return Number(first.slice(8, 10));
}

/**
 * The next occurrence after `due` on the grid that starts at `first`: the
 * one step every cursor advance must use, so a subscription billed on the
 * 31st comes back to the 31st after February instead of drifting to the
 * 28th for the rest of its life.
 */
export function nextOnGrid(
  first: CalendarDate,
  rule: RecurrenceRule,
  due: CalendarDate,
): CalendarDate {
  return addRecurrence(due, rule, anchorDayOf(first));
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
    due = nextOnGrid(firstChargeDate, rule, due);
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
    due = nextOnGrid(first, rule, due);
  }
  return dates;
}

/** Which side of a weekend a shifted charge lands on. */
export type WeekendShift = "before" | "after";

/**
 * The working day the money actually moves, for items whose bank never
 * debits on a weekend: Saturday/Sunday step to the Friday before or the
 * Monday after. The recurrence GRID stays canonical (the 1st shifts to the
 * 3rd, but next month is still anchored on the 1st) — this is a pure
 * projection applied where a date faces the outside world, never a
 * mutation of the stepping itself.
 */
export function shiftOffWeekend(date: CalendarDate, shift?: WeekendShift): CalendarDate {
  if (!shift) return date;
  const weekday = weekdayOf(date);
  if (weekday === 6) return addDays(date, shift === "before" ? -1 : 2);
  if (weekday === 0) return addDays(date, shift === "before" ? -2 : 1);
  return date;
}

/** Step a calendar date by whole days (negative allowed — "3 days before"). */
export function addDays(date: CalendarDate, days: number): CalendarDate {
  const [y, m, d] = date.split("-").map(Number);
  const stepped = new Date(Date.UTC(y, m - 1, d + days));
  return calendarDate(
    `${stepped.getUTCFullYear()}-${pad(stepped.getUTCMonth() + 1)}-${pad(stepped.getUTCDate())}`,
  );
}

/** Whole days from `a` to `b` (negative when `b` is earlier). UTC, so DST
 *  can never make a day count fractional. */
export function daysBetween(a: CalendarDate, b: CalendarDate): number {
  const utc = (date: CalendarDate) => {
    const [y, m, d] = date.split("-").map(Number);
    return Date.UTC(y, m - 1, d);
  };
  return Math.round((utc(b) - utc(a)) / 86_400_000);
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
    const next = nextOnGrid(first, rule, current);
    if (next > date) return current;
    current = next;
  }
}
