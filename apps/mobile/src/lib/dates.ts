// Date <-> CalendarDate glue for the UI layer. CalendarDate is core's timezone-
// free "YYYY-MM-DD"; the native pickers and notifications work in JS `Date`.
// The conversions MUST go through LOCAL midnight, never `toISOString`/UTC, or a
// date shifts a day for anyone east of Greenwich. This is the one home for that
// rule so it can never regress in a copied helper.
//
// (Not every "YYYY-MM-DD" split belongs here: i18n/dates.ts derives a weekday in
// UTC on purpose — a weekday must not move with the timezone — so it keeps its
// own parse.)

import { calendarDate, type CalendarDate } from "@keel/core";

/** Two-digit zero-pad. */
export function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** A `Date` at local midnight -> CalendarDate, using its LOCAL parts. */
export function toCalendarDate(d: Date): CalendarDate {
  return calendarDate(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`);
}

/** A CalendarDate -> `Date` at LOCAL midnight (the native picker's convention). */
export function fromCalendarDate(date: CalendarDate): Date {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(y, m - 1, d);
}

/** The first day of the month `delta` months from `asOf` (may be negative). */
export function monthShifted(asOf: CalendarDate, delta: number): CalendarDate {
  const total = Number(asOf.slice(0, 4)) * 12 + (Number(asOf.slice(5, 7)) - 1) + delta;
  const y = Math.floor(total / 12);
  const m = (total % 12) + 1;
  return calendarDate(`${y}-${pad(m)}-01`);
}

/** A 24h hour as a "HH:00" label. */
export function formatHour(hour: number): string {
  return `${pad(hour)}:00`;
}
