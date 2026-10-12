// Overdue-summary ("digest") schedules: when the daily, weekly or monthly
// reminder that lists everything still unpaid should fire. Pure calendar
// math on CalendarDate strings; the app turns the dates into notifications.

import { addDays } from "../primitives/schedule-dates";
import { calendarDate, type CalendarDate } from "../primitives/temporal";

export type DigestRule =
  | { mode: "off" }
  | { mode: "daily" }
  /** `weekday` follows the JS convention (0 = Sunday). */
  | { mode: "weekly"; weekday: number }
  /** `day` is 1..28, so every month has it and nothing needs clamping. */
  | { mode: "monthly"; day: number };

function weekdayOf(date: CalendarDate): number {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

const pad = (n: number) => String(n).padStart(2, "0");

/** The next `count` dates matching the rule, starting on or after `asOf`.
 *  A same-day date whose fire hour already passed is the scheduler's to
 *  drop (its past-instant guard), so there is no off-by-one dance here. */
export function nextDigestDates(
  rule: DigestRule,
  asOf: CalendarDate,
  count: number,
): CalendarDate[] {
  if (rule.mode === "off") return [];
  const dates: CalendarDate[] = [];
  if (rule.mode === "daily") {
    let cursor = asOf;
    for (let i = 0; i < count; i++) {
      dates.push(cursor);
      cursor = addDays(cursor, 1);
    }
    return dates;
  }
  if (rule.mode === "weekly") {
    let cursor = asOf;
    while (weekdayOf(cursor) !== rule.weekday) cursor = addDays(cursor, 1);
    for (let i = 0; i < count; i++) {
      dates.push(cursor);
      cursor = addDays(cursor, 7);
    }
    return dates;
  }
  let year = Number(asOf.slice(0, 4));
  let month = Number(asOf.slice(5, 7));
  const bump = () => {
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  };
  if (Number(asOf.slice(8, 10)) > rule.day) bump();
  for (let i = 0; i < count; i++) {
    dates.push(calendarDate(`${year}-${pad(month)}-${pad(rule.day)}`));
    bump();
  }
  return dates;
}
